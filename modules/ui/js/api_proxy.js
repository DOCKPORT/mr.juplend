/**
 * @file Browser client for the Vercel Turso proxy.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /** One shared request for the whole page. */
  let payloadPromise = null;

  const load = () => {
    if (!payloadPromise) {
      payloadPromise = fetch("/api/turso_data", {
        headers: { Accept: "application/json" },
      }).then(async (response) => {
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(
            body.error || `Data returned HTTP ${response.status}.`,
          );
        }
        return response.json();
      });
    }
    return payloadPromise;
  };

  /** @returns {Promise<Snapshot>} */
  const fetchLatest = async () => {
    const payload = await load();
    return {
      day: payload.day ?? null,
      fetchedAt: payload.fetchedAt ?? null,
      rows: Array.isArray(payload.rows) ? payload.rows : [],
    };
  };

  /** @returns {Promise<HistoryRow[]>} */
  const fetchHistory = async () => {
    const payload = await load();
    return Array.isArray(payload.rates) ? payload.rates : [];
  };

  /** @returns {Promise<PoolHistoryRow[]>} */
  const fetchPoolHistory = async () => {
    const payload = await load();
    return Array.isArray(payload.pool) ? payload.pool : [];
  };

  /** @returns {Promise<LiquidityHistoryRow[]>} */
  const fetchLiquidityHistory = async () => {
    const payload = await load();
    return Array.isArray(payload.liquidity) ? payload.liquidity : [];
  };

  ns.proxy = {
    fetchLatest,
    fetchHistory,
    fetchPoolHistory,
    fetchLiquidityHistory,
  };
})();
