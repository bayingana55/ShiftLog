import { money, escape, dateOnly, button, jobsOptions, today } from "./ui.js";
export const monthLabel = (value) =>
  window.moment.utc(`${value}-01`).format("MMM YYYY");
export const recorded = (value) =>
  value === null || value === undefined ? "Not recorded" : money(value);
export function monthlyTable(s, savings = false) {
  const headings = savings
    ? [
        "Projected savings",
        "Net savings change",
        "Cumulative projected",
        "Cumulative actual",
      ]
    : [
        "Gross earned",
        "Planned expenses",
        "Actual expenses",
        "Actual pay received",
        "Actual cash remaining",
      ];
  return `<div class="table-scroll"><table><thead><tr><th>Month</th>${headings.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${s.monthly.map((m) => `<tr><td>${monthLabel(m.month)}</td>${(savings ? [money(m.projected), money(m.savings), money(m.projected_total), money(m.saved_total)] : [money(m.income), money(m.planned), money(m.spending), recorded(m.actual_pay) + (m.paycheck_count ? `<small>${m.paycheck_count} paycheck(s) recorded</small>` : ""), recorded(m.cash_remaining)]).map((v) => `<td>${v}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}
export function budgetCard(s) {
  return `<section class="card card-pad"><div class="card-head"><div><h2>Monthly spending plan</h2><p>Recurring budget · ${monthLabel(s.period.month.slice(0, 7))}</p></div><button class="btn-link" data-action="edit-budget">Edit budget →</button></div>${s.budget_items.map((i) => `<div class="rate-row"><span>${escape(i.category)}</span><strong>${money(i.amount)}</strong></div>`).join("")}<div class="rate-row"><strong>Planned spending</strong><strong>${money(s.planned_month)}</strong></div><p class="form-note">A plan, not recorded purchases. Actual expenses remain separate.</p></section>`;
}
export function paycheckTable(s) {
  if (!s.paychecks.length)
    return '<p class="empty-state">No actual paychecks recorded. Add the exact amount received from each employer.</p>';
  return `<div class="table-scroll"><table><thead><tr><th>Payday</th><th>Employer</th><th>Actual received</th><th>Gross / estimate</th><th>Difference</th><th>Work dates</th><th>Actions</th></tr></thead><tbody>${s.paychecks
    .map((p) => {
      const gross =
        p.gross_amount !== null ? Number(p.gross_amount) : p.estimated_gross;
      return `<tr><td>${dateOnly(p.payday)}</td><td>${escape(p.job_name)}</td><td><strong>${money(p.actual_amount)}</strong></td><td>${gross === null ? "Not configured" : money(gross)}<small>${p.gross_amount !== null ? "Recorded gross" : p.estimated_gross !== null ? "From logged shifts" : ""}</small></td><td>${gross === null ? "—" : money(gross - Number(p.actual_amount))}</td><td>${p.period_start ? `${dateOnly(p.period_start)} – ${dateOnly(p.period_end)}` : "Not configured"}${p.partial_history ? "<small>Partial tracked history</small>" : ""}${p.notes ? `<small>${escape(p.notes)}</small>` : ""}</td><td><div class="row-actions"><button class="btn btn-sm" data-action="edit-paycheck" data-id="${p.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-paycheck" data-id="${p.id}">Delete</button></div></td></tr>`;
    })
    .join("")}</tbody></table></div>`;
}
export function paydayTable(s) {
  return `<div class="table-scroll history-table"><table><thead><tr><th>Payday</th><th>Employer</th><th>Work period</th><th>Gross estimate</th><th>Actual received</th><th>Record</th></tr></thead><tbody>${[
    ...s.pay_periods,
  ]
    .reverse()
    .map(
      (p) =>
        `<tr><td>${dateOnly(p.payday)}<small>${escape(p.status)}</small></td><td>${escape(p.job_name)}</td><td>${p.period_start ? `${dateOnly(p.period_start)} – ${dateOnly(p.period_end)}` : "Not configured"}${p.partial_history ? "<small>Partial tracked history</small>" : ""}</td><td>${p.gross_estimate === null ? "Not configured" : money(p.gross_estimate)}</td><td>${p.paycheck ? money(p.paycheck.actual_amount) : "Not recorded"}</td><td>${p.paycheck ? `<button class="btn btn-sm" data-action="edit-paycheck" data-id="${p.paycheck.id}">Edit paycheck</button>` : p.payday <= s.period.today ? `<button class="btn btn-sm" data-action="add-paycheck" data-job="${p.job_id}" data-payday="${p.payday}">Record paycheck</button>` : "Upcoming"}</td></tr>`,
    )
    .join("")}</tbody></table></div>`;
}
export function planningSettings(s, jobs) {
  return `<div class="section-grid mb-6"><section class="card card-pad"><div class="card-head"><div><h2>Monthly spending budget</h2><p>Date-effective recurring amounts, separate from transactions.</p></div></div>${s.budget_items.map((i) => `<div class="rate-row"><span>${escape(i.category)}</span><strong>${money(i.amount)}</strong></div>`).join("")}<div class="rate-row"><strong>Monthly total</strong><strong>${money(s.planned_month)}</strong></div><button class="btn btn-primary mt-4" data-action="edit-budget">Edit planned expenses</button></section><section class="card card-pad"><div class="card-head"><div><h2>Payday and work-period configuration</h2><p>Both employers · Every 14 days · Anchor Sep 18, 2026</p></div></div><p class="form-note mb-4">The payday anchor only determines payment dates. Work-period cutoffs are unknown until configured from a payslip. Actual paychecks can be recorded without a cutoff.</p><form id="coverage-form" class="form-grid"><label>Employer<select name="job_id">${jobsOptions(jobs)}</select></label><label>Last work date covered by Sep 18 paycheck<input name="anchor_period_end" type="date" min="2026-01-01" max="2026-09-18"></label><p class="form-note full-width">Optional. Setting this establishes consecutive 14-day work periods for this employer. Leave blank to clear coverage; no estimates are calculated without it.</p><div class="form-actions full-width"><button class="btn btn-primary">Save coverage</button></div></form>${s.payroll_coverage.map((c) => `<div class="rate-row"><span>${escape(jobs.find((j) => j.id === c.job_id)?.name)}</span><strong>${c.anchor_period_end ? dateOnly(c.anchor_period_end) : "Not configured"}</strong></div>`).join("")}</section></div>`;
}
