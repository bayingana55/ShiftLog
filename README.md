# ShiftLog

A personal work log and financial planning dashboard for multiple jobs. Record completed shifts, calculate gross earnings, track actual paychecks and spending, and compare projected savings with money explicitly saved.

Built with Express, PostgreSQL, and vanilla JavaScript for a BCIT CST portfolio. Tracked work and financial history starts **January 1, 2026**.

## Features

- Responsive dashboard with weekly hours, gross earnings, planned/actual expenses, actual pay received, cash remaining, and savings progress.
- **Log shift** with explicit start/end dates and times, unpaid breaks, editing, confirmed deletion, and filters. Overnight shifts use the next calendar date for the end.
- Centralized date-effective base/premium pay rules and precise or proportional unpaid-break allocation.
- Actual paycheck CRUD by employer and payday, with optional gross amount, work dates, and notes.
- A shared biweekly payday schedule anchored to **September 18, 2026**, without inferred payroll cutoffs.
- Recurring monthly budgets with custom categories, independent expenses, savings deposits, and withdrawals.
- January-2026-to-current-month analytics with planned/actual expense selection and separate cumulative savings series.
- Idempotent historical schedule preview/import restricted to **January 1–September 17, 2026**.
- A configurable savings goal, initially **$28,000**.
- Automated unit, PostgreSQL integration, and desktop/mobile browser tests.

The application is a completed-work log. Legacy clock endpoints remain for API compatibility; there is no clock-in/out workflow or elapsed timer in the UI.

## Screenshots

![ShiftLog desktop overview](docs/screenshots/dashboard-desktop.png)

<img src="docs/screenshots/dashboard-mobile.png" alt="ShiftLog mobile overview" width="320">

## Financial concepts

| Concept                  | Source / calculation                                                                         |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| Gross earnings           | Completed logged shifts × applicable pay rates, minus unpaid breaks                          |
| Estimated gross paycheck | Logged shift earnings within explicitly known work dates; unavailable if coverage is unknown |
| Actual pay received      | Amounts manually recorded against each employer/payday                                       |
| Planned expenses         | Recurring monthly budget, effective from a selected month                                    |
| Actual expenses          | Recorded expense transactions                                                                |
| Projected savings        | Gross earned − planned expenses                                                              |
| Actual cash remaining    | Recorded pay received − actual expenses; not automatically savings                           |
| Actual savings           | Recorded savings deposits minus withdrawals                                                  |

Actual pay and cash remaining are **Not recorded** when a month contains no paycheck records. An explicitly recorded zero paycheck is $0, not missing data. When only some paychecks are entered, the recorded total may be incomplete; the UI shows the record count and labels that limitation. Missing paychecks never erase gross earnings.

Projected savings are a before-deductions planning figure, **not a bank balance**. Each tracked month uses its full planned budget, including the current partial month. No future work income is extrapolated. Negative monthly projections reduce cumulative projections. Actual savings progress and remaining goal use deposits minus withdrawals, separately from projected progress.

## Editing from Overview

Every summary card has visible actions for its underlying records:

- **Planned expenses → Edit budget:** choose an effective month, add/rename categories, change amounts, or remove categories. Save an empty list to clear the plan from that month. Switching months loads the budget applicable to that month.
- **Actual expenses → Add expense / Edit / remove:** manage recorded purchases without leaving Overview. Search the record list to find older entries.
- **Actual savings balance → Set balance:** enter a higher or lower amount, including zero. The app records the difference as a dated deposit or withdrawal; it never silently overwrites history.
- **Actual savings balance → Add / Withdraw / History:** record transfers or edit/delete existing records. Withdrawals do not count as purchases or change gross-based projections.
- **Remaining actual goal → Edit goal:** change the target directly.
- **Pay and hours cards:** add/edit/delete paychecks or shifts through searchable record managers.
- **Projected savings → Change projection:** update the underlying budget/work entries, or switch to setting actual savings. A computed projection is not an editable bank balance.

Deletes require confirmation. Savings changes that would leave the current balance negative are rejected; correct the associated withdrawal before deleting a deposit it depends on. Record an expense separately if withdrawn savings was spent. Savings transfers are separate from the “actual cash remaining” calculation, which remains actual pay minus actual expenses.

## Monthly budget

The initial recurring plan applies from January 2026:

