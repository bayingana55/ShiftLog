import { calculatePay, money } from "./pay.js";
import { localDate, periods } from "./time.js";
import { estimatePayroll } from "./payroll.js";
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
export async function getSummary(db) {
  const [shifts, transactions, goalResult, jobs] = await Promise.all([
    getShifts(db),
    getTransactions(db),
    db.query("SELECT amount FROM savings_goals WHERE id=1"),
    db.query("SELECT * FROM jobs ORDER BY id"),
  ]);
  const period = periods();
  const completed = shifts.filter(
    (s) => s.clock_out && localDate(s.clock_in) <= period.today,
  );
  const sum = (rows, key) =>
    money(rows.reduce((s, r) => s + Number(r[key]), 0));
  const week = completed.filter((s) => localDate(s.clock_in) >= period.week);
  const month = completed.filter((s) => localDate(s.clock_in) >= period.month);
  const saved = sum(
    transactions.filter((t) => t.type === "savings" && t.date <= period.today),
    "amount",
  );
  const goal = Number(goalResult.rows[0].amount);
  const months = Array.from({ length: 12 }, (_, i) =>
    moment
      .utc(period.month)
      .subtract(11 - i, "months")
      .format("YYYY-MM"),
  );
  const monthly = months.map((m) => ({
    month: m,
    income: sum(
      completed.filter((s) => localDate(s.clock_in).startsWith(m)),
      "gross",
    ),
    spending: sum(
      transactions.filter((t) => t.type === "expense" && t.date.startsWith(m)),
      "amount",
    ),
    savings: sum(
      transactions.filter((t) => t.type === "savings" && t.date.startsWith(m)),
      "amount",
    ),
    saved_total: sum(
      transactions.filter(
        (t) => t.type === "savings" && t.date.slice(0, 7) <= m,
      ),
      "amount",
    ),
  }));
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
  const spending_month = sum(
    transactions.filter(
      (t) =>
        t.type === "expense" &&
        t.date >= period.month &&
        t.date <= period.today,
    ),
    "amount",
  );
  return {
    period,
    active: shifts.find((s) => !s.clock_out) || null,
    hours_week: sum(week, "paid_hours"),
    gross_week: sum(week, "gross"),
    gross_month: sum(month, "gross"),
    spending_month,
    balance_month: money(sum(month, "gross") - spending_month),
    saved,
    goal,
    remaining: Math.max(0, money(goal - saved)),
    progress: money((saved / goal) * 100),
    recent_shifts: shifts.slice(0, 5),
    recent_transactions: transactions.slice(0, 5),
    monthly,
    by_job,
    payroll: estimatePayroll(),
  };
}
