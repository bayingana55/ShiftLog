import moment from "moment-timezone";
import { calculatePay } from "./pay.js";
import { instant, addDays, localDate } from "./time.js";
import { HISTORY_START } from "./planning.js";

// Entirely fictional records for the public sandbox demo. Never reads the
// personal database. Built relative to `now`, so the demo always shows the
// most recent months and "this week" always has data.
export function createDemoData(now = new Date()) {
  const today = localDate(now);
  // The nine most recent months, but never before tracked history starts.
  let first = moment
    .utc(today)
    .startOf("month")
    .subtract(8, "months")
    .format("YYYY-MM-DD");
  if (first < HISTORY_START) first = HISTORY_START;

  const jobs = [
    { id: 1, name: "Apple" },
    { id: 2, name: "Home Depot" },
  ];
  const rate = (job_id, base_rate, premium_rate) => ({
    id: job_id,
    job_id,
    effective_from: HISTORY_START,
    base_rate,
    premium_rate,
    premium_start: 1320, // 10:00 PM, in minutes after midnight
    premium_end: 330, // 5:30 AM
  });
  const rates = [rate(1, 20, null), rate(2, 18, 20)];
  const shifts = [];
  const transactions = [];
  const paychecks = [];

  for (let date = first; date <= today; date = addDays(date, 1)) {
    const day = Number(date.slice(8));
    const month = Number(date.slice(5, 7));
    // Apple on Monday/Wednesday/Friday; Home Depot overnight on Tuesday/Saturday.
    const weekday = moment.utc(date).day();
    const job = [1, 3, 5].includes(weekday)
      ? jobs[0]
      : [2, 6].includes(weekday)
        ? jobs[1]
        : null;
    if (job) {
      const overnight = job.id === 2;
      const shift = {
        id: shifts.length + 1,
        job_id: job.id,
        job_name: job.name,
        clock_in: instant(`${date}T${overnight ? "20:00" : "09:00"}`),
        clock_out: instant(
          `${overnight ? addDays(date, 1) : date}T${overnight ? "04:00" : "17:00"}`,
        ),
        break_minutes: 30,
        break_start: null,
        source: "demo",
      };
      // Only shifts that have already ended, like the real app.
      if (shift.clock_out <= now)
        shifts.push({ ...shift, ...calculatePay(shift, rates) });
    }
    for (const [onDay, type, category, amount, description] of [
      [1, "expense", "Rent", 1400, "Sample rent payment"],
      [5, "expense", "Food", 180 + month * 7, "Sample groceries"],
      [8, "expense", "Transportation", 105, "Sample transit pass"],
      [12, "expense", "Phone", 65, "Sample phone bill"],
      [18, "savings", "Savings", 700 + month * 25, "Sample savings transfer"],
      [20, "withdrawal", "Savings", 60, "Sample withdrawal"],
    ])
      if (day === onDay)
        transactions.push({
          id: transactions.length + 1,
          date,
          type,
          category,
          amount,
          description,
        });
    if (day === 18)
      for (const job of jobs)
        paychecks.push({
          id: paychecks.length + 1,
          job_id: job.id,
          job_name: job.name,
          payday: date,
          actual_amount: job.id === 1 ? 2100 : 1150,
          gross_amount: null,
          notes: "Fictional sample payment",
        });
  }
  shifts.sort((a, b) => b.clock_in - a.clock_in);
  transactions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
  paychecks.sort((a, b) => b.payday.localeCompare(a.payday));
  return { jobs, rates, shifts, transactions, paychecks, goal: 15000 };
}
