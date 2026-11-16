import { calculatePay, money } from "./pay.js";
import { localDate, periods } from "./time.js";
import { HISTORY_START, trackedMonths } from "./planning.js";
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
  const [shifts, transactions, goal, paychecks] = await Promise.all([
    getShifts(db),
    getTransactions(db),
    db.query("SELECT amount FROM savings_goals WHERE id=1"),
    getPaychecks(db),
  ]);
  return summarize(
    { shifts, transactions, goal: Number(goal.rows[0].amount), paychecks },
    now,
  );
}

// The dashboard numbers. Shared by the real app and the fictional demo.
export function summarize(
  { shifts, transactions, goal, paychecks },
  now = new Date(),
) {
  const period = periods(now);
  // Only records from the start of tracked history up to today count.
  const shiftDay = (s) => localDate(s.clock_in);
  shifts = shifts.filter(
    (s) => shiftDay(s) >= HISTORY_START && shiftDay(s) <= period.today,
  );
  transactions = transactions.filter(
    (t) => t.date >= HISTORY_START && t.date <= period.today,
  );
  const sum = (rows, key) =>
    money(rows.reduce((total, row) => total + Number(row[key]), 0));
  const ofType = (type) => transactions.filter((t) => t.type === type);

  // One row per month since January 2026, for the earned-vs-spent chart.
  const monthly = trackedMonths(period.month).map((month) => ({
    month,
    income: sum(
      shifts.filter((s) => shiftDay(s).startsWith(month)),
      "gross",
    ),
    spending: sum(
      ofType("expense").filter((t) => t.date.startsWith(month)),
      "amount",
    ),
  }));
  const thisMonth = monthly.at(-1) || { income: 0, spending: 0 };
  const saved = money(
    sum(ofType("savings"), "amount") - sum(ofType("withdrawal"), "amount"),
  );
  return {
    period,
    hours_week: sum(
      shifts.filter((s) => shiftDay(s) >= period.week),
      "paid_hours",
    ),
    gross_month: thisMonth.income,
    spending_month: thisMonth.spending,
    saved,
    goal,
    remaining: Math.max(0, money(goal - saved)),
    progress: money((saved / goal) * 100),
    monthly,
    paychecks,
  };
}

export async function getPaychecks(db) {
  return (
    await db.query(`SELECT paychecks.*,payday::text,jobs.name AS job_name
    FROM paychecks JOIN jobs ON jobs.id=paychecks.job_id ORDER BY paychecks.payday DESC,paychecks.id DESC`)
  ).rows;
}
