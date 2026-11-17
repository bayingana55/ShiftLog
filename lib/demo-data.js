import moment from "moment-timezone";
import { calculatePay } from "./pay.js";
import { instant, addDays, localDate } from "./time.js";
import { HISTORY_START } from "./planning.js";

// Records for the public sandbox demo. Never reads the personal database.

// What a visitor sees first: two generic jobs with pay rules, a goal, and
// nothing else. Every shift and expense comes from the visitor.
export function createBlankDemo() {
  const rate = (job_id, base_rate, premium_rate) => ({
    id: job_id,
    job_id,
    effective_from: HISTORY_START,
    base_rate,
    premium_rate,
    premium_start: 1320, // 10:00 PM, in minutes after midnight
    premium_end: 330, // 5:30 AM
  });
  return {
    jobs: [
      { id: 1, name: "Day job" },
      { id: 2, name: "Night job" },
    ],
    rates: [rate(1, 20, null), rate(2, 18, 20)],
    shifts: [],
    transactions: [],
    paychecks: [],
    goal: 5000,
  };
}

// "Load sample data": four weeks of example shifts, expenses and savings up to `now`,
// for the two generic jobs (ids 1 and 2) and the given pay rules.
export function createSampleData(rates, now = new Date()) {
  const today = localDate(now);
  let first = addDays(today, -27);
  if (first < HISTORY_START) first = HISTORY_START;
  const names = { 1: "Day job", 2: "Night job" };
  const shifts = [];
  const transactions = [];

  for (let date = first; date <= today; date = addDays(date, 1)) {
    // Day job Monday/Wednesday/Friday 9–5; Night job Tuesday/Saturday 8 PM–4 AM.
    const weekday = moment.utc(date).day();
    const job_id = [1, 3, 5].includes(weekday)
      ? 1
      : [2, 6].includes(weekday)
        ? 2
        : null;
    if (job_id) {
      const night = job_id === 2;
      const shift = {
        id: shifts.length + 1,
        job_id,
        job_name: names[job_id],
        clock_in: instant(`${date}T${night ? "20:00" : "09:00"}`),
        clock_out: instant(
          `${night ? addDays(date, 1) : date}T${night ? "04:00" : "17:00"}`,
        ),
        break_minutes: 30,
        break_start: null,
        source: "sample",
      };
      // Only shifts that have already ended, like the real app.
      if (shift.clock_out <= now)
        shifts.push({ ...shift, ...calculatePay(shift, rates) });
    }
    // A few weekly expenses, rent on the first of the month, and a savings
    // deposit every Monday. Spending stays well below earnings.
    const day = Number(date.slice(8));
    for (const [match, type, category, amount, description] of [
      [day === 1, "expense", "Rent", 900, "Sample rent"],
      [weekday === 0, "expense", "Food", 85, "Sample groceries"],
      [weekday === 1, "expense", "Transportation", 25, "Sample transit"],
      [weekday === 5, "expense", "Entertainment", 30, "Sample night out"],
      [weekday === 1, "savings", "Savings", 300, "Sample savings deposit"],
    ])
      if (match)
        transactions.push({
          id: transactions.length + 1,
          date,
          type,
          category,
          amount,
          description,
        });
  }
  shifts.sort((a, b) => b.clock_in - a.clock_in);
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  return { shifts, transactions };
}
