-- Applied once by scripts/migrate.js, inside a transaction. Existing rows are retained.
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY, name VARCHAR(100) NOT NULL,
  hourly_wage NUMERIC(10,2) NOT NULL CHECK (hourly_wage >= 0)
);
CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
  clock_in TIMESTAMP NOT NULL, clock_out TIMESTAMP, break_minutes INTEGER DEFAULT 0
);
-- Original timestamps represented Vancouver wall-clock time, not UTC.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema()
    AND table_name = 'shifts' AND column_name = 'clock_in' AND data_type = 'timestamp without time zone') THEN
    ALTER TABLE shifts ALTER COLUMN clock_in TYPE TIMESTAMPTZ USING clock_in AT TIME ZONE 'America/Vancouver';
    ALTER TABLE shifts ALTER COLUMN clock_out TYPE TIMESTAMPTZ USING clock_out AT TIME ZONE 'America/Vancouver';
  END IF;
END $$;
UPDATE shifts SET break_minutes = 0 WHERE break_minutes IS NULL;
ALTER TABLE shifts ALTER COLUMN break_minutes SET NOT NULL;
ALTER TABLE shifts ADD COLUMN break_start TIMESTAMPTZ;
ALTER TABLE shifts ADD COLUMN source VARCHAR(20) NOT NULL DEFAULT 'manual';
ALTER TABLE shifts ADD COLUMN history_key TEXT UNIQUE;
ALTER TABLE shifts ADD CONSTRAINT shifts_valid_duration CHECK (clock_out IS NULL OR clock_out > clock_in);
ALTER TABLE shifts ADD CONSTRAINT shifts_valid_break CHECK (break_minutes >= 0 AND
  (clock_out IS NULL OR break_minutes * 60 <= EXTRACT(EPOCH FROM clock_out - clock_in)));
ALTER TABLE shifts ADD CONSTRAINT shifts_break_within CHECK (break_start IS NULL OR
  (clock_out IS NOT NULL AND break_start >= clock_in AND break_start + break_minutes * INTERVAL '1 minute' <= clock_out));
-- Fail safely if legacy data has multiple active shifts; never silently delete one.
CREATE UNIQUE INDEX shifts_one_active ON shifts ((TRUE)) WHERE clock_out IS NULL;
CREATE INDEX shifts_clock_in_idx ON shifts(clock_in DESC);
CREATE INDEX shifts_job_idx ON shifts(job_id);
INSERT INTO jobs(name, hourly_wage) SELECT 'Apple',25 WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE lower(name)='apple');
INSERT INTO jobs(name, hourly_wage) SELECT 'Home Depot',20.47 WHERE NOT EXISTS (SELECT 1 FROM jobs WHERE lower(name)='home depot');
CREATE TABLE pay_rates (
  id SERIAL PRIMARY KEY, job_id INTEGER NOT NULL REFERENCES jobs(id),
  effective_from DATE NOT NULL, base_rate NUMERIC(10,2) NOT NULL CHECK(base_rate >= 0),
  premium_rate NUMERIC(10,2) CHECK(premium_rate >= 0),
  premium_start INTEGER NOT NULL DEFAULT 1320 CHECK(premium_start BETWEEN 0 AND 1439),
  premium_end INTEGER NOT NULL DEFAULT 360 CHECK(premium_end BETWEEN 0 AND 1439),
  CHECK(premium_start <> premium_end), UNIQUE(job_id, effective_from)
);
INSERT INTO pay_rates(job_id,effective_from,base_rate,premium_rate)
SELECT id,'1900-01-01',hourly_wage,CASE WHEN lower(name)='home depot' THEN 22.72 ELSE NULL END FROM jobs;
CREATE TABLE transactions (
  id SERIAL PRIMARY KEY, date DATE NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK(amount > 0),
  category VARCHAR(40) NOT NULL CHECK(category IN ('Rent','Food','Transportation','Phone','Shopping','Entertainment','Other','Savings')),
  description VARCHAR(240) NOT NULL DEFAULT '',
  type VARCHAR(20) NOT NULL CHECK(type IN ('expense','savings')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((type='savings' AND category='Savings') OR (type='expense' AND category <> 'Savings'))
);
CREATE INDEX transactions_date_idx ON transactions(date DESC);
CREATE TABLE savings_goals (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK(id=1), amount NUMERIC(12,2) NOT NULL CHECK(amount > 0)
);
INSERT INTO savings_goals(id,amount) VALUES(1,28000);
