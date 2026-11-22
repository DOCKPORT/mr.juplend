/**
 * @file Build the three tables from one snapshot.
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
   * Format a token amount.
   * @param {number | null} value
   * @returns {string}
   */
  const amount = (value) => {
    if (value === null || !Number.isFinite(value)) {
      return "\u2014";
    }
    const units = [
      ["T", 1e12],
      ["B", 1e9],
      ["M", 1e6],
      ["K", 1e3],
    ];
    for (const [suffix, size] of units) {
      if (Math.abs(value) >= size) {
        return `${(value / size).toFixed(2)}${suffix}`;
      }
    }
    return value.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  /**
   * Format a percent value.
   * @param {number | null} value
   * @returns {string}
   */
  const percent = (value) =>
    value === null || !Number.isFinite(value) ? "\u2014" : `${value.toFixed(2)}%`;

  /**
   * Format a ratio.
   * @param {number | null} value
   * @returns {string}
   */
  const ratio = (value) =>
    value === null || !Number.isFinite(value) ? "\u2014" : value.toFixed(4);

  /**
   * Format a whole count.
   * @param {number | null} value
   * @returns {string}
   */
  const count = (value) =>
    value === null || !Number.isFinite(value) ? "\u2014" : String(value);

  /**
   * Fill one table body.
   * @param {string} bodyId
   * @param {string} emptyId
   * @param {Array<Array<string>>} rows
   * @param {number} [highlightIndex]
   * @returns {void}
   */
  const fill = (bodyId, emptyId, rows, highlightIndex = -1) => {
    const body = requireElement(bodyId);
    const empty = requireElement(emptyId);
    body.replaceChildren();

    empty.hidden = rows.length > 0;
    if (!rows.length) {
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const cells of rows) {
      const tr = document.createElement("tr");
      cells.forEach((text, index) => {
        const td = document.createElement("td");
        td.textContent = text;
        if (index > 0) {
          td.classList.add("is-numeric");
        }
        if (index === highlightIndex) {
          td.classList.add("is-positive");
        }
        tr.append(td);
      });
      fragment.append(tr);
    }
    body.append(fragment);
  };

  /**
   * Draw the rates table.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderRates = (rows) => {
    fill(
      "rates-rows",
      "rates-empty",
      rows.map((row) => [
        row.symbol,
        row.name,
        percent(row.supplyApy),
        percent(row.rewardsApy),
        percent(row.totalApy),
        percent(row.borrowApy),
      ]),
      4,
    );
  };

  /**
   * Sort rows by one numeric field, biggest first. Null values go last.
   * @param {SnapshotRow[]} rows
   * @param {(row: SnapshotRow) => number | null} pick
   * @returns {SnapshotRow[]}
   */
  const sortedDesc = (rows, pick) =>
    [...rows].sort((a, b) => {
      const left = pick(a);
      const right = pick(b);
      return (right ?? -Infinity) - (left ?? -Infinity);
    });

  /**
   * Draw the pool table.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderPool = (rows) => {
    const sorted = sortedDesc(rows, (row) => row.totalAssets);
    fill(
      "pool-rows",
      "pool-empty",
      sorted.map((row) => [
        row.symbol,
        amount(row.totalAssets),
        amount(row.totalSupply),
        ratio(row.assetsPerShare),
        ratio(row.sharesPerAsset),
        count(row.campaigns),
      ]),
    );
  };

  /**
   * Return the color class for a utilization value.
   * @param {number | null} value
   * @returns {string}
   */
  const utilizationClass = (value) => {
    if (value === null || !Number.isFinite(value)) {
      return "";
    }
    if (value < 50) {
      return "util-low";
    }
    if (value < 70) {
      return "util-mid";
    }
    if (value < 90) {
      return "util-high";
    }
    return "util-critical";
  };

  /**
   * Draw the liquidity table.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderLiquidity = (rows) => {
    const sorted = sortedDesc(rows, (row) => row.earnSupply);
    fill(
      "liquidity-rows",
      "liquidity-empty",
      sorted.map((row) => [
        row.symbol,
        amount(row.earnSupply),
        amount(row.collateralSupply),
        amount(row.totalLiquiditySupply),
        amount(row.totalBorrowed),
        percent(row.utilization),
      ]),
    );

    const body = requireElement("liquidity-rows");
    sorted.forEach((row, index) => {
      const tr = body.children[index];
      const cell = tr instanceof HTMLElement ? tr.children[5] : null;
      const className = utilizationClass(row.utilization);
      if (cell instanceof HTMLElement && className) {
        cell.classList.add(className);
      }
    });
  };

  /**
   * Draw all three tables.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderAll = (rows) => {
    renderRates(rows);
    renderPool(rows);
    renderLiquidity(rows);
  };

  ns.render = { renderAll };
})();