| Category            | Monthly amount |
| ------------------- | -------------: |
| Rent                |         $1,500 |
| Groceries           |           $300 |
| Bills               |           $150 |
| Clothes & Going Out |           $200 |
| **Total**           |     **$2,150** |

Settings can save a new budget effective from a selected month. Earlier months keep their previous rates. Updating an existing effective month revises that plan. Budget entries do not create individual purchases, paychecks, or savings deposits. Categories can be added, renamed, or removed. Removed categories get a zero rate from the selected month so earlier budgets remain intact; a later explicit revision can reintroduce them. Budget categories are separate from transaction categories; reports compare their totals rather than inventing category mappings.

## Paydays and paychecks

Both employers use the same confirmed payday sequence: September 18, 2026 plus or minus multiples of 14 calendar days. This includes January 9, January 23, September 4, September 18, October 2, and October 16. Dates are calendar calculations and do not imply actual receipt, holiday adjustments, or covered work dates.

Work-period coverage is initially **unconfigured for both jobs**. No shifts are assigned to a paycheck from the payday anchor alone. Settings can later record the last work date covered by the anchor paycheck, separately for each employer. Only then does the app construct consecutive, inclusive 14-day work periods. Shifts are attributed by Vancouver start date. Periods extending before January 2026 are labeled partial history.

An actual paycheck record can be added without either work date or a gross amount. If dates are supplied, both are required and must form a valid interval ending on or before payday. Known work dates also enable a shift-based gross estimate for that record. This does not configure all other paychecks automatically.

One paycheck record is allowed per employer/payday, so Apple and Home Depot can both have records on September 18. Off-schedule payment dates are supported in the actual-paycheck list. A recorded gross amount is separate from the amount received. The displayed gross-minus-actual difference is **not classified as tax or deductions**.

## Tech stack and architecture

HTML, compiled Tailwind CSS/component CSS, vanilla JavaScript ES modules, Chart.js, Node.js 22+, Express 5, PostgreSQL, `pg`, and `dotenv`. Moment Timezone provides consistent Vancouver timezone data on the server and browser. Playwright and Prettier are development tooling. No frontend framework or ORM.

```text
Browser: public/index.html + public/js modules
                  │ fetch /api/* (JSON)
                  ▼
server.js → routes/api.js → validation / pay / planning / summary modules
                  │ parameterized pg queries
                  ▼
PostgreSQL
```

`lib/pay.js` owns gross earnings calculations. `lib/planning.js` owns the history bounds, month sequence, recurring budgets, and optional payroll coverage. `lib/data.js` builds the dashboard and chart data. `public/js/planning-views.js` renders budget, cash-flow, and paycheck tables. The frontend displays server-calculated figures.

## Database design

| Table               | Purpose                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `jobs`              | Employer identities and preserved original wage field                                       |
| `shifts`            | Start/end instants, break duration/start, source, durable historical import key; FK to jobs |
| `pay_rates`         | Date-effective base/premium rules; authoritative for earnings                               |
| `transactions`      | Actual expenses, savings deposits, or withdrawals, with a local calendar date               |
| `savings_goals`     | Singleton savings target                                                                    |
| `budget_rates`      | Recurring category amounts keyed by category/effective month                                |
| `payroll_schedule`  | Shared payday anchor and 14-day interval                                                    |
| `payroll_coverage`  | Optional anchor work-period end per employer                                                |
| `paychecks`         | Actual amount, optional gross/period dates, notes, creation/update timestamps; FK to jobs   |
| `schema_migrations` | Applied migration versions                                                                  |

Migrations are transactional and safe to rerun. `001` preserves existing jobs/shifts and interprets original timestamp-without-zone values as Vancouver wall times when converting to `TIMESTAMPTZ`. Review that assumption before migrating a different legacy database. `002` sets the confirmed Home Depot premium cutoff to 05:30. `003` adds budgets, payday/coverage settings, and actual paychecks. `004` adds withdrawal support and permits custom budget category names. It does not insert actual purchases or payments.

The original `jobs.hourly_wage` remains for compatibility; Settings changes `pay_rates`. Database constraints enforce valid durations, breaks, amounts, optional period pairs, and one actual paycheck per employer/payday. Shift writes use a transaction lock and overlap checks, with an additional database index protecting legacy active shifts.

## Local installation

Requirements: Node.js 22+, npm, and a running PostgreSQL server.

