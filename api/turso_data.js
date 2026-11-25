"use strict";

/**
 * Turso data proxy.
 *
 * Reads the database URL and read token from Vercel environment
 * variables. The browser gets rows only; it never sees either value.
 */

const PIPELINE = "/v2/pipeline";
const TIMEOUT_MS = 15000;

const PLOT_SYMBOLS = [
  "USDC",
  "USDT",
  "USDS",
  "USDG",
  "USDGO",
  "JupUSD",
  "SOL",
  "EURC",
];

const PLOT_COLUMNS = "usdc, usdt, usds, usdg, usdgo, jupusd, sol, eurc";

function normalizeUrl(url) {
  const clean = String(url || "")
    .trim()
    .replace(/\/+$/, "");
  return clean.replace(/^(libsql|turso):\/\//, "https://");
}

function valueCell(value) {
  if (value === null || value === undefined) {
    return { type: "null" };
  }
  if (typeof value === "number") {
    return { type: "float", value };
  }
  return { type: "text", value: String(value) };
}

function cellValue(cell) {
  if (!cell || cell.type === "null") {
    return null;
  }
  if (cell.type === "integer" || cell.type === "float") {
    const value = Number(cell.value);
    return Number.isFinite(value) ? value : null;
  }
  return cell.value ?? null;
}

async function query(url, token, sql, args = []) {
  const response = await fetch(`${normalizeUrl(url)}${PIPELINE}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          type: "execute",
          stmt: { sql, args: args.map(valueCell) },
        },
        { type: "close" },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Turso HTTP ${response.status}`);
  }

  const payload = await response.json();
  const results = Array.isArray(payload.results) ? payload.results : [];
  const first = results[0];
  if (!first || first.type === "error") {
    const message =
      (first && first.error && first.error.message) || "query failed";
    throw new Error(message);
  }

  const rows =
    (first.response && first.response.result && first.response.result.rows) ||
    [];
  return rows.map((row) => row.map(cellValue));
}

function expandHistory(rows, valueKey) {
  return rows.flatMap((row) => {
    const timestamp = String(row[0] ?? "");
    const day = timestamp.slice(0, 10);
    return PLOT_SYMBOLS.map((symbol, index) => ({
      day,
      symbol,
      [valueKey]: row[index + 1],
    }));
  });
}

async function loadHistory(url, token, table, bankTable, column, valueKey) {
  try {
    const rows = await query(
      url,
      token,
      `SELECT fetched_at, ${PLOT_COLUMNS} FROM ${table} ORDER BY fetched_at ASC`,
    );
    if (rows.length) {
      return expandHistory(rows, valueKey);
    }
  } catch (error) {
    // The plot table may not exist yet. Use the bank table instead.
    console.error("Plot history read failed:", error.message);
  }

  const fallback = await query(
    url,
    token,
    `SELECT substr(fetched_at, 1, 10) AS day, symbol, ${column}
     FROM ${bankTable}
     ORDER BY day ASC, symbol ASC`,
  );
  return fallback.map((row) => ({
    day: String(row[0] ?? ""),
    symbol: String(row[1] ?? ""),
    [valueKey]: row[2],
  }));
}

async function loadLatest(url, token) {
  let day = null;
  let fetchedAt = null;

  const meta = await query(
    url,
    token,
    "SELECT latest_day, latest_fetched_at FROM Meta WHERE id = 1",
  ).catch((error) => {
    // The Meta table may not exist yet. Use the newest bank row instead.
    console.error("Meta read failed:", error.message);
    return [];
  });
  if (meta.length && meta[0].length) {
    day = meta[0][0] ? String(meta[0][0]) : null;
    fetchedAt = meta[0][1] ? String(meta[0][1]) : null;
  }

  if (!day) {
    const latest = await query(
      url,
      token,
      "SELECT fetched_at FROM RatesBank ORDER BY fetched_at DESC LIMIT 1",
    );
    if (latest.length && latest[0][0]) {
      fetchedAt = String(latest[0][0]);
      day = fetchedAt.slice(0, 10);
    }
  }

  if (!day) {
    return { day: null, fetchedAt: null, rows: [] };
  }

  const rows = await query(
    url,
    token,
    `SELECT
       r.symbol, r.name, r.supply_apy, r.rewards_apy, r.total_apy,
       r.borrow_apy, r.fetched_at,
       p.total_assets, p.total_supply, p.assets_per_share,
       p.shares_per_asset, p.campaigns,
       l.earn_supply, l.collateral_supply, l.total_liquidity_supply,
       l.total_borrowed, l.utilization
     FROM RatesBank r
     LEFT JOIN PoolBank p
       ON p.symbol = r.symbol AND substr(p.fetched_at, 1, 10) = ?
     LEFT JOIN LiquidityBank l
       ON l.symbol = r.symbol AND substr(l.fetched_at, 1, 10) = ?
     WHERE substr(r.fetched_at, 1, 10) = ?
     ORDER BY r.total_apy DESC`,
    [day, day, day],
  );

  const mapped = rows.map((row) => ({
    symbol: String(row[0] ?? ""),
    name: String(row[1] ?? ""),
    supplyApy: row[2],
    rewardsApy: row[3],
    totalApy: row[4],
    borrowApy: row[5],
    fetchedAt: String(row[6] ?? ""),
    totalAssets: row[7],
    totalSupply: row[8],
    assetsPerShare: row[9],
    sharesPerAsset: row[10],
    campaigns: row[11],
    earnSupply: row[12],
    collateralSupply: row[13],
    totalLiquiditySupply: row[14],
    totalBorrowed: row[15],
    utilization: row[16],
  }));

  return {
    day,
    fetchedAt: fetchedAt || (mapped.length ? mapped[0].fetchedAt : null),
    rows: mapped,
  };
}

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    response.status(405).json({ error: "Method not allowed." });
    return;
  }

  const url = process.env.TURSO_URL;
  const token = process.env.TURSO_READ;

  if (!url || !token) {
    response.status(500).json({ error: "Data source is not configured." });
    return;
  }

  try {
    const [latest, rates, pool, liquidity] = await Promise.all([
      loadLatest(url, token),
      loadHistory(
        url,
        token,
        "RatesTotalAPYPlot",
        "RatesBank",
        "total_apy",
        "totalApy",
      ),
      loadHistory(
        url,
        token,
        "PoolTotalAssetsPlot",
        "PoolBank",
        "total_assets",
        "totalAssets",
      ),
      loadHistory(
        url,
        token,
        "LiquidityUtilizationPlot",
        "LiquidityBank",
        "utilization",
        "utilization",
      ),
    ]);

    response.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=3600",
    );
    response.status(200).json({
      day: latest.day,
      fetchedAt: latest.fetchedAt,
      rows: latest.rows,
      rates,
      pool,
      liquidity,
    });
  } catch (error) {
    console.error("Turso data request failed:", error.message);
    response.status(502).json({ error: "Data is unavailable." });
  }
};
