import { paycheckTable, recorded } from "./planning-views.js";
import {
  icon,
  escape,
  money,
  hours,
  day,
  time,
  dateOnly,
  badge,
  empty,
  button,
  heading,
  jobsOptions,
  categories,
  today,
} from "./ui.js";
export const pages = [
  ["dashboard", "Overview", "dashboard"],
  ["shifts", "Shifts", "shifts"],
  ["money", "Money", "transactions"],
  ["settings", "Settings", "settings"],
];
export function stat(label, value, note, iconName, actions = []) {
  return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(iconName)}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div>${actions.length ? `<div class="stat-actions">${actions.map(([text, action]) => `<button class="btn-link" data-action="${action}">${text}</button>`).join("")}</div>` : ""}</div>`;
}
export function shiftTable(shifts, compact = false) {
  if (!shifts.length)
    return empty(
      "No shifts here yet. Your next shift starts the story.",
      button("Log shift", "add-shift", "btn-secondary"),
    );
  return `<div class="table-scroll ${compact ? "" : "shift-table-scroll"}"><table><thead><tr><th>Date</th><th>Job</th>${compact ? "" : "<th>Start → end</th><th>Break</th>"}<th>Paid hours</th><th>Gross pay</th>${compact ? "" : "<th>Actions</th>"}</tr></thead><tbody>${shifts.map((s) => `<tr><td><strong>${day(s.clock_in)}</strong>${!compact && s.source === "schedule" ? "<small>Schedule estimate</small>" : ""}</td><td>${badge(s)}</td>${compact ? "" : `<td>${time(s.clock_in)} → ${time(s.clock_out)}${s.clock_out && day(s.clock_in) !== day(s.clock_out) ? `<small>Ends ${day(s.clock_out)}</small>` : ""}</td><td>${s.break_minutes} min${s.break_method === "proportional" ? "<small>Proportional</small>" : ""}</td>`}<td>${s.clock_out ? `${hours(s.paid_hours)} hrs` : '<span class="badge active-badge">Needs end time</span>'}</td><td><strong>${s.clock_out ? money(s.gross) : "—"}</strong></td>${compact ? "" : `<td><div class="row-actions"><button class="btn btn-sm" data-action="edit-shift" data-id="${s.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-shift" data-id="${s.id}" aria-label="Delete shift on ${day(s.clock_in)}">Delete</button></div></td>`}</tr>`).join("")}</tbody></table></div>`;
}
function recentTransactions(rows) {
  if (!rows.length)
    return empty(
      "No transactions yet. Track an expense or set something aside.",
      button("Add transaction", "add-transaction", "btn-secondary"),
    );
  return `<div class="transaction-list">${rows.map((t) => `<div class="transaction-item"><span class="transaction-symbol">${icon(t.type === "savings" ? "savings" : t.category === "Food" ? "food" : "wallet")}</span><div class="transaction-copy"><strong>${escape(t.description || t.category)}</strong><small>${escape(t.category)} · ${dateOnly(t.date)}</small></div><span class="transaction-amount ${t.type === "savings" ? "positive" : ""}">${t.type === "savings" ? "+" : "−"}${money(t.amount)}</span><div class="row-actions"><button class="btn btn-sm" data-action="edit-transaction" data-id="${t.id}" aria-label="Edit ${escape(t.description || t.category)}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-transaction" data-id="${t.id}" aria-label="Delete ${escape(t.description || t.category)}">Delete</button></div></div>`).join("")}</div>`;
}
export function workBanner() {
  return `<section class="clock-banner" aria-label="Work log"><div class="clock-symbol">${icon("shifts")}</div><div><h2>Log your work</h2><p class="muted">Finished a shift? Record your hours and see what you earned.</p></div><div class="clock-actions">${button("Log shift", "add-shift")}</div></section>`;
}

export function incomeCard(id = "income-chart", title = "Earned vs. spent") {
  return `<section class="card card-pad"><div class="card-head"><div><h2>${title}</h2><p>Gross earned and recorded expenses · Since Jan 2026</p></div></div><div class="legend mb-3"><span><i></i>Gross earnings</span><span><i class="spend"></i>Expenses</span></div><div class="chart-wrap"><canvas id="${id}" role="img" aria-label="Gross earnings compared with recorded expenses by month since January 2026"></canvas></div></section>`;
}

function savingsCard(s) {
  const percent = Math.max(0, Math.min(100, s.progress));
  return `<section class="card card-pad savings-card"><div class="card-head"><div><h2>Savings goal</h2><p>Deposits − withdrawals · Since Jan 2026</p></div>${icon("savings")}</div><div class="goal-total">${money(s.saved)} <span>toward ${money(s.goal)}</span></div><div class="progress" role="progressbar" aria-label="Savings goal progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percent}%"></div></div><div class="progress-labels"><span>${s.progress}% saved</span><span>${money(s.remaining)} to go</span></div><div class="savings-controls"><button class="btn" data-action="add-savings">Add savings</button><button class="btn" data-action="withdraw-savings">Withdraw</button><button class="btn" data-action="edit-goal">Edit goal</button></div></section>`;
}

export function dashboard(s) {
  return (
    heading(
      "YOUR BIG PICTURE",
      "A little work. A little progress.",
      "Your work, cash flow, and goals — clearly separated.",
      button("Add transaction", "add-transaction"),
    ) +
    workBanner() +
    `<div class="stat-grid">${stat("Hours this week", `${hours(s.hours_week)} hrs`, "Completed shifts · Monday–Sunday", "clock", [["Manage shifts", "manage-shifts"]])}${stat("Gross earned this month", money(s.gross_month), `${money(s.gross_week)} earned this week`, "earnings", [["Manage shifts", "manage-shifts"]])}${stat(
      "Actual expenses this month",
      money(s.spending_month),
      "Recorded transactions only",
      "transactions",
      [
        ["Add expense", "add-transaction"],
        ["Edit / remove", "manage-expenses"],
      ],
    )}${stat(
      "Actual pay this month",
      recorded(s.actual_pay_month),
      s.paycheck_count_month
        ? `${s.paycheck_count_month} paycheck(s) recorded · May be incomplete`
        : "Enter actual paycheck amounts",
      "earnings",
      [
        ["Add paycheck", "add-paycheck"],
        ["Edit / remove", "manage-paychecks"],
      ],
    )}${stat(
      "Actual cash remaining",
      recorded(s.cash_remaining_month),
      "Recorded pay − actual expenses · Not savings",
      "wallet",
      [
        ["Edit pay", "manage-paychecks"],
        ["Edit expenses", "manage-expenses"],
      ],
    )}${stat(
      "Actual savings balance",
      money(s.saved),
      "Deposits − withdrawals · Since Jan 2026",
      "savings",
      [
        ["Add", "add-savings"],
        ["Withdraw", "withdraw-savings"],
        ["History", "manage-savings"],
      ],
    )}${stat("Remaining actual goal", money(s.remaining), `${s.progress}% actually saved · ${money(s.goal)} goal`, "analytics", [["Edit goal", "edit-goal"]])}</div>
    <div class="dashboard-middle">${incomeCard()}${savingsCard(s)}</div><div class="dashboard-bottom"><section class="card"><div class="card-head card-header-padded"><div><h2>Recent shifts</h2><p>Your latest work entries</p></div><a class="btn-link" href="#shifts">View all →</a></div>${shiftTable(s.recent_shifts, true)}</section><section class="card"><div class="card-head card-header-padded"><div><h2>Recent transactions</h2><p>Actual expenses and savings deposits</p></div><a class="btn-link" href="#money">View all →</a></div>${recentTransactions(s.recent_transactions)}</section></div>`
  );
}

export function filters(type, jobs = []) {
  return `<form id="filter-form" class="filters">${type === "shifts" ? `<label>Job<select name="job_id"><option value="">All jobs</option>${jobsOptions(jobs)}</select></label>` : `<label>Type<select name="type"><option value="">All transactions</option><option value="expense">Expenses</option><option value="savings">Savings deposits</option><option value="withdrawal">Savings withdrawals</option></select></label><label>Category<select name="category"><option value="">All categories</option>${[...categories, "Savings"].map((c) => `<option>${c}</option>`).join("")}</select></label>`}<label>From<input type="date" name="from"></label><label>Through<input type="date" name="to"></label><button class="btn btn-primary">Apply</button><button type="button" class="btn" data-action="filter-week">This week</button><button type="button" class="btn" data-action="filter-month">This month</button><button type="button" class="btn" data-action="filter-reset">Reset</button></form>`;
}
export function shiftsPage(s, jobs) {
  return (
    heading(
      "MAKE EVERY HOUR COUNT",
      "Shift history",
      "Log completed work, make corrections, and review your gross earnings.",
      button("Log shift", "add-shift"),
    ) +
    `<section class="card card-pad">${filters("shifts", jobs)}<div id="filtered-results">${shiftTable(s.all_shifts)}</div></section><p class="form-note mt-4">Dates and times use America/Vancouver. Overnight shifts have an explicit next-day end date. Gross estimates exclude overtime, holiday pay, and deductions.</p>`
  );
}

export function transactionsTable(rows) {
  if (!rows.length) return empty("No transactions match this view.");
  return `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${dateOnly(t.date)}</td><td><strong>${escape(t.description || "—")}</strong></td><td>${escape(t.category)}</td><td><span class="badge">${t.type === "savings" ? "Savings deposit" : t.type === "withdrawal" ? "Savings withdrawal" : "Expense"}</span></td><td><strong>${money(t.amount)}</strong></td><td><div class="row-actions"><button class="btn btn-sm" data-action="edit-transaction" data-id="${t.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-transaction" data-id="${t.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`;
}
export function moneyPage(s) {
  return (
    heading(
      "KNOW WHERE IT GOES",
      "Money",
      "Paychecks in, expenses out, and what you set aside.",
      button("Add transaction", "add-transaction"),
    ) +
    `<div class="section-grid">${savingsCard(s)}${incomeCard()}</div><section class="card card-pad section-spacer"><div class="card-head"><h2>Paychecks</h2>${button("Record paycheck", "add-paycheck", "btn-secondary")}</div>${paycheckTable(s)}</section><section class="card card-pad section-spacer"><div class="card-head"><h2>Expenses and savings</h2></div>${filters("transactions")}<div id="filtered-results">${transactionsTable(s.all_transactions)}</div></section>`
  );
}