```sh
npm ci
cp .env.example .env
createdb shiftlog  # only if the database does not already exist
npm run migrate
npm run build
npm start
```

Open **http://127.0.0.1:3000**. Existing installations only need pending migrations and the rebuilt frontend; do not recreate the database.

### Environment variables

| Variable                 | Purpose                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | Optional deployment connection; otherwise local database `shiftlog` and pg/OS-user defaults |
| `PORT`                   | Default `3000`                                                                              |
| `HOST`                   | Default `127.0.0.1`; use `0.0.0.0` in a hosted container                                    |
| `PGSSLMODE`              | Provider-specific TLS configuration, if required                                            |
| `TEST_DATABASE_URL`      | Dedicated test database; name must end in `_test`                                           |
| `PLAYWRIGHT_CHROME_PATH` | Optional existing Chrome executable for browser tests                                       |

Standard pg variables such as `PGHOST`, `PGUSER`, and `PGPASSWORD` also work. `.env`, keys, local credentials, backups, and dependencies are ignored. `.env.example` contains placeholders only.

### Commands

| Command                                   | Purpose                                                |
| ----------------------------------------- | ------------------------------------------------------ |
| `npm start` / `npm run dev`               | Start Express / restart backend on changes             |
| `npm run build` / `npm run css:watch`     | Compile styles / watch frontend styles                 |
| `npm run migrate`                         | Apply pending migrations                               |
| `npm run history:preview`                 | Read-only preview of the authorized historical range   |
| `npm run history:import`                  | Import that schedule with duplicate/overlap protection |
| `npm test`                                | Unit tests, no database needed                         |
| `npm run test:integration`                | Real PostgreSQL API tests in disposable test schemas   |
| `npm run test:e2e`                        | Browser workflows on desktop/mobile                    |
| `npm run format` / `npm run format:check` | Format source / check formatting                       |

## API overview

All routes below use `/api`. Writes accept JSON. Successful deletes return 204; errors return `{ "error": "Useful message" }`. SQL values are parameterized and validation runs on the server.

