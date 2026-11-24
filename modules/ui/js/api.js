/**
 * @typedef {object} BondYield
 * @property {number | null} value
 * @property {string | null} date
 */

/**
 * @file Choose the local direct reader or the production proxy.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /**
   * Try to load config.js. Local development uses it; production does not.
   * @returns {Promise<{ tursoUrl: string, readToken: string } | null>}
   */
  const localConfig = () =>
    new Promise((resolve) => {
      let settled = false;
      const finish = (config) => {
        if (!settled) {
          settled = true;
          resolve(config);
        }
      };

      const script = document.createElement("script");
      script.src = "modules/ui/js/config.js";
      script.onload = () => {
        const config = /** @type {{ tursoUrl?: string, readToken?: string }} */ (
          ns.config
        );
        finish(
          config && config.readToken
            ? {
                tursoUrl: String(config.tursoUrl || ""),
                readToken: String(config.readToken),
              }
            : null,
        );
      };
      script.onerror = () => finish(null);
      document.head.append(script);
      page.setTimeout(() => finish(null), 1000);
    });

  const ready = localConfig();

  /** @returns {Promise<{ backend: object, config: { tursoUrl: string, readToken: string } | null }>} */
  const pick = async () => {
    const config = await ready;
    if (config && ns.direct) {
      return { backend: /** @type {object} */ (ns.direct), config };
    }
    if (ns.proxy) {
      return { backend: /** @type {object} */ (ns.proxy), config: null };
    }
    throw new Error("The data client did not load.");
  };

  /** @returns {Promise<Snapshot>} */
  const fetchLatest = async () => {
    const { backend, config } = await pick();
    const reader = /** @type {{ fetchLatest: Function }} */ (backend);
    return config ? reader.fetchLatest(config) : reader.fetchLatest();
  };

  /** @returns {Promise<HistoryRow[]>} */
  const fetchHistory = async () => {
    const { backend, config } = await pick();
    const reader = /** @type {{ fetchHistory: Function }} */ (backend);
    return config ? reader.fetchHistory(config) : reader.fetchHistory();
  };

  /** @returns {Promise<PoolHistoryRow[]>} */
  const fetchPoolHistory = async () => {
    const { backend, config } = await pick();
    const reader = /** @type {{ fetchPoolHistory: Function }} */ (backend);
    return config ? reader.fetchPoolHistory(config) : reader.fetchPoolHistory();
  };

  /** @returns {Promise<LiquidityHistoryRow[]>} */
  const fetchLiquidityHistory = async () => {
    const { backend, config } = await pick();
    const reader = /** @type {{ fetchLiquidityHistory: Function }} */ (backend);
    return config
      ? reader.fetchLiquidityHistory(config)
      : reader.fetchLiquidityHistory();
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
