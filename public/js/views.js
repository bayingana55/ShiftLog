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
  ["earnings", "Earnings", "earnings"],
  ["transactions", "Transactions", "transactions"],
  ["savings", "Savings", "savings"],
  ["analytics", "Analytics", "analytics"],
  ["history", "Import history", "history"],
  ["settings", "Settings", "settings"],
];
export function stat(label, value, note, iconName) {
  return `<div class="stat-card"><div class="stat-top"><span>${label}</span><span class="stat-icon">${icon(iconName)}</span></div><div class="stat-value">${value}</div><div class="stat-note">${note}</div></div>`;
}
export function shiftTable(shifts, compact = false) {
  if (!shifts.length)
    return empty(
      "No shifts here yet. Your next shift starts the story.",
      button("Add a shift", "add-shift", "btn-secondary"),
    );
  return `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Job</th>${compact ? "" : "<th>Clock in → out</th><th>Break</th>"}<th>Paid hours</th><th>Gross pay</th>${compact ? "" : "<th>Actions</th>"}</tr></thead><tbody>${shifts.map((s) => `<tr><td><strong>${day(s.clock_in)}</strong>${!compact && s.source === "schedule" ? "<small>Schedule estimate</small>" : ""}</td><td>${badge(s)}</td>${compact ? "" : `<td>${time(s.clock_in)} → ${time(s.clock_out)}${s.clock_out && day(s.clock_in) !== day(s.clock_out) ? `<small>Ends ${day(s.clock_out)}</small>` : ""}</td><td>${s.break_minutes} min${s.break_method === "proportional" ? "<small>Proportional</small>" : ""}</td>`}<td>${s.clock_out ? `${hours(s.paid_hours)} hrs` : '<span class="badge active-badge">Active</span>'}</td><td><strong>${s.clock_out ? money(s.gross) : "—"}</strong></td>${compact ? "" : `<td><div class="row-actions"><button class="btn btn-sm" data-action="edit-shift" data-id="${s.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-shift" data-id="${s.id}" aria-label="Delete shift on ${day(s.clock_in)}">Delete</button></div></td>`}</tr>`).join("")}</tbody></table></div>`;
}
function recentTransactions(rows) {
  if (!rows.length)
    return empty(
      "No transactions yet. Track an expense or set something aside.",
      button("Add transaction", "add-transaction", "btn-secondary"),
    );
  return `<div class="transaction-list">${rows.map((t) => `<div class="transaction-item"><span class="transaction-symbol">${icon(t.type === "savings" ? "savings" : t.category === "Food" ? "food" : "wallet")}</span><div class="transaction-copy"><strong>${escape(t.description || t.category)}</strong><small>${escape(t.category)} · ${dateOnly(t.date)}</small></div><span class="transaction-amount ${t.type === "savings" ? "positive" : ""}">${t.type === "expense" ? "−" : "+"}${money(t.amount)}</span></div>`).join("")}</div>`;
}
export function clockBanner(s, jobs) {
  return `<section class="clock-banner" aria-label="Clock in or out"><div class="clock-symbol">${icon("clock")}</div><div><h2>${s.active ? `On the clock at ${escape(s.active.job_name)}` : "Ready when you are."}</h2><p class="muted">${s.active ? `Started ${time(s.active.clock_in)} · <span id="elapsed" data-start="${s.active.clock_in}">Tracking time…</span>` : "No active shift. Choose your job and start tracking."}</p></div><div class="clock-actions">${s.active ? button("Clock out", "clock-out", "btn-primary", "stop") : `<label class="sr-only" for="clock-job">Job</label><select id="clock-job">${jobsOptions(jobs)}</select>${button("Clock in", "clock-in", "btn-primary", "play")}`}</div></section>`;
}
export function incomeCard(id = "income-chart", title = "Income vs. spending") {
  return `<section class="card card-pad"><div class="card-head"><div><h2>${title}</h2><p>Monthly overview · Last 12 months</p></div><div class="legend"><span><i></i>Income</span><span><i class="spend"></i>Spending</span></div></div><div class="chart-wrap"><canvas id="${id}" role="img" aria-label="Monthly gross income compared with spending. Exact values are available in Analytics."></canvas></div></section>`;
}
function savingsCard(s) {
  return `<section class="card card-pad savings-card"><div class="card-head"><div><h2>Your next milestone</h2><p>A little closer with every deposit.</p></div>${icon("savings")}</div><div class="goal-total">${money(s.saved)} <span>of ${money(s.goal)}</span></div><div class="progress" role="progressbar" aria-label="Savings goal" aria-valuenow="${Math.min(100, s.progress)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${Math.min(100, s.progress)}%"></div></div><div class="progress-labels"><span>${s.progress}% of your goal</span><span>${s.progress >= 100 ? "Goal reached!" : "Keep it growing"}</span></div><div class="savings-foot"><div><small class="muted">Still to save</small><strong>${money(s.remaining)}</strong></div><button class="btn" data-action="add-savings">Add savings ${icon("plus")}</button></div></section>`;
}
export function dashboard(s, jobs) {
  return (
    heading(
      "YOUR BIG PICTURE",
      "A little work. A little progress.",
      "Your hours, earnings, and goals — all in one place.",
      button("Add transaction", "add-transaction"),
    ) +
    clockBanner(s, jobs) +
    `<div class="stat-grid">${stat("Hours this week", `${hours(s.hours_week)} <span class="text-base font-normal text-[#899581]">hrs</span>`, "Completed shifts · Monday–Sunday", "clock")}${stat("Gross income this month", money(s.gross_month), `${money(s.gross_week)} earned this week`, "earnings")}${stat("Spending this month", money(s.spending_month), "Recorded expenses only", "wallet")}${stat("Income less spending", money(s.balance_month), `<span class="${s.balance_month >= 0 ? "positive" : "negative"}">${s.balance_month >= 0 ? "Income is keeping up" : "Spending is ahead of income"}</span> · Before tax`, "analytics")}</div>
    <div class="dashboard-middle">${incomeCard()}${savingsCard(s)}</div>
    <div class="dashboard-bottom"><section class="card"><div class="card-head card-header-padded"><div><h2>Recent shifts</h2><p>Your latest time on the clock</p></div><a class="btn-link" href="#shifts">View all →</a></div>${shiftTable(s.recent_shifts, true)}</section><section class="card"><div class="card-head card-header-padded"><div><h2>Recent transactions</h2><p>The ins and outs</p></div><a class="btn-link" href="#transactions">View all →</a></div>${recentTransactions(s.recent_transactions)}</section></div>`
  );
}
export function filters(type, jobs = []) {
  return `<form id="filter-form" class="filters">${type === "shifts" ? `<label>Job<select name="job_id"><option value="">All jobs</option>${jobsOptions(jobs)}</select></label>` : `<label>Type<select name="type"><option value="">All transactions</option><option value="expense">Expenses</option><option value="savings">Savings deposits</option></select></label><label>Category<select name="category"><option value="">All categories</option>${[...categories, "Savings"].map((c) => `<option>${c}</option>`).join("")}</select></label>`}<label>From<input type="date" name="from"></label><label>Through<input type="date" name="to"></label><button class="btn btn-primary">Apply</button><button type="button" class="btn" data-action="filter-week">This week</button><button type="button" class="btn" data-action="filter-month">This month</button><button type="button" class="btn" data-action="filter-reset">Reset</button></form>`;
}
export function shiftsPage(s, jobs) {
  return (
    heading(
      "MAKE EVERY HOUR COUNT",
      "Shift history",
      "Review your work, make corrections, and see what you earned.",
      button("Add shift", "add-shift"),
    ) +
    clockBanner(s, jobs) +
    `<section class="card card-pad">${filters("shifts", jobs)}<div id="filtered-results">${shiftTable(s.all_shifts)}</div></section><p class="form-note mt-4">Dates and times use America/Vancouver. Overnight shifts end on the following date. Gross estimates exclude overtime, holiday pay, and deductions.</p>`
  );
}
export function transactionsTable(rows) {
  if (!rows.length) return empty("No transactions match this view.");
  return `<div class="table-scroll"><table><thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Type</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rows.map((t) => `<tr><td>${dateOnly(t.date)}</td><td><strong>${escape(t.description || "—")}</strong></td><td>${escape(t.category)}</td><td><span class="badge">${t.type === "savings" ? "Savings deposit" : "Expense"}</span></td><td><strong>${money(t.amount)}</strong></td><td><div class="row-actions"><button class="btn btn-sm" data-action="edit-transaction" data-id="${t.id}">Edit</button><button class="btn btn-sm btn-danger" data-action="delete-transaction" data-id="${t.id}">Delete</button></div></td></tr>`).join("")}</tbody></table></div>`;
}
export function transactionsPage(s) {
  return (
    heading(
      "KNOW WHERE IT GOES",
      "Transactions",
      "Every expense and every deposit, in one place.",
      button("Add transaction", "add-transaction"),
    ) +
    `<div class="stat-grid">${stat("Spent this month", money(s.spending_month), "Recorded expenses", "wallet")}${stat("Total saved", money(s.saved), "Recorded savings deposits", "savings")}${stat("Gross income this month", money(s.gross_month), "Before deductions", "earnings")}${stat("Income less spending", money(s.balance_month), "Not automatically saved", "analytics")}</div><section class="card card-pad">${filters("transactions")}<div id="filtered-results">${transactionsTable(s.all_transactions)}</div></section>`
  );
}
export function savingsPage(s) {
  return (
    heading(
      "BUILD SOMETHING BIGGER",
      "Savings goal",
      "Progress comes from the money you actually set aside.",
      button("Add savings", "add-savings"),
    ) +
    `<div class="section-grid"><div>${savingsCard(s)}<p class="form-note mt-4">Only savings deposits count toward your goal. Unspent gross earnings are not automatically savings. <a class="underline" href="#settings">Change your goal in Settings.</a></p></div><section class="card card-pad"><div class="card-head"><div><h2>Savings over time</h2><p>Cumulative recorded deposits · Last 12 months</p></div></div><div class="chart-wrap"><canvas id="savings-chart" role="img" aria-label="Cumulative savings deposits over the past 12 months"></canvas></div></section></div><section class="card card-pad section-spacer"><div class="card-head"><h2>Savings deposits</h2></div>${transactionsTable(s.all_transactions.filter((t) => t.type === "savings"))}</section>`
  );
}
export function earningsPage(s) {
  return (
    heading(
      "THE VALUE OF YOUR TIME",
      "Earnings",
      "A clear breakdown of your gross pay across both jobs.",
    ) +
    `<div class="stat-grid">${stat("This week", money(s.gross_week), "Gross · Completed shifts", "earnings")}${stat("This month", money(s.gross_month), "Gross · Completed shifts", "earnings")}${stat("All time", money(s.by_job.reduce((v, j) => v + j.earnings, 0)), "Gross · Recorded shifts", "analytics")}${stat("Take-home pay", "Unavailable", "Payroll rules not configured", "wallet")}</div><div class="notice">Gross estimates use your configured rates. Unpaid breaks are allocated proportionally unless you record a break start. Taxes, CPP, EI, overtime, and holiday premiums are not included.</div><div class="section-grid">${incomeCard("earnings-chart", "Gross earnings over time")}<section class="card card-pad"><div class="card-head"><h2>Earnings by job · All time</h2></div>${s.by_job.map((j) => `<div class="rate-row"><div><strong>${escape(j.name)}</strong><small>${hours(j.hours)} paid hours</small></div><strong>${money(j.earnings)}</strong></div>`).join("")}<p class="form-note mt-5">Pay rules are centralized on the server. <a href="#settings" class="underline">Review your pay configuration.</a></p></section></div>`
  );
}
export function analyticsPage(s) {
  return (
    heading(
      "SPOT THE PATTERNS",
      "Your work, in perspective",
      "Compare income and spending, and see where your hours go.",
    ) +
    `<div class="section-grid">${incomeCard()}<section class="card card-pad"><div class="card-head"><div><h2>Savings progress</h2><p>Cumulative deposits · Last 12 months</p></div></div><div class="chart-wrap"><canvas id="savings-chart" role="img" aria-label="Cumulative savings"></canvas></div></section><section class="card card-pad"><div class="card-head"><h2>Paid hours by job · All time</h2></div><div class="chart-wrap"><canvas id="hours-chart" role="img" aria-label="Paid hours by job"></canvas></div><p class="chart-summary">${s.by_job.map((j) => `${escape(j.name)}: ${hours(j.hours)} hrs`).join(" · ")}</p></section><section class="card card-pad"><div class="card-head"><h2>Gross earnings by job · All time</h2></div><div class="chart-wrap"><canvas id="job-earnings-chart" role="img" aria-label="Gross earnings by job"></canvas></div><p class="chart-summary">${s.by_job.map((j) => `${escape(j.name)}: ${money(j.earnings)}`).join(" · ")}</p></section></div><section class="card section-spacer"><div class="card-head card-header-padded"><h2>The numbers behind the charts</h2></div><div class="table-scroll"><table><thead><tr><th>Month</th><th>Gross income</th><th>Spending</th><th>Difference</th><th>Savings deposited</th><th>Total saved</th></tr></thead><tbody>${s.monthly.map((m) => `<tr><td>${m.month}</td><td>${money(m.income)}</td><td>${money(m.spending)}</td><td>${money(m.income - m.spending)}</td><td>${money(m.savings)}</td><td>${money(m.saved_total)}</td></tr>`).join("")}</tbody></table></div></section>`
  );
}
export function historyPage() {
  return (
    heading(
      "FILL IN THE PICTURE",
      "Import work history",
      "Preview your regular schedule, then choose the shifts you actually worked.",
    ) +
    `<div class="notice"><strong>Schedules are estimates, not proof of attendance.</strong> Uncheck days you did not work. Existing or overlapping shifts are skipped. Apple history starts in May because earlier dates were not specified. Occasional Apple Tuesdays are excluded; add those actual dates manually.</div><section class="card card-pad"><form id="history-form" class="filters"><label>From<input type="date" name="from" value="2026-01-01" min="2026-01-01" max="${today()}" required></label><label>Through<input type="date" name="to" value="${today()}" max="${today()}" required></label><button class="btn btn-primary">Preview shifts</button></form><p class="form-note">Home Depot: Mon/Thu/Sat before May; Mon/Tue/Wed/Thu/Sat from May 1–Sep 7; Thu/Sat from Sep 8. Apple: Mon/Fri/Sat/Sun from May, plus Thursdays through Sep 7. No future or unfinished shifts are generated.</p><div id="history-results" class="section-spacer">${empty("Nothing is inserted until you preview, select, and confirm.")}</div></section>`
  );
}
export function historyResults(rows) {
  const ready = rows.filter((s) => s.status === "ready");
  return `<div class="card-head"><div><h2>${ready.length} available · ${rows.length - ready.length} existing or conflicting</h2><p>Select only dates you actually worked. All dates are initially unchecked.</p></div><button class="btn" data-action="select-history">Select available</button></div><div class="history-table"><table><thead><tr><th>Select</th><th>Date</th><th>Job</th><th>Time</th><th>Break</th><th>Gross estimate</th><th>Status</th></tr></thead><tbody>${rows.map((s) => `<tr><td><input type="checkbox" name="history-key" value="${escape(s.history_key)}" aria-label="Select ${escape(s.job_name)} ${day(s.clock_in)}" ${s.status === "ready" ? "" : "disabled"}></td><td>${day(s.clock_in)}</td><td>${badge(s)}</td><td>${time(s.clock_in)} → ${time(s.clock_out)}</td><td>${s.break_minutes} min</td><td>${money(s.gross)}</td><td>${s.status}</td></tr>`).join("")}</tbody></table></div><div class="form-actions"><button class="btn btn-primary" data-action="import-history" ${ready.length ? "" : "disabled"}>Import selected shifts</button></div>`;
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
