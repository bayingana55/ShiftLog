# Understanding ShiftLog

This guide explains the source modules, HTTP request lifecycle, database relationships, and calculation rules. `GET /api/jobs` is a simple example of a read request; shift writes add validation and transaction handling.

## 1. Folder structure

```text
server.js                  Express application and final listen call
db.js                     PostgreSQL connection pool
routes/api.js              HTTP handlers, SQL writes, transaction lock
lib/
  validation.js            Request validation and HTTP errors
  time.js                  Vancouver dates, instants, week/month boundaries
  pay.js                   Gross earnings calculation
  payroll.js               Explicitly unavailable net-pay estimator
  planning.js              History bounds, monthly budgets, payday schedule
  history.js               Deterministic schedule candidates
  data.js                  Joined shifts, dashboard, analytics
sql/001_shiftlog.sql        Initial additive schema migration
sql/002_premium_end.sql     Confirmed 05:30 premium cutoff
sql/003_work_planning.sql   Budgets, payday configuration, actual paychecks
sql/004_editable_finances.sql Withdrawals and custom budget categories
scripts/import-history.js  Fixed-range preview and idempotent import
scripts/migrate.js          Versioned, transactional migration runner
scripts/test-server.js     Isolated database for browser tests
public/
  index.html               App shell, navigation region, main, dialog
  css/input.css            Tailwind source and component styles
  css/app.css              Compiled browser stylesheet
  js/app.js                Navigation, data loading, events, form actions
  js/views.js              HTML templates for all screens
  js/planning-views.js      Budget, cash-flow, and paycheck views
  js/forms.js              Modals and form submission
  js/editors.js            Overview record managers, budget/goal/balance editors
  js/ui.js                 Formatting, escaping, fetch wrapper, icons
  js/charts.js             Chart.js lifecycle and datasets
 tests/                    Unit, PostgreSQL integration, browser tests
 docs/                     This guide, interview notes, verification, screenshots
```

## 2. How server.js works

`createApp(db)` creates Express, adds security headers, validates browser write origins and JSON content types, installs the `/api` router, and serves `public/`. It serves only specific required vendor files from `node_modules`, not the entire directory. A final error middleware converts exceptions into useful JSON errors. The final `app.listen()` runs only when starting this file directly. Tests import `createApp` and inject a test pool without automatically starting the normal server.

## 3. Howdb.js works

`dotenv/config` loads `.env`. If `DATABASE_URL` is set, pg uses it. Otherwise the database is `shiftlog` and pg uses its standard local host/user defaults. The exported pool is shared by routes instead of creating a connection per request. No password is embedded in source.

## 4. How the frontend talks to the backend

`api()` in `public/js/ui.js` calls `fetch('/api' + path)`, serializes request bodies as JSON, and parses response JSON. Non-success responses throw an Error using the server's safe message. In `app.js`, `render()` fetches current data, passes it to a view, and creates charts. Modals in `forms.js` send writes, then refresh the page data. No full browser-page reload is required.

## 5. What an API means here

The API is the agreed interface between the browser and Express. For example, `GET /api/shifts` means “return recorded shifts with job names and calculated earnings.” The browser does not connect to PostgreSQL or know database credentials. It understands JSON fields such as `job_id`, `clock_in`, and `gross`.

## 6. GET vs POST vs PATCH vs DELETE (and PUT)

- GET reads data; fetching a history preview uses POST because its range arrives in JSON, but it still performs no writes.
- POST creates a record or requests an operation, such as logging a shift, recording a paycheck, or importing history.
- PATCH updates selected fields of an existing resource; omitted shift fields keep their values.
- DELETE removes a record. The UI confirms first; the API responds with 204 and no body.
- PUT sets a singleton savings goal or upserts a pay rule identified by job/effective date.

## 7. What req and res are

An Express handler receives `req` (the incoming request) and `res` (the outgoing response). `req` contains URL parameters, query strings, headers, and body. `res.status(201).json(row)` sends the created row with a 201 Created status. Routes are in `routes/api.js`.

## 8. What req.body is

`express.json()` parses the JSON sent by `fetch`. A paycheck body might be `{ "job_id": 1, "payday": "2026-09-18", "actual_amount": 1200 }`. `req.body.job_id` reads that submitted value. All browser values are untrusted, even if the HTML input has `required` or `min`. Server functions in `validation.js` check them again.

