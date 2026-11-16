-- Remove tables and columns the simplified app no longer uses.
-- scripts/migrate.js runs this once, inside a transaction: if any statement
-- fails, nothing is changed.

-- Payroll schedule/coverage and the monthly budget were removed from the app.
DROP TABLE payroll_coverage;
DROP TABLE payroll_schedule;
DROP TABLE budget_rates;

-- Paychecks no longer record work-period dates.
ALTER TABLE paychecks DROP COLUMN period_start, DROP COLUMN period_end;

-- Wages live in pay_rates; this original column was only kept for compatibility.
ALTER TABLE jobs DROP COLUMN hourly_wage;

-- Only the removed history importer used this key.
ALTER TABLE shifts DROP COLUMN history_key;

-- Shifts are logged after they end, so there is no "active" shift anymore.
-- SET NOT NULL fails (and rolls everything back) if any shift has no end time.
DROP INDEX shifts_one_active;
ALTER TABLE shifts ALTER COLUMN clock_out SET NOT NULL;
