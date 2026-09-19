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
  history.js               Deterministic schedule candidates
  data.js                  Joined shifts, dashboard, analytics
sql/001_shiftlog.sql        Initial additive schema migration
sql/002_premium_end.sql     Confirmed 05:30 premium cutoff
scripts/migrate.js          Versioned, transactional migration runner
scripts/test-server.js     Isolated database for browser tests
public/
  index.html               App shell, navigation region, main, dialog
  css/input.css            Tailwind source and component styles
  css/app.css              Compiled browser stylesheet
  js/app.js                Navigation, data loading, events, form actions
  js/views.js              HTML templates for all screens
  js/forms.js              Modals and form submission
  js/ui.js                 Formatting, escaping, fetch wrapper, icons
  js/charts.js             Chart.js lifecycle and datasets
 tests/                    Unit, PostgreSQL integration, browser tests
 docs/                     This guide, interview notes, verification, screenshots
```

## 2. How server.js works

`createApp(db)` creates Express, adds security headers, validates browser write origins and JSON content types, installs the `/api` router, and serves `public/`. It serves only specific required vendor files from `node_modules`, not the entire directory. A final error middleware converts exceptions into useful JSON errors. The final `app.listen()` runs only when starting this file directly. Tests import `createApp` and inject a test pool without automatically starting the normal server.

## 3. How db.js works

`dotenv/config` loads `.env`. If `DATABASE_URL` is set, pg uses it. Otherwise the database is `shiftlog` and pg uses its standard local host/user defaults. The exported pool is shared by routes instead of creating a connection per request. No password is embedded in source.

## 4. How the frontend talks to the backend

`api()` in `public/js/ui.js` calls `fetch('/api' + path)`, serializes request bodies as JSON, and parses response JSON. Non-success responses throw an Error using the server's safe message. In `app.js`, `render()` fetches current data, passes it to a view, and creates charts. Modals in `forms.js` send writes, then refresh the page data. No full browser-page reload is required.

## 5. What an API means here

The API is the agreed interface between the browser and Express. For example, `GET /api/shifts` means “return recorded shifts with job names and calculated earnings.” The browser does not connect to PostgreSQL or know database credentials. It understands JSON fields such as `job_id`, `clock_in`, and `gross`.

## 6. GET vs POST vs PATCH vs DELETE (and PUT)

- GET reads data; fetching a history preview uses POST because its range arrives in JSON, but it still performs no writes.
- POST creates a record or requests an operation, such as clock-in or import.
- PATCH updates selected fields of an existing resource; omitted shift fields keep their values.
- DELETE removes a record. The UI confirms first; the API responds with 204 and no body.
- PUT sets a singleton savings goal or upserts a pay rule identified by job/effective date.

## 7. What req and res are

An Express handler receives `req` (the incoming request) and `res` (the outgoing response). `req` contains URL parameters, query strings, headers, and body. `res.status(201).json(row)` sends the created row with a 201 Created status. Routes are in `routes/api.js`.

## 8. What req.body is

`express.json()` parses the JSON sent by `fetch`. A clock-in body might be `{ "job_id": 1 }`. `req.body.job_id` reads that submitted value. All browser values are untrusted, even if the HTML input has `required` or `min`. Server functions in `validation.js` check them again.

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

## 16. How clock-in works

The browser sends a job ID to `POST /api/clock-in`. The server supplies the current instant, so changing the request body cannot choose a false clock-in time. `write()` obtains a PostgreSQL transaction advisory lock, `validateShift()` checks the job and overlaps, and `insertShift()` inserts a row with no clock-out. All shift-write routes use the same lock. Two concurrent requests cannot both pass the checks; the database's partial unique index is an additional safeguard.

## 17. How clock-out works

`PATCH /api/shifts/:id/clock-out` loads the existing row inside the locked transaction, rejects an already completed shift, validates the server-supplied finish time and entered break, and updates that same row. It does not create a second shift. `updateElapsed()` in `app.js` updates a display timer once per second; the timer itself does not write to the database.

## 18. How paid hours are calculated

In `lib/pay.js`, completed paid hours are `(end - start - breakMilliseconds) / 3,600,000`. Break minutes are validated as whole non-negative numbers and cannot exceed duration. Active shifts deliberately return zero realized hours/pay; their elapsed time is shown separately.

## 19. How overnight shifts work

The database stores complete instants, not isolated clock times. A shift begins September 17 at 9 PM and ends September 18 at 5:30 AM. The elapsed duration is positive because the end includes the following date. The form does not guess an overnight date: you enter it. Daylight-saving changes affect actual elapsed hours rather than being patched with a manual seven-hour subtraction.

## 20. How Home Depot differential pay works

`calculatePay()` chooses a rate for each segment ending at a minute boundary. `localDate()` and `localMinute()` resolve Vancouver date and time. The latest effective pay rule supplies the base/premium rates. The confirmed window from 22:00 to 05:30 crosses midnight, so the check is “at/after 22:00 OR before 05:30.” At exactly 05:30 the base rate resumes.

An exact recorded break start deducts unpaid milliseconds from the segment it overlaps. With no break start, each segment gets the same proportional unpaid fraction. This produces a transparent estimate rather than guessing lunch occurred at a particular time. The final shift gross is rounded once to cents. Tests cover both methods, exact boundaries, effective-date changes, and time transitions.

## 21. How transactions work

Transactions have a calendar date, positive amount, type, category, description, and creation instant. `transactionInput()` validates them. Expenses use approved categories. Savings deposits always use category Savings. SQL insert/update/delete handlers return the saved record or a useful error. Calendar dates stay `YYYY-MM-DD` strings instead of being accidentally converted into the previous day in another timezone.

## 22. How savings are calculated

`getSummary()` adds savings-deposit amounts. It does not use income minus spending. Saved divided by the configured goal gives the percentage. Remaining is `max(goal - saved, 0)`. The progress bar is capped at 100%, but the number can show that the goal was exceeded. Editing/deleting a deposit recalculates totals.

## 23. How dashboard statistics are calculated

`getSummary()` in `lib/data.js` reads joined/calculated shifts, transactions, the goal, and jobs. It uses the current Vancouver date, Monday's date, and the first of the month. Completed shifts are grouped by their **clock-in date**, including overnight shifts. It sums paid hours, gross earnings, expenses, and savings, and returns recent rows. Twelve month buckets feed charts; all-time job buckets feed job comparisons. Active shifts never inflate realized earnings. This implementation intentionally reads all records; a larger service would use pagination, ranged queries, and cached aggregates.

## 24. How Chart.js receives its data

`renderCharts()` in `public/js/charts.js` turns the server's `monthly` and `by_job` arrays into Chart.js labels and datasets. The x-axis labels are month names or job names; numeric arrays supply values. The green bars are gross income, lighter bars spending. `destroyCharts()` runs before changing pages, preventing stale chart instances. Analytics includes exact values in a table for accessibility and inspection.

## 25. Timezone handling

`lib/time.js` uses Moment Timezone and the `America/Vancouver` IANA zone. A timezone-less `datetime-local` input is interpreted in that zone; an input with Z/offset is already an instant. A spring-forward nonexistent local time is rejected rather than silently shifted. PostgreSQL `TIMESTAMPTZ` stores the instant; JSON serializes it as UTC, and the browser formats it in Vancouver using the same package's zone data. If entering an ambiguous historic fall-back time through the API, use an explicit offset to choose the intended instant; the local input otherwise follows the library's earlier-offset default.

Bundled 2026d timezone data includes B.C.'s permanent daylight-time transition. Keep package data updated. The browser bundle covers 1970–2030; the server has the full package data. The migration interprets old timestamp-without-zone values as Vancouver wall times; it does not treat them as UTC.

## 26. Environment variables

`.env` contains local configuration and optional credentials. `.env.example` documents names without secrets. `.gitignore` excludes actual environment files, dependencies, logs, and backups. Hosted services provide these same variables through secret settings. `DATABASE_URL` changes the database without changing source code; `HOST` and `PORT` change the listening address.

## 27. How deployment works

A host installs locked packages, builds CSS, runs migrations against a configured PostgreSQL database, and starts Node. Express serves the UI and API from one origin. Set HOST to `0.0.0.0` in a container and use HTTPS and the provider's PostgreSQL TLS settings. This app has no login, so public deployments need a disposable demo database or access controls. A real multi-user deployment needs authentication plus user ownership on all relevant tables and queries. No public deployment is part of the current local setup.

## Additional design points

### Safe historical generation

`generateHistory()` in `lib/history.js` deterministically constructs only the specified schedule. Before May it generates Home Depot only. Occasional Apple Tuesdays are never fabricated. `/history/preview` marks existing/conflicting candidates and performs no insert. `/history/import` recomputes candidates under the same shift transaction lock and uses selected keys, not arbitrary browser-supplied shift payloads. `history_key` remains attached after editing, so reimport does not restore a moved/edited shift. Deleting an imported row permits deliberate reimport.

### Gross vs net

`estimatePayroll()` in `lib/payroll.js` returns `available: false` and `net_pay: null`. This is an honest extension point. Adding payroll requires verified jurisdiction/year rules, pay frequency, tax-credit assumptions, and tests. Employer contributions need their own definition before implementation.

### Escaping and security boundaries

`escape()` in `ui.js` converts potentially dangerous characters before descriptions/job names enter an HTML template. SQL parameters protect the database; HTML escaping protects rendered content. They solve different problems. Same-origin write checks, local vendor files, and a content-security policy add protection, but none replaces authentication for a public service.

### Request lifecycle example

A shift edit starts at a button in `views.js`, passes through `shiftForm()` and `api()`, and reaches the PATCH handler. The server calls `shiftInput()` and `validateShift()` before updating PostgreSQL. The frontend then refreshes its data. Pay-rule updates affect the next earnings calculation for the applicable date range; the unit tests cover rate boundaries and effective dates.
