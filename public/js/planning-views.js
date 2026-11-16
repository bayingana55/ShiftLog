import { money, escape, dateOnly } from "./ui.js";
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