## 9. What req.params is

For `/api/shifts/:id`, a request to `/api/shifts/12` makes `req.params.id` equal to the string `"12"`. `id()` checks it is a positive safe integer before querying. Query strings are different: `/api/shifts?job_id=2` uses `req.query.job_id`.

## 10. async/await

PostgreSQL and HTTP calls take time and return Promises. `await pool.query(...)` lets a function pause while I/O runs without blocking the Node event loop. A function using await is declared async. Independent summary reads can use `Promise.all`; queries sharing one transaction client run sequentially.

## 11. try/catch

The `write()` helper starts a transaction, executes a callback in try, and commits. If any operation throws, catch rolls the transaction back and rethrows. Finally releases the connection even if an error occurs. Express 5 forwards rejected async route promises to the central error middleware. Frontend try/catch displays an error and re-enables the submit button.

## 12. PostgreSQL Pool

A pool holds reusable connections. Ordinary independent reads use `pool.query`. Transactions require `const client = await pool.connect()` because BEGIN, all queries, and COMMIT must use the same connection. Always call `client.release()` in finally. Forgetting it eventually exhausts the pool.

## 13. Parameterized queries ($1, $2, ...)

Instead of interpolating a user value into SQL, write `SELECT * FROM shifts WHERE id=$1` with a separate values array `[shiftId]`. PostgreSQL treats the supplied value as data, not SQL syntax. Parameters protect values; table/column names must remain trusted code. The dynamic schema identifier in tests is generated entirely from the process ID and timestamp, never from browser input.

## 14. JOINs

`getShifts()` in `lib/data.js` joins `shifts.job_id` to `jobs.id`. Each row receives its employer name without copying that name into every shift. The browser can show both the shift's timestamps and a readable job badge.

## 15. Foreign keys

`shifts.job_id REFERENCES jobs(id)` ensures a shift cannot refer to a job that does not exist. `pay_rates.job_id` does the same for wage rules. Primary keys uniquely identify records; foreign keys express relationships and enforce integrity. Check constraints also reject impossible values, and a partial unique index enforces one active shift.

## 16. How logging a shift works

`shiftForm()` in `public/js/forms.js` collects a job, start date/time, end date/time, unpaid minutes, and an optional exact break start. Both timestamps are required. `POST /api/shifts` validates the input, takes the shared shift-write transaction lock, rejects overlaps, and inserts the completed record. API names `clock_in` and `clock_out` remain for compatibility, but the UI is a work log rather than a live punch clock.

## 17. Editing and legacy clock endpoints

Editing sends changed values to `PATCH /api/shifts/:id`. Validation and overlap checks run before updating the same row. Deletion requires UI confirmation. The old `/clock-in` and `/shifts/:id/clock-out` routes remain for compatibility and retain their active-shift protections. The UI does not call them and has no active timer. A legacy open row can be completed using the edit form.

## 18. How paid hours are calculated

In `lib/pay.js`, completed paid hours are `(end - start - breakMilliseconds) / 3,600,000`. Break minutes are validated as whole non-negative numbers and cannot exceed duration. Legacy open shifts return zero realized hours/pay until an end time is supplied.

## 19. How overnight shifts work

The database stores complete instants, not isolated clock times. A shift begins September 17 at 9 PM and ends September 18 at 5:30 AM. The elapsed duration is positive because the end includes the following date. The form does not guess an overnight date: you enter it. Daylight-saving changes affect actual elapsed hours rather than being patched with a manual seven-hour subtraction.

## 20. How Home Depot differential pay works

`calculatePay()` chooses a rate for each segment ending at a minute boundary. `localDate()` and `localMinute()` resolve Vancouver date and time. The latest effective pay rule supplies the base/premium rates. The confirmed window from 22:00 to 05:30 crosses midnight, so the check is “at/after 22:00 OR before 05:30.” At exactly 05:30 the base rate resumes.

An exact recorded break start deducts unpaid milliseconds from the segment it overlaps. With no break start, each segment gets the same proportional unpaid fraction. This produces a transparent estimate rather than guessing lunch occurred at a particular time. The final shift gross is rounded once to cents. Tests cover both methods, exact boundaries, effective-date changes, and time transitions.

## 21. How transactions work

