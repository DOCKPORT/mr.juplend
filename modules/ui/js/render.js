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
   * @returns {void}
   */
  const fill = (bodyId, emptyId, rows) => {
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
    );
  };

  /**
   * Draw the pool table.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderPool = (rows) => {
    fill(
      "pool-rows",
      "pool-empty",
      rows.map((row) => [
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
   * Draw the liquidity table.
   * @param {SnapshotRow[]} rows
   * @returns {void}
   */
  const renderLiquidity = (rows) => {
    fill(
      "liquidity-rows",
      "liquidity-empty",
      rows.map((row) => [
        row.symbol,
        amount(row.earnSupply),
        amount(row.collateralSupply),
        amount(row.totalLiquiditySupply),
        amount(row.totalBorrowed),
        percent(row.utilization),
      ]),
    );
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
