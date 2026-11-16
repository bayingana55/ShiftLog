import { money, escape, dateOnly } from "./ui.js";
export const monthLabel = (value) =>
  window.moment.utc(`${value}-01`).format("MMM YYYY");
export const recorded = (value) =>
  value === null || value === undefined ? "Not recorded" : money(value);
export function monthlyTable(s, savings = false) {
  const headings = savings
    ? ["Net savings change", "Savings balance"]
    : [
        "Gross earned",
        "Actual expenses",
        "Actual pay received",
        "Actual cash remaining",
      ];
  return `<div class="table-scroll"><table><thead><tr><th>Month</th>${headings.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${s.monthly.map((m) => `<tr><td>${monthLabel(m.month)}</td>${(savings ? [money(m.savings), money(m.saved_total)] : [money(m.income), money(m.spending), recorded(m.actual_pay) + (m.paycheck_count ? `<small>${m.paycheck_count} paycheck(s) recorded</small>` : ""), recorded(m.cash_remaining)]).map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function paycheckTable(s) {
  if (!s.paychecks.length)
    return '<p class="empty-state">No paychecks recorded yet.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>Payday</th><th>Employer</th><th>Received</th><th>Gross on payslip</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${s.paychecks
    .map(
      (p) =>
        `<tr><td>${dateOnly(p.payday)}</td><td>${escape(p.job_name)}</td><td><strong>${money(p.actual_amount)}</strong></td><td>${p.gross_amount === null ? "—" : money(p.gross_amount)}</td><td>${escape(p.notes)}</td><td><div class="row-actions"><button class="btn btn-sm" data-action="edit-paycheck" data-id="${p.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-paycheck" data-id="${p.id}">Delete</button></div></td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
