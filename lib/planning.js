import moment from "moment-timezone";
import { addDays, localDate } from "./time.js";
import { money } from "./pay.js";
export const HISTORY_START = "2026-01-01";
export const HISTORY_END = "2026-09-17";
export const BUDGET_CATEGORIES = [
  "Rent",
  "Groceries",
  "Bills",
  "Clothes & Going Out",
];
export function trackedMonths(through) {
  const months = [];
  for (
    let month = HISTORY_START;
    month <= through;
    month = moment.utc(month).add(1, "month").format("YYYY-MM-DD")
  )
    months.push(month.slice(0, 7));
  return months;
}
export function budgetForMonth(rates, month) {
  const categories = [
    ...new Set([...BUDGET_CATEGORIES, ...rates.map((r) => r.category)]),
  ];
  return categories
    .map((category) => {
      const rule = rates
        .filter(
          (r) =>
            r.category === category && r.effective_from.slice(0, 7) <= month,
        )
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
      return { category, amount: Number(rule?.amount || 0) };
    })
    .filter((item) => item.amount > 0);
}
// Payday dates alone do not establish which work dates a paycheck covers.
// Missing coverage stays null until a period end from a payslip is configured.
export function payPeriods(shifts, jobs, schedule, coverage, today) {
  const anchor = schedule.anchor_payday;
  const interval = schedule.interval_days;
  const firstIndex = Math.ceil(
    moment.utc(HISTORY_START).diff(moment.utc(anchor), "days") / interval,
  );
  const lastIndex =
    Math.ceil(moment.utc(today).diff(moment.utc(anchor), "days") / interval) +
    1;
  const rows = [];
  for (let i = firstIndex; i <= lastIndex; i++) {
    const payday = addDays(anchor, i * interval);
    for (const job of jobs) {
      const end = coverage.find((c) => c.job_id === job.id)?.anchor_period_end;
      const period_end = end ? addDays(end, i * interval) : null;
      const period_start = end ? addDays(period_end, 1 - interval) : null;
      const included = end
        ? shifts.filter(
            (s) =>
              s.job_id === job.id &&
              s.clock_out &&
              localDate(s.clock_in) >= period_start &&
              localDate(s.clock_in) <= period_end,
          )
        : [];
      rows.push({
        job_id: job.id,
        job_name: job.name,
        payday,
        period_start,
        period_end,
        gross_estimate: end
          ? money(included.reduce((n, s) => n + s.gross, 0))
          : null,
        shift_count: end ? included.length : null,
        partial_history: !!end && period_start < HISTORY_START,
        status: payday > today ? "Upcoming" : "Scheduled past payday",
      });
    }
  }
  return rows;
}