export function settingsPage(s, jobs, rates) {
  return (
    heading(
      "MAKE IT YOURS",
      "Settings",
      "Your goal, your pay rules, your workspace.",
    ) +
    `<div class="section-grid"><div class="stack"><section class="card card-pad"><div class="card-head"><div><h2>Savings goal</h2><p>Give your progress a destination.</p></div>${icon("savings")}</div><form id="goal-form"><label>Goal amount (CAD)<input name="amount" type="number" min="0.01" step="0.01" max="999999999" value="${s.goal}" required></label><div class="form-actions"><button class="btn btn-primary">Save goal</button></div></form></section><section class="card card-pad"><h2>Workspace details</h2><div class="rate-row"><span>Currency</span><strong>Canadian dollar (CAD)</strong></div><div class="rate-row"><span>Timezone</span><strong>America/Vancouver</strong></div><div class="rate-row"><span>Week starts</span><strong>Monday</strong></div><div class="rate-row"><span>Take-home pay</span><strong>Not configured</strong></div><p class="form-note mt-4">This is a personal workspace. Use private access or add authentication before hosting real financial data publicly.</p></section></div><section class="card card-pad"><div class="card-head"><div><h2>Pay configuration</h2><p>Date-effective rates, calculated on the server.</p></div>${icon("earnings")}</div><form id="rate-form" class="form-grid"><label>Job<select name="job_id">${jobsOptions(jobs)}</select></label><label>Effective from<input name="effective_from" type="date" value="${today()}" required></label><label>Base rate (CAD/hour)<input name="base_rate" type="number" min="0.01" step="0.01" required></label><label>Premium rate (optional)<input name="premium_rate" type="number" min="0.01" step="0.01"></label><label>Premium starts<input name="premium_start" type="time" value="22:00" required></label><label>Premium ends<input name="premium_end" type="time" value="05:30" required></label><p class="form-note full-width">Home Depot’s premium window is 10 PM–5:30 AM. Updating a rule recalculates shifts from that effective date until the next rule. Use a new effective date for a raise.</p><div class="form-actions full-width mt-0"><button class="btn btn-primary">Save pay rule</button></div></form><div class="rate-list">${rates.map((r) => `<div class="rate-row"><div><strong>${escape(jobs.find((j) => j.id === r.job_id)?.name)}</strong><small>From ${r.effective_from === "1900-01-01" ? "initial history" : dateOnly(r.effective_from)}</small></div><div class="text-right"><strong>${money(r.base_rate)}/hr</strong>${r.premium_rate ? `<small>${money(r.premium_rate)}/hr · ${String(Math.floor(r.premium_start / 60)).padStart(2, "0")}:${String(r.premium_start % 60).padStart(2, "0")}–${String(Math.floor(r.premium_end / 60)).padStart(2, "0")}:${String(r.premium_end % 60).padStart(2, "0")}</small>` : ""}<button class="btn-link mt-2" data-action="load-rate" data-id="${r.id}">Edit this rule</button></div></div>`).join("")}</div></section></div>`
  );
}