Transactions have a calendar date, positive amount, type, category, description, and creation instant. `transactionInput()` validates them. Expenses use approved categories. Savings deposits always use category Savings. SQL insert/update/delete handlers return the saved record or a useful error. Calendar dates stay `YYYY-MM-DD` strings instead of being accidentally converted into the previous day in another timezone.

## 22. Projected savings, actual cash, and actual savings

`getSummary()` keeps three separate calculations. Projected savings is gross earned minus planned monthly expenses, accumulated from January 2026. It uses a full budget for every month, including the current month, and permits negative results. This is a planning estimate before deductions, not money in a bank account.

Actual cash remaining is manually recorded paycheck amounts minus recorded expenses. If no paychecks are recorded for a month, actual pay and cash remaining are `null`, displayed as “Not recorded.” A record with amount zero produces a real zero. Partially recorded months may be incomplete, so the UI displays paycheck counts and a reminder.

Actual savings is the sum of deposits minus withdrawals. Explicit balance adjustments are also recorded as deposits or withdrawals. Actual goal progress uses that net balance; the prominent projected progress bar uses the separate projected total. Remaining actual goal is `max(goal - actual savings balance, 0)`. Money left after expenses is never inserted as a savings deposit automatically.

## 23. How dashboard statistics are calculated

`getSummary()` in `lib/data.js` reads shifts, transactions, paychecks, budgets, jobs, the goal, and payday settings. `trackedMonths()` in `lib/planning.js` returns January 2026 through the current Vancouver month, without a rolling 12-month cutoff. Reports exclude dates before January 1, 2026. Completed shifts belong to their start date for weekly/monthly reports; weeks start Monday. Actual pay belongs to the payday instead of the month in which work was performed.

`budgetForMonth()` chooses the most recent effective budget row for each category. The initial total is $2,150: rent $1,500, groceries $300, bills $150, clothes/going out $200. A later budget revision leaves earlier months unchanged. Budgets are not purchases and do not create transactions.

This implementation reads personal records and calculates totals in Node. A larger service would add pagination, range queries, and cached aggregates.

## 24. How Chart.js receives its data

`renderCharts()` in `public/js/charts.js` turns the server's `monthly` and `by_job` arrays into labels and datasets. Labels include the year, such as Jan 2026. The comparison selector switches between planned expenses and actual expenses, including the legend and tooltip labels. Savings charts show cumulative projected savings and actual deposits as separate series. `destroyCharts()` removes old chart instances on navigation or comparison changes. Two analytics tables separate cash flow from savings to keep the columns manageable.

## 25. Timezone handling

`lib/time.js` uses Moment Timezone and the `America/Vancouver` IANA zone. A timezone-less `datetime-local` input is interpreted in that zone; an input with Z/offset is already an instant. A spring-forward nonexistent local time is rejected rather than silently shifted. PostgreSQL `TIMESTAMPTZ` stores the instant; JSON serializes it as UTC, and the browser formats it in Vancouver using the same package's zone data. If entering an ambiguous historic fall-back time through the API, use an explicit offset to choose the intended instant; the local input otherwise follows the library's earlier-offset default.

Bundled 2026d timezone data includes B.C.'s permanent daylight-time transition. Keep package data updated. The browser bundle covers 1970–2030; the server has the full package data. The migration interprets old timestamp-without-zone values as Vancouver wall times; it does not treat them as UTC.

## 26. Environment variables

`.env` contains local configuration and optional credentials. `.env.example` documents names without secrets. `.gitignore` excludes actual environment files, dependencies, logs, and backups. Hosted services provide these same variables through secret settings. `DATABASE_URL` changes the database without changing source code; `HOST` and `PORT` change the listening address.

## 27. How deployment works

A host installs locked packages, builds CSS, runs migrations against a configured PostgreSQL database, and starts Node. Express serves the UI and API from one origin. Set HOST to `0.0.0.0` in a container and use HTTPS and the provider's PostgreSQL TLS settings. This app has no login, so public deployments need a disposable demo database or access controls. A real multi-user deployment needs authentication plus user ownership on all relevant tables and queries. No public deployment is part of the current local setup.

## Additional design points

### Safe historical generation

