/**
 * @file Render the average APY against the 1-year Treasury yield.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /**
   * Find a required element by id.
   * @param {string} id
   * @returns {HTMLElement}
   */
  const requireElement = (id) => {
    const node = document.getElementById(id);
    if (!(node instanceof HTMLElement)) {
      throw new Error(`Missing element #${id}.`);
    }
    return node;
  };

  /**
   * Format an ISO day as Jun 18, 2026.
   * @param {string | null} day
   * @returns {string}
   */
  const formatDate = (day) => {
    if (!day) {
      return "\u2014";
    }
    const date = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return day;
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  };

  /**
   * Return the simple mean of the total APY values.
   * @param {SnapshotRow[]} rows
   * @returns {number | null}
   */
  const average = (rows) => {
    const values = rows
      .map((row) => row.totalApy)
      .filter(
        (value) => typeof value === "number" && Number.isFinite(value),
      );
    if (!values.length) {
      return null;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  /**
   * Format a percent value.
   * @param {number | null} value
   * @returns {string}
   */
  const percent = (value) =>
    value === null || !Number.isFinite(value) ? "\u2014" : `${value.toFixed(2)}%`;

  /**
   * Format a percent with a plus sign for zero and above.
   * @param {number | null} value
   * @returns {string}
   */
  const signedPercent = (value) =>
    value === null ? "\u2014" : `${value >= 0 ? "+" : ""}${percent(value)}`;

  /**
   * Draw the benchmark values.
   * @param {SnapshotRow[]} rows
   * @param {{ value: number | null, date: string | null }} bond
   * @param {string | null} snapshotDay
   * @returns {void}
   */
  const render = (rows, bond, snapshotDay) => {
    const mean = average(rows);
    const spread = mean !== null && bond.value !== null ? mean - bond.value : null;

    requireElement("benchmark-average").textContent = percent(mean);
    requireElement("benchmark-snapshot-date").textContent = snapshotDay
      ? `Snapshot ${formatDate(snapshotDay)}`
      : "\u2014";

    requireElement("benchmark-bond").textContent = percent(bond.value);
    requireElement("benchmark-bond-date").textContent = bond.date
      ? `Latest ${formatDate(bond.date)}`
      : "Unavailable";

    const spreadNode = requireElement("benchmark-spread");
    spreadNode.textContent = signedPercent(spread);
    spreadNode.classList.toggle("is-positive", spread !== null && spread >= 0);
    spreadNode.classList.toggle("is-negative", spread !== null && spread < 0);
  };

  ns.benchmark = { render };
})();
