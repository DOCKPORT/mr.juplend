/**
 * @file Draw the Total APY history line chart.
 */

(() => {
  "use strict";

  /** @type {Window & { MRJUPLEND?: Record<string, unknown>, Chart?: unknown }} */
  const page = window;
  const ns = page.MRJUPLEND || (page.MRJUPLEND = {});

  /** Fixed colors by symbol. */
  const COLORS = {
    USDC: "#4da3ff",
    USDT: "#26a17b",
    USDS: "#03e1ff",
    USDG: "#f5c542",
    USDGO: "#ff6b81",
    JUPUSD: "#9945ff",
    SOL: "#14f195",
    EURC: "#7c8cff",
  };

  /** Fallback colors for a new symbol. */
  const PALETTE = ["#ffd166", "#ff9f43", "#c084fc", "#34d399"];

  /** @type {unknown} */
  let chartInstance = null;

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
   * Build labels and datasets from history rows.
   * @param {HistoryRow[]} rows
   * @returns {{ days: string[], datasets: object[] }}
   */
  const buildSeries = (rows) => {
    const days = [...new Set(rows.map((row) => row.day))].sort();
    /** @type {Map<string, Map<string, number | null>>} */
    const values = new Map();

    for (const row of rows) {
      if (!values.has(row.symbol)) {
        values.set(row.symbol, new Map());
      }
      values.get(row.symbol)?.set(row.day, row.totalApy);
    }

    const datasets = [];
    let index = 0;
    for (const [symbol, points] of values) {
      const color = COLORS[symbol.toUpperCase()] || PALETTE[index % PALETTE.length];
      datasets.push({
        label: symbol,
        data: days.map((day) => (points.has(day) ? points.get(day) : null)),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 4,
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
   * Draw the chart from history rows.
   * @param {HistoryRow[]} rows
   * @returns {void}
   */
  const render = (rows) => {
    const canvas = /** @type {HTMLCanvasElement | null} */ (
      document.getElementById("rates-chart")
    );
    const empty = requireElement("chart-empty");
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Missing element #rates-chart.");
    }

    const ChartCtor = page.Chart;
    if (typeof ChartCtor !== "function") {
      throw new Error("The chart library did not load.");
    }

    if (!rows.length) {
      canvas.hidden = true;
      empty.hidden = false;
      return;
    }

    canvas.hidden = false;
    empty.hidden = true;

    const { days, datasets } = buildSeries(rows);

    if (chartInstance instanceof ChartCtor) {
      chartInstance.destroy();
    }

    chartInstance = new ChartCtor(canvas, {
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
            },
          },
          tooltip: {
            itemSort: (left, right) => {
              const a = Number(left.parsed.y);
              const b = Number(right.parsed.y);
              const leftValue = Number.isFinite(a) ? a : -Infinity;
              const rightValue = Number.isFinite(b) ? b : -Infinity;
              return rightValue - leftValue;
            },
            callbacks: {
              label: (context) => {
                const value = Number(context.parsed.y);
                const text = Number.isFinite(value) ? value.toFixed(2) : "\u2014";
                return `${context.dataset.label}: ${text}%`;
              },
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
              callback: (value) => `${Number(value).toFixed(1)}%`,
            },
          },
        },
      },
    });
  };

  ns.chart = { render };
})();
