/**
 * @file Small statistics helpers for the charts.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown> }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /**
   * Return the simple mean, ignoring null and non-finite values.
   * @param {Array<number | null>} values
   * @returns {number | null}
   */
  const mean = (values) => {
    let sum = 0;
    let count = 0;
    for (const value of values) {
      if (typeof value === "number" && Number.isFinite(value)) {
        sum += value;
        count += 1;
      }
    }
    return count > 0 ? sum / count : null;
  };

  ns.avg = { mean };
})();
