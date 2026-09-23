import { calculatePay, money } from "./pay.js";
import { localDate, periods } from "./time.js";
import { estimatePayroll } from "./payroll.js";
import {
  HISTORY_START,
  trackedMonths,
  budgetForMonth,
  payPeriods,
} from "./planning.js";
import moment from "moment-timezone";
export async function getShifts(db) {
  const [shifts, rates] = await Promise.all([
    db.query(
      "SELECT shifts.*, jobs.name AS job_name FROM shifts JOIN jobs ON jobs.id=shifts.job_id ORDER BY clock_in DESC",
    ),
    db.query(
      "SELECT *, effective_from::text FROM pay_rates ORDER BY pay_rates.effective_from DESC",
    ),
  ]);
  return shifts.rows.map((s) => ({ ...s, ...calculatePay(s, rates.rows) }));
}
export async function getTransactions(db) {
  return (
    await db.query(
      "SELECT *,date::text FROM transactions ORDER BY transactions.date DESC,id DESC",
    )
  ).rows;
}
export async function getSummary(db, now = new Date()) {
  const [
    allShifts,
    allTransactions,
    goalResult,
    jobs,
    budgets,
    schedule,
    coverage,
    paychecks,
  ] = await Promise.all([
    getShifts(db),
    getTransactions(db),
    db.query("SELECT amount FROM savings_goals WHERE id=1"),
    db.query("SELECT * FROM jobs ORDER BY id"),
    db.query(
      "SELECT category, amount, effective_from::text FROM budget_rates ORDER BY effective_from DESC,category",
    ),
    db.query(
      "SELECT anchor_payday::text,interval_days FROM payroll_schedule WHERE id=1",
    ),
    db.query(
      "SELECT job_id,anchor_period_end::text FROM payroll_coverage ORDER BY job_id",
    ),
    getPaychecks(db),
  ]);
  const period = periods(now);
  const shifts = allShifts.filter(
    (s) =>
      localDate(s.clock_in) >= HISTORY_START &&
      localDate(s.clock_in) <= period.today,
  );
  const transactions = allTransactions.filter(
    (t) => t.date >= HISTORY_START && t.date <= period.today,
  );
  const completed = shifts.filter((s) => s.clock_out);
  const sum = (rows, key) =>
    money(rows.reduce((n, r) => n + Number(r[key]), 0));
  let cumulativeProjected = 0,
    cumulativeActual = 0;
  const monthly = trackedMonths(period.month).map((month) => {
    const income = sum(
      completed.filter((s) => localDate(s.clock_in).startsWith(month)),
      "gross",
    );
    const spending = sum(
      transactions.filter(
        (t) => t.type === "expense" && t.date.startsWith(month),
      ),
      "amount",
    );
    const deposits = sum(
      transactions.filter(
        (t) => t.type === "savings" && t.date.startsWith(month),
      ),
      "amount",
    );
    const withdrawals = sum(
      transactions.filter(
        (t) => t.type === "withdrawal" && t.date.startsWith(month),
      ),
      "amount",
    );
    const savings = money(deposits - withdrawals);
    const actualRows = paychecks.filter(
      (p) => p.payday.startsWith(month) && p.payday <= period.today,
    );
    const actual_pay = actualRows.length
      ? sum(actualRows, "actual_amount")
      : null;
    const planned = sum(budgetForMonth(budgets.rows, month), "amount");
    const projected = money(income - planned);
    cumulativeProjected = money(cumulativeProjected + projected);
    cumulativeActual = money(cumulativeActual + savings);
    return {
      month,
      label: moment.utc(month + "-01").format("MMM YYYY"),
      income,
      spending,
      savings,
      deposits,
      withdrawals,
      planned,
      projected,
      actual_pay,
      paycheck_count: actualRows.length,
      cash_remaining: actual_pay === null ? null : money(actual_pay - spending),
      saved_total: cumulativeActual,
      projected_total: cumulativeProjected,
    };
  });
  const current = monthly.at(-1) || {
    income: 0,
    spending: 0,
    planned: 0,
    projected: 0,
  };
  const week = completed.filter((s) => localDate(s.clock_in) >= period.week);
  const goal = Number(goalResult.rows[0].amount);
  const by_job = jobs.rows.map((j) => ({
    id: j.id,
    name: j.name,
    hours: sum(
      completed.filter((s) => s.job_id === j.id),
      "paid_hours",
    ),
    earnings: sum(
      completed.filter((s) => s.job_id === j.id),
      "gross",
    ),
  }));
  return {
    period,
    history_start: HISTORY_START,
    hours_week: sum(week, "paid_hours"),
    gross_week: sum(week, "gross"),
    gross_month: current.income,
    spending_month: current.spending,
    planned_month: current.planned,
    actual_pay_month: current.actual_pay ?? null,
    cash_remaining_month: current.cash_remaining ?? null,
    paycheck_count_month: current.paycheck_count || 0,
    balance_month: money(current.income - current.spending),
    projected_month: current.projected,
    projected_saved: cumulativeProjected,
    saved: cumulativeActual,
    goal,
    remaining: Math.max(0, money(goal - cumulativeActual)),
    progress: money((cumulativeActual / goal) * 100),
    projected_remaining: Math.max(0, money(goal - cumulativeProjected)),
    projected_progress: money((cumulativeProjected / goal) * 100),
    recent_shifts: shifts.slice(0, 5),
    recent_transactions: transactions.slice(0, 5),
    monthly,
    by_job,
    budget_items: budgetForMonth(budgets.rows, period.month.slice(0, 7)),
    budget_rates: budgets.rows,
    payroll_schedule: schedule.rows[0],
    payroll_coverage: coverage.rows,
    paychecks: paychecks.map((p) => ({
      ...p,
      estimated_gross: p.period_start
        ? sum(
            completed.filter(
              (s) =>
                s.job_id === p.job_id &&
                localDate(s.clock_in) >= p.period_start &&
                localDate(s.clock_in) <= p.period_end,
            ),
            "gross",
          )
        : null,
      partial_history: !!p.period_start && p.period_start < HISTORY_START,
    })),
    pay_periods: payPeriods(
      completed,
      jobs.rows,
      schedule.rows[0],
      coverage.rows,
      period.today,
    ).map((p) => ({
      ...p,
      paycheck:
        paychecks.find((c) => c.job_id === p.job_id && c.payday === p.payday) ||
        null,
    })),
    payroll: estimatePayroll(),
  };
}

export async function getPaychecks(db) {
  return (
    await db.query(`SELECT paychecks.*,payday::text,period_start::text,period_end::text,jobs.name AS job_name
    FROM paychecks JOIN jobs ON jobs.id=paychecks.job_id ORDER BY paychecks.payday DESC,paychecks.id DESC`)
  ).rows;
}
