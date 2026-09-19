export const icons = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  shifts:
    "M8 3v4 M16 3v4 M3 10h18 M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2 M8 14h3 M8 17h6",
  transactions: "M4 7h16 M16 3l4 4-4 4 M20 17H4 M8 13l-4 4 4 4",
  savings:
    "M12 3v3 M8 3h8 M5 10c0-4 14-4 14 0l2 9c0 3-18 3-18 0z M10 13h4 M12 11v6",
  analytics: "M4 20V12 M10 20V7 M16 20V3 M22 20H2",
  earnings: "M12 3v18 M17 7c-1-4-10-3-10 1 0 4 10 2 10 7 0 4-9 5-11 1",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  history: "M3 4v6h6 M3 10a9 9 0 1 1 1 8 M12 7v6l4 2",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  close: "M6 6l12 12 M18 6 6 18",
  check: "M5 12l4 4L19 6",
  wallet: "M3 6h16v4 M3 6v14h18V10H3z M16 14h5",
  leaf: "M5 19C-1 8 11 3 21 3c0 12-5 20-16 16z M5 19 15 9",
  play: "M8 4l12 8-12 8z",
  stop: "M6 6h12v12H6z",
  food: "M4 3v7h6V3 M7 10v11 M18 3c-4 5-3 10 0 10V3v18",
};
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.wallet}"/></svg>`;
export const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const money = (value) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(value) || 0,
  );
export const hours = (value) => Number(value || 0).toFixed(1);
export const zone = "America/Vancouver";
export const today = () => window.moment().tz(zone).format("YYYY-MM-DD");
export const localInput = (value) =>
  value ? window.moment(value).tz(zone).format("YYYY-MM-DDTHH:mm") : "";
export const day = (value) =>
  window.moment(value).tz(zone).format("MMM D, YYYY");
export const time = (value) =>
  value ? window.moment(value).tz(zone).format("h:mm A") : "In progress";
export const dateOnly = (value) =>
  window.moment.utc(value).format("MMM D, YYYY");
export const badge = (shift) =>
  `<span class="badge ${shift.job_name?.toLowerCase() === "home depot" ? "depot" : ""}">${escape(shift.job_name)}</span>`;
export const empty = (text, action = "") =>
  `<div class="empty-state">${icon("leaf")}<p>${escape(text)}</p>${action}</div>`;
export const button = (label, action, type = "btn-primary", name = "plus") =>
  `<button class="btn ${type}" data-action="${action}">${icon(name)}${label}</button>`;
export function heading(kicker, title, subtitle, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${escape(kicker)}</div><h1>${escape(title)}</h1><p class="page-subtitle">${escape(subtitle)}</p></div>${action}</div>`;
}
export function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 4500);
}
export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  if (response.status === 204) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
export function jobsOptions(jobs, selected) {
  return jobs
    .map(
      (j) =>
        `<option value="${j.id}" ${j.id === Number(selected) ? "selected" : ""}>${escape(j.name)}</option>`,
    )
    .join("");
}
export const categories = [
  "Rent",
  "Food",
  "Transportation",
  "Phone",
  "Shopping",
  "Entertainment",
  "Other",
];
