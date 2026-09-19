# ShiftLog interview preparation

Technical questions and answers covering ShiftLog’s architecture, business rules, testing, and tradeoffs.

**Tell me about ShiftLog.**  
ShiftLog is a personal dashboard for someone working multiple jobs. It records shifts, calculates gross earnings with different pay windows, tracks expenses and savings deposits, and shows progress toward a goal. It uses vanilla JavaScript, Express, and PostgreSQL.

**Why did you build it?**  
ShiftLog brings hours, earnings, spending, and savings across Apple and Home Depot into one dashboard. It also provides a practical full-stack project for demonstrating database design, API development, and frontend workflows.

**Why PostgreSQL?**  
Jobs, shifts, and pay rules have clear relationships. PostgreSQL gives me foreign keys, check constraints, transactions, and unique indexes. Those help prevent invalid relationships and duplicate active shifts, beyond frontend validation.

**Why Express?**  
The existing project used Express. It makes HTTP routes and middleware explicit and is small enough to understand without introducing another backend framework. Async handlers query PostgreSQL through pg.

**Why vanilla JavaScript instead of React?**  
This project is small enough to manage with ES modules and a shared application shell. Vanilla JavaScript let me keep the existing stack and practice DOM events, fetch, forms, and state updates directly. A larger interactive app might justify a component framework later.

**How does your frontend communicate with your backend?**  
The `api()` helper in `public/js/ui.js` sends JSON using fetch to same-origin `/api` endpoints. Express validates it, queries PostgreSQL, and returns JSON. The UI refreshes data and charts after successful writes.

**Explain your database relationships.**  
A job has many shifts and many date-effective pay rules. Each shift has a job ID foreign key. Transactions record expenses or savings deposits; a singleton savings-goal record stores the target. The migration table tracks which schema changes have run.

**What is a foreign key?**  
It requires a reference to exist in another table. A shift cannot use a job ID missing from jobs. That check applies even if someone bypasses the UI.

**What is a JOIN?**  
It combines related table rows. The shifts query joins jobs on `shifts.job_id = jobs.id`, giving the API a job name alongside each shift without storing the name repeatedly.

**What are parameterized queries, and why use them?**  
SQL uses placeholders such as `$1`, with values in a separate array. PostgreSQL treats those values as data. A description or ID cannot become executable SQL through string concatenation.

**How do you prevent SQL injection?**  
All user-provided SQL values use parameters. Inputs are validated separately for IDs, amounts, dates, and business rules. Table and column names are trusted source code. Validation improves correctness; parameters are the main SQL injection defense.

**How does clock-in/clock-out work?**  
Clock-in creates an open shift using server time. Clock-out updates that same shift with server time and a validated unpaid break. A transaction lock serializes shift writes, overlap validation rejects conflicts, and a partial unique index permits only one open shift. Concurrency is tested with simultaneous clock-in requests.

**How do you calculate overnight shifts?**  
I store complete timestamp instants with the correct next-day clock-out date. Subtracting them gives elapsed duration. I use named timezone data for Vancouver display and rate selection rather than subtracting a fixed UTC offset.

**How do you calculate Home Depot's different rates?**  
A centralized function in `lib/pay.js` splits time at minute boundaries and selects the applicable effective rule and pay window. The confirmed overnight window is 10 PM–5:30 AM; the base rate resumes at 5:30 AM. Exact break timing removes time from the correct rate; otherwise the break is proportionally allocated and labeled as an estimate.

**How do you avoid inventing history?**  
The generator uses only the provided regular schedule, excludes unspecified Apple Tuesdays and earlier Apple history, previews before insertion, and initially selects no dates. Users confirm actual dates. Imported rows retain their schedule-estimate label and durable keys, so reruns do not duplicate them.

**How do you calculate savings?**  
Only recorded savings deposits count. Gross income minus expenses is a separate comparison and is not treated as money actually saved. The goal percentage and remaining amount update after deposit changes.

**What was the hardest part?**  
A technically challenging part is making time and money rules explicit: overnight work, premium boundaries, unpaid-break timing, date-effective rules, and Vancouver timezone transitions.

**How did you test it?**  
Node's built-in test runner checks earnings, breaks, rate boundaries, timezone transitions, validation, and deterministic generation. API integration tests use real PostgreSQL in isolated test schemas and exercise CRUD and concurrent requests. Playwright tests desktop/mobile navigation, forms, clocking, savings, historical import, and errors. The personal database is not used for test writes.

**What would you improve next?**  
Authentication and per-user ownership before real public deployment, verified payroll calculations, overtime/holiday rules, CSV export, and pagination/cached aggregates. Current totals are gross estimates and intentionally exclude tax, CPP, and EI rather than inventing numbers.

**How would you support multiple users?**  
Add a users table, secure authentication/session handling, and user IDs on jobs, transactions, goals, and shifts or an appropriate ownership chain. Every read/write must check ownership. Scope active-shift uniqueness and locks per user. Add authorization tests so one user cannot access another user's IDs. Consider PostgreSQL row-level security as defense in depth.

**How would you deploy it?**  
Install dependencies, compile CSS, configure a PostgreSQL connection through environment variables, run migrations, and start Node behind HTTPS. Set the container host/port correctly. The current no-login app must remain private or use disposable demo data; real financial records require access controls.

**What are the current tradeoffs?**  
The design favors clear modules over elaborate architecture. Summaries calculate all personal records in Node, and effective pay-rule edits recalculate history. That is easy to inspect at personal scale, but a payroll-grade system needs immutable pay snapshots, audit trails, verified rules, and more efficient reporting queries.
