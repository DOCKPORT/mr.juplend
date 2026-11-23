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
 * @typedef {object} BondYield
 * @property {number | null} value
 * @property {string | null} date
 */

/**
 * @file Read the latest snapshot from Turso over HTTP.
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

  /** Convert libsql and turso URLs to the HTTPS API URL. */
  const httpUrl = (url) => {
    const clean = String(url || "")
      .trim()
      .replace(/\/+$/, "");
    return clean.replace(/^(libsql|turso):\/\//, "https://");
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
   * Run one SQL statement and return the rows.
   * @param {string} sql
   * @param {Array<{ type: string, value?: unknown }>} args
   * @returns {Promise<unknown[][]>}
   */
  const query = async (sql, args) => {
    const config = /** @type {{ tursoUrl: string, readToken: string }} */ (
      ns.config
    );
    const response = await fetch(`${httpUrl(config.tursoUrl)}/v2/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.readToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          { type: "execute", stmt: { sql, args } },
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
   * Read the newest day and its rows from all three tables.
   * @returns {Promise<Snapshot>}
   */
  const fetchLatest = async () => {
    const dayRows = await query(
      "SELECT MAX(substr(fetched_at, 1, 10)) AS day FROM Rates",
      [],
    );
    const day = dayRows.length && dayRows[0].length ? dayRows[0][0] : null;
    if (!day) {
      return { day: null, fetchedAt: null, rows: [] };
    }

    const rows = await query(
      `SELECT
         r.symbol, r.name, r.supply_apy, r.rewards_apy, r.total_apy,
         r.borrow_apy, r.fetched_at,
         p.total_assets, p.total_supply, p.assets_per_share,
         p.shares_per_asset, p.campaigns,
         l.earn_supply, l.collateral_supply, l.total_liquidity_supply,
         l.total_borrowed, l.utilization
       FROM Rates r
       LEFT JOIN Pool p
         ON p.symbol = r.symbol AND substr(p.fetched_at, 1, 10) = ?
       LEFT JOIN Liquidity l
         ON l.symbol = r.symbol AND substr(l.fetched_at, 1, 10) = ?
       WHERE substr(r.fetched_at, 1, 10) = ?
       ORDER BY r.total_apy DESC`,
      [
        { type: "text", value: day },
        { type: "text", value: day },
        { type: "text", value: day },
      ],
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
   * Read every day of the Rates table, oldest first.
   * @returns {Promise<HistoryRow[]>}
   */
  const fetchHistory = async () => {
    const rows = await query(
      `SELECT substr(fetched_at, 1, 10) AS day, symbol, total_apy
       FROM Rates
       ORDER BY day ASC, symbol ASC`,
      [],
    );

    return rows.map((row) => ({
      day: String(row[0] ?? ""),
      symbol: String(row[1] ?? ""),
      totalApy: /** @type {number | null} */ (row[2]),
    }));
  };

  /**
   * Read every day of the Pool table, oldest first.
   * @returns {Promise<PoolHistoryRow[]>}
   */
  const fetchPoolHistory = async () => {
    const rows = await query(
      `SELECT substr(fetched_at, 1, 10) AS day, symbol, total_assets
       FROM Pool
       ORDER BY day ASC, symbol ASC`,
      [],
    );

    return rows.map((row) => ({
      day: String(row[0] ?? ""),
      symbol: String(row[1] ?? ""),
      totalAssets: /** @type {number | null} */ (row[2]),
    }));
  };

  /**
   * Read every day of the Liquidity table, oldest first.
   * @returns {Promise<LiquidityHistoryRow[]>}
   */
  const fetchLiquidityHistory = async () => {
    const rows = await query(
      `SELECT substr(fetched_at, 1, 10) AS day, symbol, utilization
       FROM Liquidity
       ORDER BY day ASC, symbol ASC`,
      [],
    );

    return rows.map((row) => ({
      day: String(row[0] ?? ""),
      symbol: String(row[1] ?? ""),
      utilization: /** @type {number | null} */ (row[2]),
    }));
  };

  /** The Treasury series file. */
  const BOND_URL =
    "https://raw.githubusercontent.com/DOCKPORT/Ez-Fred/main/Data/ustreasuries.json";

  /**
   * Read the latest 1-year Treasury yield. Nothing is stored.
   * @returns {Promise<BondYield>}
   */
  const fetchBondYield = async () => {
    const response = await fetch(BOND_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Bond data returned HTTP ${response.status}.`);
    }

    const payload = await response.json();
    const latest = payload?.series?.DGS1?.latest;
    const value = Number(latest?.value);

    return {
      value: Number.isFinite(value) ? value : null,
      date: typeof latest?.date === "string" ? latest.date : null,
    };
  };

  ns.api = {
    fetchLatest,
    fetchHistory,
    fetchPoolHistory,
    fetchLiquidityHistory,
    fetchBondYield,
  };
})();
