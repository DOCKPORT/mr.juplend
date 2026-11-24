/**
 * @file Page bootstrap. Load the snapshot and draw the tables.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /**
   * @param {"loading" | "ready" | "error"} state
   * @returns {void}
   */
  const setAppState = (state) => {
    document.documentElement.dataset.appState = state;
  };

  /**
   * @param {string} text
   * @param {"info" | "error"} [tone]
   * @returns {void}
   */
  const setStatus = (text, tone = "info") => {
    const node = document.getElementById("status");
    if (node instanceof HTMLElement) {
      node.textContent = text;
      node.dataset.tone = tone;
    }
  };

  /**
   * @param {string} text
   * @returns {void}
   */
  const setUpdated = (text) => {
    const node = document.getElementById("updated");
    if (node instanceof HTMLElement) {
      node.textContent = text;
    }
  };

  /**
   * @param {string} id
   * @param {string} text
   * @param {"info" | "error"} [tone]
   * @returns {void}
   */
  const setChartStatus = (id, text, tone = "info") => {
    const node = document.getElementById(id);
    if (node instanceof HTMLElement) {
      node.textContent = text;
      node.dataset.tone = tone;
    }
  };

  /**
   * @param {string | null} iso
   * @returns {string}
   */
  const formatUpdated = (iso) => {
    if (!iso) {
      return "Updated \u2014";
    }
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return "Updated \u2014";
    }
    const day = date.toISOString().slice(0, 10);
    const time = date.toISOString().slice(11, 16);
    return `Updated ${day} ${time} UTC`;
  };

  /**
   * @returns {void}
   */
  const stampYear = () => {
    const node = document.getElementById("footer-year");
    if (node instanceof HTMLElement) {
      node.textContent = `\u00A9 ${new Date().getFullYear()}`;
    }
  };

  /**
   * @returns {void}
   */
  const stampVersion = () => {
    const node = document.getElementById("footer-version");
    if (node instanceof HTMLElement && typeof ns.version === "string") {
      node.textContent = ns.version;
    }
  };

  /**
   * @returns {Promise<void>}
   */
  const start = async () => {
    stampYear();
    stampVersion();

    if (window.matchMedia("(max-width: 768px)").matches) {
      setAppState("ready");
      return;
    }

    const config = /** @type {{ readToken?: string } | undefined} */ (
      ns.config
    );
    const api = /** @type {{ fetchLatest: () => Promise<Snapshot>, fetchHistory: () => Promise<HistoryRow[]>, fetchPoolHistory: () => Promise<PoolHistoryRow[]>, fetchLiquidityHistory: () => Promise<LiquidityHistoryRow[]>, fetchBondYield: () => Promise<BondYield> } | undefined} */ (
      ns.api
    );
    const render = /** @type {{ renderAll: (rows: SnapshotRow[]) => void } | undefined} */ (
      ns.render
    );
    const chart = /** @type {{ renderRates: (rows: HistoryRow[]) => void, renderPool: (rows: PoolHistoryRow[]) => void, renderLiquidity: (rows: LiquidityHistoryRow[]) => void } | undefined} */ (
      ns.chart
    );
    const benchmark = /** @type {{ render: (rows: SnapshotRow[], bond: BondYield, day: string | null) => void } | undefined} */ (
      ns.benchmark
    );

    if (!api || !render) {
      setAppState("error");
      setStatus("The page scripts did not load.", "error");
      return;
    }

    if (!config || !config.readToken) {
      setAppState("error");
      setStatus(
        "Add the Turso read token to modules/ui/js/config.js.",
        "error",
      );
      render.renderAll([]);
      chart?.renderRates([]);
      chart?.renderPool([]);
      chart?.renderLiquidity([]);
      benchmark?.render([], { value: null, date: null }, null);
      return;
    }

    setStatus("Loading the latest snapshot.");
    try {
      const [
        snapshotResult,
        historyResult,
        poolHistoryResult,
        liquidityHistoryResult,
        bondResult,
      ] = await Promise.allSettled([
        api.fetchLatest(),
        api.fetchHistory(),
        api.fetchPoolHistory(),
        api.fetchLiquidityHistory(),
        api.fetchBondYield(),
      ]);
      if (snapshotResult.status === "rejected") {
        throw snapshotResult.reason;
      }

      const snapshot = snapshotResult.value;
      render.renderAll(snapshot.rows);
      setUpdated(formatUpdated(snapshot.fetchedAt));

      if (!snapshot.rows.length) {
        setStatus("The database has no snapshot yet.");
      } else {
        setStatus("");
      }

      /**
       * Draw one history chart and set its status line.
       * @param {PromiseSettledResult<object[]>} result
       * @param {string} id
       * @param {(rows: object[]) => void} draw
       * @returns {void}
       */
      const applyHistory = (result, id, draw) => {
        if (result.status !== "fulfilled") {
          console.error(result.reason);
          setChartStatus(id, "History failed to load.", "error");
          return;
        }
        draw(result.value);
        setChartStatus(id, "");
      };

      applyHistory(historyResult, "chart-status", (rows) =>
        chart?.renderRates(rows),
      );
      applyHistory(poolHistoryResult, "pool-chart-status", (rows) =>
        chart?.renderPool(rows),
      );
      applyHistory(liquidityHistoryResult, "liquidity-chart-status", (rows) =>
        chart?.renderLiquidity(rows),
      );

      const bond =
        bondResult.status === "fulfilled"
          ? bondResult.value
          : { value: null, date: null };
      if (bondResult.status === "rejected") {
        console.error(bondResult.reason);
      }
      benchmark?.render(snapshot.rows, bond, snapshot.day);

      setAppState("ready");
    } catch (error) {
      console.error(error);
      setAppState("error");
      setStatus(
        error instanceof Error ? error.message : "The snapshot failed to load.",
        "error",
      );
      setChartStatus("chart-status", "History failed to load.", "error");
      setChartStatus("pool-chart-status", "History failed to load.", "error");
      setChartStatus("liquidity-chart-status", "History failed to load.", "error");
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
})();