| Routes                                                     | Purpose                                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /jobs`                                                | Employer list                                                                              |
| `GET /shifts?job_id=&from=&to=`                            | Joined work entries with paid hours, gross, and break method                               |
| `POST /shifts`, `PATCH /shifts/:id`, `DELETE /shifts/:id`  | Manual work-log CRUD; creation requires an end timestamp                                   |
| `GET/POST /transactions`, `PATCH/DELETE /transactions/:id` | Expense/deposit/withdrawal CRUD; reads accept type/category/date filters                   |
| `GET/POST /paychecks`, `PATCH/DELETE /paychecks/:id`       | Actual-paycheck CRUD; work dates/gross remain optional                                     |
| `GET /pay-periods`                                         | Confirmed payday sequence and optional coverage/estimates                                  |
| `PUT /payroll-coverage`                                    | Set or clear `{ job_id, anchor_period_end }`                                               |
| `GET/PUT /budget`                                          | Date-effective budget rows; writes use `{ effective_from, items: [{ category, amount }] }` |
| `GET/PUT /savings-goal`                                    | Read/set `{ amount }`                                                                      |
| `GET/PUT /pay-rates`                                       | Read/upsert rules by employer/effective date                                               |
| `GET /dashboard`, `GET /analytics`                         | Financial summaries and January-start monthly chart data                                   |
| `POST /history/preview`, `POST /history/import`            | Range preview and selected import keys, bounded to Jan 1–Sep 17                            |
| `POST /clock-in`, `PATCH /shifts/:id/clock-out`            | Legacy API compatibility only; not used by the UI                                          |

An actual paycheck can be recorded without knowing its covered work dates:

```json
{
  "job_id": 1,
  "payday": "2026-09-18",
  "actual_amount": 1200,
  "notes": "Example amount; replace with the actual deposit"
}
```

No example amount is seeded into the database. A manual overnight shift uses `clock_in: "2026-09-17T21:00"`, `clock_out: "2026-09-18T05:30"`, and `break_minutes: 30`. These API field names are retained even though the UI calls them start/end dates.

`PUT /api/savings-balance` accepts `{ "amount": 500 }` and records only the difference from the current savings balance as a transaction dated today. Repeating the same target is a no-op. Balance reads and transaction mutations share a lock, so concurrent withdrawals cannot overdraw savings.

## Gross earnings and timezone rules

Apple starts at $25/hour; Home Depot at $20.47 base and $22.72 premium. The confirmed premium window is **22:00–05:30**, configurable in Settings. Base pay resumes at 05:30.

The pay engine splits actual elapsed time at minute boundaries, selects the applicable Vancouver local date/effective rate, and deducts unpaid time. An exact break start deducts from the actual rate segments it overlaps. Without a break start, unpaid minutes are allocated proportionally across rates. Gross is rounded to cents per shift before summing reports.

- Apple 8 AM–1 PM without a break: **$125.00**.
- Apple 10 AM–7 PM with a 60-minute break: **$200.00**.
- Home Depot 9 PM–5:30 AM with an untimed 30-minute break: **$179.64**.
- The same Home Depot shift with its 30-minute break at 1 AM: **$179.51**.

Entire shifts belong to their Vancouver **start date** for weekly/monthly and configured work-period reports. Actual payments belong to their **payday**, which may be a different month. Weeks begin Monday. Dates/times use `America/Vancouver`, not fixed-offset subtraction. `TIMESTAMPTZ` values serialize as UTC and render in Vancouver. Invalid spring-transition wall times are rejected. Calendar dates stay strings.

## Historical schedule

The historical importer is limited to January 1–September 17, 2026, inclusive by **shift start date**. The September 17 overnight shift ends September 18; no September 18/19 starting shifts are imported. Subsequent work is entered manually.

- January–April: Home Depot Monday/Thursday/Saturday, 21:00–05:30 next day, 30-minute unpaid break.
- May 1–September 7: Home Depot Monday–Thursday/Saturday; Apple Monday 08:00–13:00, Friday 18:00–22:00, Thursday/Saturday 10:00–19:00 with 60-minute lunch, Sunday 09:30–18:30 with 60-minute lunch.
- September 8–17: Home Depot Thursday/Saturday; Apple Monday/Friday/Saturday/Sunday with the same times.
- No January–April Apple schedule, occasional Apple Tuesdays, sick days, or other exceptions are inferred.

The supplied recurring schedule contains **245 shifts**. The local import preserved the two matching original rows and inserted 243 missing entries; rerunning inserted zero. Imported rows stay labeled as schedule estimates so exceptions can be corrected. SQL migrations do not automatically populate history on other installations: preview, review, and run the import command or use the UI. No paychecks, actual expenses, or savings deposits are fabricated.

## Testing

```sh
npm test
createdb shiftlog_test  # once
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:integration
npx playwright install chromium
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:e2e
```

Tests create uniquely named schemas in the separate test database and clean up only those schemas. Coverage includes pay boundaries, overnight work, history cutoff/idempotency, January-start reporting, budget revisions, projected/actual separation, payday anchoring, optional paycheck dates, real zero versus missing pay, CRUD, and browser forms. See [verification notes](docs/VERIFICATION.md).

## Deployment and scope

Install dependencies, build CSS, configure a secret database URL and host/port, run migrations as a release step, and start Node behind HTTPS. Use the PostgreSQL provider's verified TLS settings. Serve the frontend/API from the same origin.

The co-op version intentionally excludes tax/CPP/EI calculations, overtime, employer contributions, and authentication. `lib/payroll.js` returns unavailable net-pay estimation; actual received amounts can still be recorded from deposits without calculating deductions. Keep real financial data private; a public interactive demo needs disposable data or access controls.

Other limitations: no multi-goal budgeting, no CSV import/export, no job-creation UI, no immutable payroll snapshots, and no automatic cutoff/holiday-payday inference. Budget plans apply to whole months. Summaries calculate personal records in Node; larger datasets need pagination and cached aggregates. Browser timezone data covers 1970–2030 and should be kept current. Actual cash remaining excludes transfers into savings; those are shown separately as deposits.

## Learning and future improvements

The code demonstrates validation, parameterized SQL, joins, database constraints, transaction locks, timezones, modular business rules, chart datasets, and isolated integration testing. Future improvements include verified payroll rules, immutable pay snapshots, authentication/ownership, exports, and reporting performance.

[PROJECT_WALKTHROUGH.md](docs/PROJECT_WALKTHROUGH.md) explains the implementation. [INTERVIEW_NOTES.md](docs/INTERVIEW_NOTES.md) summarizes the architecture and tradeoffs.
