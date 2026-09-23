# Verification record

Verified locally through September 22, 2026 using Node 24.13.0, local PostgreSQL, and headless Google Chrome through Playwright.

## Results

- `npm run build`: compiled Tailwind/component styles successfully.
- `npm test`: **17 passing tests**. Covers Apple and Home Depot pay, overnight work, exact/proportional breaks, 05:30 premium cutoff, effective rates, Vancouver time transitions, validation, historical boundaries, January-start month sequences, budgets, payday anchoring, optional coverage, and nullable/zero paycheck inputs.
- `npm run test:integration`: **14 passing database-backed workflow subtests** (15 tests including the parent). Covers repeat migrations, jobs/shifts, work-log CRUD, overlap checks, retained legacy clock routes, expenses, savings, goal updates, dashboard/analytics, pay rules, budget revisions, projections, actual-paycheck CRUD for both employers, duplicate paycheck rejection, real zero versus missing pay, optional coverage, full historical import and reruns, invalid input, and cross-origin writes.
- `npm run test:e2e`: **3 passing browser scenarios**. Covers desktop/mobile navigation, text-only branding, completed work logging, explicit overnight dates, edits, delete confirmation/cancellation, expenses, savings, actual paycheck add/edit/delete, null period dates, missing versus zero amounts, budget settings, planned/actual chart selection, January labels, import selection, and error/retry handling.
- `npm run format:check` and `git diff --check`: passed.
- Desktop (1440px) and mobile (390px) screens captured using the populated historical database. No uncaught browser errors or document-width overflow were found on the checked pages. Tables scroll within their cards.

## Historical import and data integrity

The original Apple shift (September 14, 08:00–13:00) and Home Depot shift (September 17, 21:00–September 18, 05:30) matched the specified schedule and were retained.

Before the new migration/import, a `pg_dump` backup was saved to ignored `backups/shiftlog-before-work-planning.dump`. The initial schema backup also remains at `backups/shiftlog-before-migration.dump`.

The January 1–September 17 schedule contained **245 candidates**: 243 missing and two existing. Importing added 243 rows. A second run inserted zero and skipped all 245. SQL verification found:

- 245 total shifts, with earliest start January 1 at 21:00 and latest start September 17 at 21:00.
- Zero duplicated employer/start-time combinations.
- Zero shifts starting September 18 or later. The last overnight shift legitimately ends September 18.
- Zero actual transactions and zero paychecks inserted into the personal database.
- Both employer coverage cutoffs remain null.
- The savings goal remains $28,000.

Historical recurring work totals $42,484.38 gross ($16,100 Apple and $26,384.38 Home Depot). Nine full monthly budgets total $19,350, giving **$23,134.38 projected savings** through September. Actual savings remains $0 in the absence of recorded deposits. Actual pay and cash remaining are **Not recorded**, not $0, because no paycheck amounts have been entered. These figures reflect the stated rates, schedule, proportional untimed breaks, and actual timezone elapsed time; they are not bank balances or payslip reconciliation.

Integration/browser writes run only in disposable schemas in the separate `shiftlog_test` database. Test cleanup drops only its own schema. Interrupted runs can leave disposable test schemas; never run test cleanup against the personal database.

## Reproduce

```sh
npm test
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:integration
TEST_DATABASE_URL=postgresql://localhost/shiftlog_test npm run test:e2e
npm run history:preview
```

Install Chromium once with `npx playwright install chromium`, or set `PLAYWRIGHT_CHROME_PATH` to an installed Chrome executable. Create `shiftlog_test` once before database tests. The historical preview is read-only; `npm run history:import` performs the fixed-range, duplicate-safe import.

## Scope

These checks validate the personal work-log and planning application. They are not payroll certification, a full accessibility/security audit, a load test, or verification against an employer's payslip. Taxes, overtime, employer contributions, and authentication remain outside this version. Exact received amounts, expenses, savings deposits, subsequent work, and any future coverage configuration must be entered manually.

Overview editing is also verified: savings balance increases and reductions, withdrawal editing/deletion, concurrent withdrawal protection, expense editing/deletion, custom budget categories and removal, and goal changes. Personal data was backed up before migration; test writes used disposable schemas.
