const enabled = () => document.documentElement.dataset.demo === "true";
let snapshot;
let asOf;
export const demoDate = () => (enabled() ? asOf : null);

export async function demoApi(path, options = {}) {
  if ((options.method || "GET").toUpperCase() !== "GET")
    throw new Error(
      "This portfolio demo is read-only and uses fictional records.",
    );
  snapshot ||= fetch(new URL("../demo-data.json", import.meta.url))
    .then(async (response) => {
      if (!response.ok)
        throw new Error("Unable to load the demo. Please refresh.");
      return response.json();
    })
    .catch((error) => {
      snapshot = null;
      throw error;
    });
  const data = await snapshot;
  asOf = data.asOf;
  const url = new URL(path, "https://demo.invalid");
  if (url.pathname === "/dashboard") return data.summary;
  if (url.pathname === "/jobs") return data.jobs;
  if (url.pathname === "/pay-rates") return data.rates;
  if (!["/shifts", "/transactions"].includes(url.pathname))
    throw new Error("This action is unavailable in the read-only demo.");
  const query = url.searchParams;
  if (
    query.get("from") &&
    query.get("to") &&
    query.get("from") > query.get("to")
  )
    throw new Error("Start date must not be after end date.");
  return data[url.pathname.slice(1)].filter((row) => {
    const day =
      row.date ||
      window.moment(row.clock_in).tz("America/Vancouver").format("YYYY-MM-DD");
    return (
      (!query.get("from") || day >= query.get("from")) &&
      (!query.get("to") || day <= query.get("to")) &&
      (!query.get("job_id") || row.job_id === Number(query.get("job_id"))) &&
      (!query.get("type") || row.type === query.get("type")) &&
      (!query.get("category") || row.category === query.get("category"))
    );
  });
}

export function applyDemoControls(root) {
  if (!enabled()) return;
  const notice =
    "Read-only demo — fictional records as of September 22, 2026. Explore the pages, charts, and filters.";
  if (!document.querySelector("#demo-banner")) {
    const banner = document.createElement("div");
    banner.id = "demo-banner";
    banner.className = "demo-banner";
    banner.textContent = notice;
    document.querySelector(".topbar").after(banner);
    document.querySelector(".sidebar-bottom strong").textContent =
      "Portfolio demo";
  }
  root.querySelectorAll("[data-action]").forEach((button) => {
    if (
      button.dataset.action.startsWith("filter-") ||
      button.dataset.action === "retry"
    )
      return;
    button.disabled = true;
    button.title =
      "Editing is available in the full app. This demo is read-only.";
  });
  root.querySelectorAll("form:not(#filter-form)").forEach((form) => {
    form.onsubmit = (event) => event.preventDefault();
    form
      .querySelectorAll("input, select, button, textarea")
      .forEach((control) => {
        control.disabled = true;
      });
  });
}
