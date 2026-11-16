import { calculatePay, money } from "./pay.js";
import { localDate, periods } from "./time.js";
import { HISTORY_START, trackedMonths } from "./planning.js";
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
  const [allShifts, allTransactions, goalResult, jobs, paychecks] =
    await Promise.all([
      getShifts(db),
      getTransactions(db),
      db.query("SELECT amount FROM savings_goals WHERE id=1"),
      db.query("SELECT * FROM jobs ORDER BY id"),
      getPaychecks(db),
    ]);
  return summarize(
    {
      allShifts,
      allTransactions,
      goalResult,
      jobs,
      paychecks,
    },
    now,
  );
}

// Shared report calculation for database records and the fictional portfolio demo.
export function summarize(
  { allShifts, allTransactions, goalResult, jobs, paychecks },
  now = new Date(),
) {
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
  let cumulativeActual = 0;
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
    cumulativeActual = money(cumulativeActual + savings);
    return {
      month,
      label: moment.utc(month + "-01").format("MMM YYYY"),
      income,
      spending,
      savings,
      deposits,
      withdrawals,
      actual_pay,
      paycheck_count: actualRows.length,
      cash_remaining: actual_pay === null ? null : money(actual_pay - spending),
      saved_total: cumulativeActual,
    };
  });
  const current = monthly.at(-1) || {
    income: 0,
    spending: 0,
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
    actual_pay_month: current.actual_pay ?? null,
    cash_remaining_month: current.cash_remaining ?? null,
    paycheck_count_month: current.paycheck_count || 0,
    balance_month: money(current.income - current.spending),
    saved: cumulativeActual,
    goal,
    remaining: Math.max(0, money(goal - cumulativeActual)),
    progress: money((cumulativeActual / goal) * 100),
    recent_shifts: shifts.slice(0, 5),
    recent_transactions: transactions.slice(0, 5),
    monthly,
    by_job,
    paychecks,
  };
}

export async function getPaychecks(db) {
  return (
    await db.query(`SELECT paychecks.*,payday::text,jobs.name AS job_name
    FROM paychecks JOIN jobs ON jobs.id=paychecks.job_id ORDER BY paychecks.payday DESC,paychecks.id DESC`)
  ).rows;
}
