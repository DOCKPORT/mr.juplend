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
   * @returns {Promise<void>}
   */
  const start = async () => {
    stampYear();

    if (window.matchMedia("(max-width: 768px)").matches) {
      setAppState("ready");
      return;
    }

    const config = /** @type {{ readToken?: string } | undefined} */ (
      ns.config
    );
    const api = /** @type {{ fetchLatest: () => Promise<Snapshot>, fetchHistory: () => Promise<HistoryRow[]>, fetchPoolHistory: () => Promise<PoolHistoryRow[]> } | undefined} */ (
      ns.api
    );
    const render = /** @type {{ renderAll: (rows: SnapshotRow[]) => void } | undefined} */ (
      ns.render
    );
    const chart = /** @type {{ renderRates: (rows: HistoryRow[]) => void, renderPool: (rows: PoolHistoryRow[]) => void } | undefined} */ (
      ns.chart
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
      return;
    }

    setStatus("Loading the latest snapshot.");
    try {
      const [snapshotResult, historyResult, poolHistoryResult] =
        await Promise.allSettled([
          api.fetchLatest(),
          api.fetchHistory(),
          api.fetchPoolHistory(),
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
        setStatus(`Snapshot ${snapshot.day}. ${snapshot.rows.length} assets.`);
      }

      if (historyResult.status === "fulfilled") {
        if (chart) {
          chart.renderRates(historyResult.value);
        }
        setChartStatus("chart-status", "");
      } else {
        console.error(historyResult.reason);
        setChartStatus("chart-status", "History failed to load.", "error");
      }

      if (poolHistoryResult.status === "fulfilled") {
        if (chart) {
          chart.renderPool(poolHistoryResult.value);
        }
        setChartStatus("pool-chart-status", "");
      } else {
        console.error(poolHistoryResult.reason);
        setChartStatus(
          "pool-chart-status",
          "History failed to load.",
          "error",
        );
      }

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
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
})();
