# Verification record

Verified locally on September 19, 2026 using Node 24.13.0, local PostgreSQL, and headless Google Chrome through Playwright.

## Results

- `npm run build`: compiled Tailwind/component styles successfully.
- `npm test`: **11 passing tests**, covering Apple pay, overnight premium pay, exact/proportional breaks, rate boundaries, effective dates, active shifts, invalid durations, Vancouver timezone rules, deterministic schedules, validation, and unavailable payroll.
- `npm run test:integration`: **8 passing database-backed workflow subtests** (9 tests including the parent). Checked server/UI response, connection, repeat migration, jobs/shifts, shift CRUD, invalid/overlapping shifts, simultaneous clock-ins, clock-out, expenses, savings, goal calculations, dashboard totals, analytics, pay rules, preview, concurrent repeat imports, invalid JSON/IDs, and cross-origin writes.
- `npm run test:e2e`: **1 passing end-to-end scenario** exercising desktop and 390px mobile navigation, live clock, shift and transaction forms, delete cancellation/confirmation, savings deposits, goal updates, historical preview/selection/import, and connection error/retry. No uncaught browser errors; no document-width overflow on tested mobile pages. Tables intentionally scroll within their cards.
- `npm run format:check`: source formatting checked with Prettier.
- Desktop (1440px) and mobile (390px) overview screenshots captured and visually inspected. Screenshots use the two original local test shifts and no invented transactions or work history.

## Data preservation

The original database had Apple at $25/hour and Home Depot at $20.47/hour, with two completed shifts:

- Apple: September 14, 2026, 8 AM–1 PM, no unpaid break.
- Home Depot: September 17, 2026, 9 PM–September 18, 5:30 AM, 30-minute unpaid break.

A pre-migration `pg_dump` backup was written to ignored `backups/shiftlog-before-migration.dump`. The migration retained both IDs, jobs, local wall times, and breaks while converting timestamps to timezone-aware instants. No personal history imports or transaction inserts were performed. New goal configuration starts at $28,000.

Integration and browser writes used disposable schemas in the separate `shiftlog_test` database. Test cleanup drops only the schema created by that test run. Interrupted tests may leave a test schema; never use the personal database URL for test cleanup.

## Reproduce

```sh
npm test
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:integration
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:e2e
```

Install Playwright's Chromium once using `npx playwright install chromium`, or set `PLAYWRIGHT_CHROME_PATH` to an installed Chrome executable. `createdb shiftlog_test` is needed only once. Environment details and the complete setup are in the README.

## Scope

These checks validate the implemented personal app. They are not payroll certification, an accessibility audit, a penetration test, a load test, or verification against an employer's payslip. The premium window is confirmed as 10 PM–5:30 AM; review actual historical attendance before relying on estimated totals. No deployment or authentication has been tested because neither is included in this local setup.
