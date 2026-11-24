/**
 * @file Direct Turso reads for local development.
 */

/**
 * @typedef {object} HistoryRow
 * @property {string} day
 * @property {string} symbol
 * @property {number | null} totalApy
 */

/**
 * @typedef {object} PoolHistoryRow
 * @property {string} day
 * @property {string} symbol
 * @property {number | null} totalAssets
 */

/**
 * @typedef {object} LiquidityHistoryRow
 * @property {string} day
 * @property {string} symbol
 * @property {number | null} utilization
 */

/**
 * @typedef {object} SnapshotRow
 * @property {string} symbol
 * @property {string} name
 * @property {number | null} supplyApy
 * @property {number | null} rewardsApy
 * @property {number | null} totalApy
 * @property {number | null} borrowApy
 * @property {string} fetchedAt
 * @property {number | null} totalAssets
 * @property {number | null} totalSupply
 * @property {number | null} assetsPerShare
 * @property {number | null} sharesPerAsset
 * @property {number | null} campaigns
 * @property {number | null} earnSupply
 * @property {number | null} collateralSupply
 * @property {number | null} totalLiquiditySupply
 * @property {number | null} totalBorrowed
 * @property {number | null} utilization
 */

/**
 * @typedef {object} Snapshot
 * @property {string | null} day
 * @property {string | null} fetchedAt
 * @property {SnapshotRow[]} rows
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /** Plot history table assets, in column order. */
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

  const PLOT_COLUMNS =
    "usdc, usdt, usds, usdg, usdgo, jupusd, sol, eurc";

  /** Convert libsql and turso URLs to the HTTPS API URL. */
  const httpUrl = (url) => {
    const clean = String(url || "")
      .trim()
      .replace(/\/+$/, "");
    return clean.replace(/^(libsql|turso):\/\//, "https://");
  };

  /**
   * Convert one argument to a Turso cell.
   * @param {unknown} value
   * @returns {{ type: string, value?: unknown }}
   */
  const valueCell = (value) => {
    if (value === null || value === undefined) {
      return { type: "null" };
    }
    if (typeof value === "number") {
      return { type: "float", value };
    }
    return { type: "text", value: String(value) };
  };

  /**
   * Read one cell from the Turso response.
   * @param {{ type?: string, value?: unknown }} cell
   * @returns {unknown}
   */
  const cellValue = (cell) => {
    if (!cell || cell.type === "null") {
      return null;
    }
    if (cell.type === "integer" || cell.type === "float") {
      const value = Number(cell.value);
      return Number.isFinite(value) ? value : null;
    }
    return cell.value ?? null;
  };

  /**
   * Run one SQL statement directly.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @param {string} sql
   * @param {unknown[]} args
   * @returns {Promise<unknown[][]>}
   */
  const query = async (config, sql, args) => {
    const response = await fetch(`${httpUrl(config.tursoUrl)}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args: args.map(valueCell) } },
          { type: "close" },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Turso returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const results = Array.isArray(payload.results) ? payload.results : [];
    const first = results[0];
    if (!first || first.type === "error") {
      const message =
        (first && first.error && first.error.message) || "unknown error";
      throw new Error(`Query failed: ${message}`);
    }

    const rows =
      (first.response && first.response.result && first.response.result.rows) ||
      [];
    return rows.map((row) => row.map(cellValue));
  };

  /**
   * Expand plot history rows into one row per asset.
   * @param {unknown[][]} rows
   * @param {string} valueKey
   * @returns {object[]}
   */
  const expandPlot = (rows, valueKey) =>
    rows.flatMap((row) => {
      const timestamp = String(row[0] ?? "");
      const day = timestamp.slice(0, 10);
      return PLOT_SYMBOLS.map((symbol, index) => ({
        day,
        symbol,
        [valueKey]: row[index + 1],
      }));
    });

  /**
   * Read one plot history table, with a fallback to the bank table.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @param {string} table
   * @param {string} valueKey
   * @param {() => Promise<object[]>} fallback
   * @returns {Promise<object[]>}
   */
  const fetchPlotHistory = async (config, table, valueKey, fallback) => {
    try {
      const rows = await query(
        config,
        `SELECT fetched_at, ${PLOT_COLUMNS} FROM ${table} ORDER BY fetched_at ASC`,
        [],
      );
      if (rows.length) {
        return expandPlot(rows, valueKey);
      }
    } catch (error) {
      // The plot table may not exist yet. Use the normalized query.
    }
    return fallback();
  };

  /**
   * Read the newest day and its rows.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @returns {Promise<Snapshot>}
   */
  const fetchLatest = async (config) => {
    let day = null;
    try {
      const metaRows = await query(
        config,
        "SELECT latest_day FROM Meta WHERE id = 1",
        [],
      );
      if (metaRows.length && metaRows[0].length) {
        day = metaRows[0][0];
      }
    } catch (error) {
      day = null;
    }

    if (!day) {
      const dayRows = await query(
        config,
        "SELECT MAX(substr(fetched_at, 1, 10)) AS day FROM RatesBank",
        [],
      );
      day = dayRows.length && dayRows[0].length ? dayRows[0][0] : null;
    }

    if (!day) {
      return { day: null, fetchedAt: null, rows: [] };
    }

    const rows = await query(
      config,
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
      supplyApy: /** @type {number | null} */ (row[2]),
      rewardsApy: /** @type {number | null} */ (row[3]),
      totalApy: /** @type {number | null} */ (row[4]),
      borrowApy: /** @type {number | null} */ (row[5]),
      fetchedAt: String(row[6] ?? ""),
      totalAssets: /** @type {number | null} */ (row[7]),
      totalSupply: /** @type {number | null} */ (row[8]),
      assetsPerShare: /** @type {number | null} */ (row[9]),
      sharesPerAsset: /** @type {number | null} */ (row[10]),
      campaigns: /** @type {number | null} */ (row[11]),
      earnSupply: /** @type {number | null} */ (row[12]),
      collateralSupply: /** @type {number | null} */ (row[13]),
      totalLiquiditySupply: /** @type {number | null} */ (row[14]),
      totalBorrowed: /** @type {number | null} */ (row[15]),
      utilization: /** @type {number | null} */ (row[16]),
    }));

    return {
      day: String(day),
      fetchedAt: mapped.length ? mapped[0].fetchedAt : null,
      rows: mapped,
    };
  };

  /**
   * Read every day of the RatesBank table.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @returns {Promise<HistoryRow[]>}
   */
  const fetchHistory = (config) =>
    fetchPlotHistory(
      config,
      "RatesTotalAPYPlot",
      "totalApy",
      async () => {
        const rows = await query(
          config,
          `SELECT substr(fetched_at, 1, 10) AS day, symbol, total_apy
           FROM RatesBank
           ORDER BY day ASC, symbol ASC`,
          [],
        );
        return rows.map((row) => ({
          day: String(row[0] ?? ""),
          symbol: String(row[1] ?? ""),
          totalApy: /** @type {number | null} */ (row[2]),
        }));
      },
    );

  /**
   * Read every day of the PoolBank table.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @returns {Promise<PoolHistoryRow[]>}
   */
  const fetchPoolHistory = (config) =>
    fetchPlotHistory(
      config,
      "PoolTotalAssetsPlot",
      "totalAssets",
      async () => {
        const rows = await query(
          config,
          `SELECT substr(fetched_at, 1, 10) AS day, symbol, total_assets
           FROM PoolBank
           ORDER BY day ASC, symbol ASC`,
          [],
        );
        return rows.map((row) => ({
          day: String(row[0] ?? ""),
          symbol: String(row[1] ?? ""),
          totalAssets: /** @type {number | null} */ (row[2]),
        }));
      },
    );

  /**
   * Read every day of the LiquidityBank table.
   * @param {{ tursoUrl: string, readToken: string }} config
   * @returns {Promise<LiquidityHistoryRow[]>}
   */
  const fetchLiquidityHistory = (config) =>
    fetchPlotHistory(
      config,
      "LiquidityUtilizationPlot",
      "utilization",
      async () => {
        const rows = await query(
          config,
          `SELECT substr(fetched_at, 1, 10) AS day, symbol, utilization
           FROM LiquidityBank
           ORDER BY day ASC, symbol ASC`,
          [],
        );
        return rows.map((row) => ({
          day: String(row[0] ?? ""),
          symbol: String(row[1] ?? ""),
          utilization: /** @type {number | null} */ (row[2]),
        }));
      },
    );

  ns.direct = {
    fetchLatest,
    fetchHistory,
    fetchPoolHistory,
    fetchLiquidityHistory,
  };
})();
