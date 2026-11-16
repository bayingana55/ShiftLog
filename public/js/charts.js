import { money } from "./ui.js";
let charts = [];
export function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}
function chart(id, type, data, options = {}) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  window.Chart.defaults.font.family =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  window.Chart.defaults.font.size = 10;
  window.Chart.defaults.color = "#84907d";
  charts.push(
    new window.Chart(canvas, {
      type,
      data,
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { display: false }, border: { display: false } },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: "#eff2e9" },
            ticks: { maxTicksLimit: 5 },
          },
        },
        ...options,
      },
    }),
  );
}
export function renderCharts(summary) {
  const monthly = summary.monthly;
  const incomeData = {
    labels: monthly.map((m) =>
      window.moment.utc(`${m.month}-01`).format("MMM YYYY"),
    ),
    datasets: [
      {
        label: "Gross income",
        data: monthly.map((m) => m.income),
        backgroundColor: "#365e47",
        borderRadius: 3,
        maxBarThickness: 15,
      },
      {
        label: "Expenses",
        data: monthly.map((m) => m.spending),
        backgroundColor: "#d5dfb7",
        borderRadius: 3,
        maxBarThickness: 15,
      },
    ],
  };
  chart("income-chart", "bar", incomeData, {
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: { label: (c) => `${c.dataset.label}: ${money(c.raw)}` },
      },
    },
  });
}