`generateHistory()` in `lib/history.js` deterministically constructs only the specified schedule. It only accepts start dates from January 1 through September 17, 2026. The September 17 overnight shift ends September 18, but no shift starting on September 18 or later is generated. Before May it generates Home Depot only. Occasional Apple Tuesdays are never fabricated. `/history/preview` marks existing/conflicting candidates and performs no insert. `/history/import` recomputes candidates under the same shift transaction lock and uses selected keys, not arbitrary browser-supplied shift payloads. `history_key` remains attached after editing, so reimport does not restore a moved/edited shift. Deleting an imported row permits deliberate reimport.

### Gross vs net

`estimatePayroll()` in `lib/payroll.js` returns `available: false` and `net_pay: null`. This is an honest extension point. Adding payroll requires verified jurisdiction/year rules, pay frequency, tax-credit assumptions, and tests. Employer contributions need their own definition before implementation.

### Escaping and security boundaries

`escape()` in `ui.js` converts potentially dangerous characters before descriptions/job names enter an HTML template. SQL parameters protect the database; HTML escaping protects rendered content. They solve different problems. Same-origin write checks, local vendor files, and a content-security policy add protection, but none replaces authentication for a public service.

### Request lifecycle example

A shift edit starts at a button in `views.js`, passes through `shiftForm()` and `api()`, and reaches the PATCH handler. The server calls `shiftInput()` and `validateShift()` before updating PostgreSQL. The frontend then refreshes its data. Pay-rule updates affect the next earnings calculation for the applicable date range; the unit tests cover rate boundaries and effective dates.

## 28. Actual paycheck records

`paycheckInput()` in `lib/validation.js` validates actual amount, employer, payday, optional gross amount, optional work dates, and notes. Gross may be null, and both period dates may be null. If either date is supplied, both are required, with start ≤ end ≤ payday. A unique `(job_id, payday)` constraint allows one paycheck per employer/date and separate records for both jobs on the same payday. Updates set `updated_at`; deletes remove only the payment record, not shifts or savings deposits.

`paycheckForm()` in `public/js/forms.js` submits to `/api/paychecks`. Earnings displays actual payments, a biweekly calendar, monthly gross earnings/cash flow, and individual shifts. An explicit work period enables an estimated gross total from logged shifts. If a payslip gross amount is entered, it is displayed independently of that estimate. Gross minus received is labeled a difference, not a tax calculation.

## 29. Payday dates versus covered work dates

`payPeriods()` in `lib/planning.js` adds multiples of 14 calendar days to the shared September 18, 2026 payday anchor. It creates dates backward to January and forward through upcoming paydays. It does not infer work dates from the anchor. Both employers initially have null coverage, so gross paycheck estimates are unavailable.

If an employer's cutoff becomes known, Settings can store the last work date covered by the anchor paycheck. That enables consecutive 14-day coverage periods for that employer only. Explicit paycheck work dates are also accepted without configuring other periods. Estimates use logged work only; future scheduled shifts are not invented, and coverage before January 2026 is marked as partial history.

## 30. Adding a monthly budget revision

The shared budget editor submits an effective month and up to 50 uniquely named categories to `PUT /api/budget`. The server requires a first-of-month date and a non-negative amount for each category. It writes all rows in a transaction, and zero rates for removed categories preserve earlier history. An empty category list clears the budget from that month. Each category/effective date is unique, so updating the same month replaces that budget revision without duplicating it. Reads choose the latest applicable rate for each month. Editing a past effective month recalculates projections, but never changes actual expense records.

## 31. Direct editing and savings reductions

`public/js/editors.js` provides searchable record managers and budget, goal, and actual-balance modals from Overview. `public/js/app.js` delegates action clicks from the document so the same edit/delete handlers work inside modal tables and page tables. Saving refreshes the dashboard and closes the editor. `budgetEditor()` reloads the applicable rates when the effective month changes, rather than copying today's plan into a past month silently.

`PUT /api/savings-balance` runs under the shared transaction lock. It reads deposits minus withdrawals and records the difference from the explicitly entered target. A lower target creates a withdrawal; a higher target creates a deposit. An unchanged target writes nothing. The adjustment remains an editable/deletable transaction. Transaction create/edit/delete also uses the lock and checks the resulting balance, rolling back changes that would make current savings negative.

`getSummary()` reports deposits, withdrawals, and their net change for each month, then accumulates net savings for goal progress. Withdrawals never inflate spending or alter the gross-minus-budget projection. An actual purchase made with savings is recorded separately as an expense.
