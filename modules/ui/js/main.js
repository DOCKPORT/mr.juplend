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

    const config = /** @type {{ readToken?: string } | undefined} */ (
      ns.config
    );
    const api = /** @type {{ fetchLatest: () => Promise<Snapshot> } | undefined} */ (
      ns.api
    );
    const render = /** @type {{ renderAll: (rows: SnapshotRow[]) => void } | undefined} */ (
      ns.render
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
      return;
    }

    setStatus("Loading the latest snapshot.");
    try {
      const snapshot = await api.fetchLatest();
      render.renderAll(snapshot.rows);
      setUpdated(formatUpdated(snapshot.fetchedAt));

      if (!snapshot.rows.length) {
        setStatus("The database has no snapshot yet.");
      } else {
        setStatus(`Snapshot ${snapshot.day}. ${snapshot.rows.length} assets.`);
      }
      setAppState("ready");
    } catch (error) {
      console.error(error);
      setAppState("error");
      setStatus(
        error instanceof Error ? error.message : "The snapshot failed to load.",
        "error",
      );
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    void start();
  }
})();
