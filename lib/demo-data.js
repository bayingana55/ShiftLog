import { calculatePay } from "./pay.js";
import { summarize } from "./data.js";
import { instant, addDays } from "./time.js";

// Entirely fictional fixtures. Never read the personal database or historical importer.
export function createDemoData() {
  const asOf = "2026-09-22T12:00:00-07:00";
  const jobs = [
    { id: 1, name: "Apple", hourly_wage: 25 },
    { id: 2, name: "Home Depot", hourly_wage: 20.47 },
  ];
  const rates = jobs.map((job) => ({
    id: job.id,
    job_id: job.id,
    effective_from: "2026-01-01",
    base_rate: job.hourly_wage,
    premium_rate: job.id === 2 ? 22.72 : null,
    premium_start: 1320,
    premium_end: 330,
  }));
  const shifts = [];
  const transactions = [];
  const paychecks = [];
  for (let month = 1; month <= 9; month++) {
    const prefix = `2026-${String(month).padStart(2, "0")}`;
    const lastDay =
      month === 9
        ? 21
        : Number(new Date(Date.UTC(2026, month, 0)).getUTCDate());
    for (let day = 1; day <= lastDay; day++) {
      const date = `${prefix}-${String(day).padStart(2, "0")}`;
      const weekday = new Date(`${date}T12:00Z`).getUTCDay();
      const job = [1, 3, 5].includes(weekday)
        ? jobs[0]
        : [2, 6].includes(weekday)
          ? jobs[1]
          : null;
      if (!job) continue;
      const overnight = job.id === 2;
      const shift = {
        id: shifts.length + 1,
        job_id: job.id,
        job_name: job.name,
        clock_in: instant(`${date}T${overnight ? "21:00" : "09:00"}`),
        clock_out: instant(
          `${overnight ? addDays(date, 1) : date}T${overnight ? "05:30" : "17:00"}`,
        ),
        break_minutes: 30,
        break_start: null,
        source: "demo",
      };
      shifts.push({ ...shift, ...calculatePay(shift, rates) });
    }
    for (const [day, type, category, amount, description] of [
      [1, "expense", "Rent", 1400, "Sample rent payment"],
      [5, "expense", "Food", 180 + month * 7, "Sample groceries"],
      [8, "expense", "Transportation", 105, "Sample transit pass"],
      [12, "expense", "Phone", 65, "Sample phone bill"],
      [18, "savings", "Savings", 700 + month * 25, "Sample savings transfer"],
      [20, "withdrawal", "Savings", 60, "Sample withdrawal"],
    ])
      transactions.push({
        id: transactions.length + 1,
        date: `${prefix}-${String(day).padStart(2, "0")}`,
        type,
        category,
        amount,
        description,
      });
    for (const job of jobs)
      paychecks.push({
        id: paychecks.length + 1,
        job_id: job.id,
        job_name: job.name,
        payday: `${prefix}-18`,
        actual_amount: job.id === 1 ? 2100 : 1150,
        gross_amount: null,
        period_start: null,
        period_end: null,
        notes: "Fictional sample payment",
      });
  }
  shifts.sort((a, b) => b.clock_in - a.clock_in);
  transactions.sort((a, b) => b.date.localeCompare(a.date));
  paychecks.sort((a, b) => b.payday.localeCompare(a.payday));
  const budgets = [
    ["Rent", 1400],
    ["Groceries", 350],
    ["Bills", 170],
    ["Clothes & Going Out", 180],
  ].map(([category, amount]) => ({
    category,
    amount,
    effective_from: "2026-01-01",
  }));
  const schedule = { anchor_payday: "2026-09-18", interval_days: 14 };
  const coverage = jobs.map((job) => ({
    job_id: job.id,
    anchor_period_end: "2026-09-12",
  }));
  const summary = summarize(
    {
      allShifts: shifts,
      allTransactions: transactions,
      goalResult: { rows: [{ amount: 15000 }] },
      jobs: { rows: jobs },
      budgets: { rows: budgets },
      schedule: { rows: [schedule] },
      coverage: { rows: coverage },
      paychecks,
    },
    new Date(asOf),
  );
  return { asOf, summary, jobs, shifts, transactions, rates };
}
