/**
 * @file Draw the history line charts.
 */

/**
 * @typedef {object} SeriesRow
 * @property {string} day
 * @property {string} symbol
 * @property {number | null} [totalApy]
 * @property {number | null} [totalAssets]
 * @property {number | null} [utilization]
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown>, Chart?: unknown }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /** Fixed colors by symbol. */
  const COLORS = {
    USDC: "#3b82f6",
    USDT: "#22c55e",
    USDS: "#06b6d4",
    USDG: "#f59e0b",
    USDGO: "#ef4444",
    JUPUSD: "#a855f7",
    SOL: "#84cc16",
    EURC: "#ec4899",
  };

  /** Fallback colors for a new symbol. */
  const PALETTE = ["#f97316", "#8b5cf6", "#2dd4bf", "#facc15"];

  /** @type {Map<string, unknown>} */
  const instances = new Map();

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
   * @param {string} day
   * @returns {string}
   */
  const formatDay = (day) => {
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
   * Format a percent value.
   * @param {number} value
   * @returns {string}
   */
  const formatPercent = (value) =>
    Number.isFinite(value) ? `${value.toFixed(2)}%` : "\u2014";

  /**
   * Format a percent axis tick with one decimal place.
   * @param {number} value
   * @returns {string}
   */
  const formatTickPercent = (value) => `${value.toFixed(1)}%`;

  /**
   * Format a token amount.
   * @param {number} value
   * @returns {string}
   */
  const formatAmount = (value) => {
    if (!Number.isFinite(value)) {
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
    return value.toFixed(2);
  };

  /**
   * Build labels and datasets from history rows.
   * @param {SeriesRow[]} rows
   * @param {string} valueKey
   * @returns {{ days: string[], datasets: object[] }}
   */
  const buildSeries = (rows, valueKey) => {
    const days = [...new Set(rows.map((row) => row.day))].sort();
    /** @type {Map<string, Map<string, number | null>>} */
    const values = new Map();

    for (const row of rows) {
      if (!values.has(row.symbol)) {
        values.set(row.symbol, new Map());
      }
      const value = row[valueKey];
      values
        .get(row.symbol)
        ?.set(row.day, typeof value === "number" ? value : null);
    }

    const datasets = [];
    let index = 0;
    for (const [symbol, points] of values) {
      const color =
        COLORS[symbol.toUpperCase()] || PALETTE[index % PALETTE.length];
      datasets.push({
        label: symbol,
        data: days.map((day) => (points.has(day) ? points.get(day) : null)),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        pointHitRadius: 10,
        pointBackgroundColor: color,
        tension: 0.2,
        spanGaps: false,
      });
      index += 1;
    }

    /**
     * Return the newest value in a dataset.
     * @param {object} dataset
     * @returns {number}
     */
    const latest = (dataset) => {
      const data = /** @type {Array<number | null>} */ (dataset.data);
      for (let i = data.length - 1; i >= 0; i -= 1) {
        const value = data[i];
        if (typeof value === "number") {
          return value;
        }
      }
      return -Infinity;
    };

    datasets.sort((left, right) => latest(right) - latest(left));
    return { days, datasets };
  };

  /**
   * Draw one line chart.
   * @param {object} options
   * @param {string} options.canvasId
   * @param {string} options.emptyId
   * @param {SeriesRow[]} options.rows
   * @param {string} options.valueKey
   * @param {(value: number) => string} options.formatValue
   * @param {(value: number) => string} options.formatTick
   * @returns {void}
   */
  const renderLineChart = ({
    canvasId,
    emptyId,
    rows,
    valueKey,
    formatValue,
    formatTick,
  }) => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (
      document.getElementById(canvasId)
    );
    const empty = requireElement(emptyId);
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error(`Missing element #${canvasId}.`);
    }

    const ChartCtor = page.Chart;
    if (typeof ChartCtor !== "function") {
      throw new Error("The chart library did not load.");
    }

    const previous = instances.get(canvasId);
    if (previous instanceof ChartCtor) {
      previous.destroy();
      instances.delete(canvasId);
    }

    if (!rows.length) {
      canvas.hidden = true;
      empty.hidden = false;
      return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const { days, datasets } = buildSeries(rows, valueKey);
    const chart = new ChartCtor(canvas, {
      type: "line",
      data: { labels: days.map(formatDay), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: {
              color: "#c6c6cd",
              boxWidth: 12,
              boxHeight: 2,
              usePointStyle: false,
              font: { size: 14 },
            },
          },
          tooltip: {
            titleFont: { size: 14 },
            bodyFont: { size: 14 },
            itemSort: (left, right) => {
              const a = Number(left.parsed.y);
              const b = Number(right.parsed.y);
              const leftValue = Number.isFinite(a) ? a : -Infinity;
              const rightValue = Number.isFinite(b) ? b : -Infinity;
              return rightValue - leftValue;
            },
            callbacks: {
              label: (context) =>
                `${context.dataset.label}: ${formatValue(
                  Number(context.parsed.y),
                )}`,
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { display: false },
          },
          y: {
            grid: { color: "rgba(198, 198, 205, 0.08)" },
            ticks: {
              color: "#86868f",
              font: { size: 13 },
              callback: (value) => formatTick(Number(value)),
            },
          },
        },
      },
    });
    instances.set(canvasId, chart);
  };

  /**
   * Draw the Total APY history chart.
   * @param {SeriesRow[]} rows
   * @returns {void}
   */
  const renderRates = (rows) => {
    renderLineChart({
      canvasId: "rates-chart",
      emptyId: "chart-empty",
      rows,
      valueKey: "totalApy",
      formatValue: formatPercent,
      formatTick: formatTickPercent,
    });
  };

  /**
   * Draw the Total Assets history chart.
   * @param {SeriesRow[]} rows
   * @returns {void}
   */
  const renderPool = (rows) => {
    renderLineChart({
      canvasId: "pool-chart",
      emptyId: "pool-chart-empty",
      rows,
      valueKey: "totalAssets",
      formatValue: formatAmount,
      formatTick: formatAmount,
    });
  };

  /**
   * Draw the Utilization history chart.
   * @param {SeriesRow[]} rows
   * @returns {void}
   */
  const renderLiquidity = (rows) => {
    renderLineChart({
      canvasId: "liquidity-chart",
      emptyId: "liquidity-chart-empty",
      rows,
      valueKey: "utilization",
      formatValue: formatPercent,
      formatTick: formatTickPercent,
    });
  };

  ns.chart = { renderRates, renderPool, renderLiquidity };
})();
