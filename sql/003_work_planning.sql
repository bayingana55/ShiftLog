-- Recurring monthly plans are separate from actual transaction records.
CREATE TABLE budget_rates (
  category TEXT NOT NULL CHECK (category IN ('Rent','Groceries','Bills','Clothes & Going Out')),
  effective_from DATE NOT NULL CHECK (effective_from >= DATE '2026-01-01' AND EXTRACT(DAY FROM effective_from)=1),
  amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  PRIMARY KEY(category,effective_from)
);
INSERT INTO budget_rates(category,effective_from,amount) VALUES
('Rent','2026-01-01',1500),('Groceries','2026-01-01',300),
('Bills','2026-01-01',150),('Clothes & Going Out','2026-01-01',200);
-- All employers share the confirmed payday anchor. Coverage is configured separately.
CREATE TABLE payroll_schedule (
  id INTEGER PRIMARY KEY CHECK(id=1),
  anchor_payday DATE NOT NULL,
  interval_days INTEGER NOT NULL CHECK(interval_days=14)
);
INSERT INTO payroll_schedule VALUES(1,'2026-09-18',14);
CREATE TABLE payroll_coverage (
  job_id INTEGER PRIMARY KEY REFERENCES jobs(id),
  anchor_period_end DATE CHECK(anchor_period_end <= DATE '2026-09-18')
);
INSERT INTO payroll_coverage(job_id) SELECT id FROM jobs;
CREATE TABLE paychecks (
  id SERIAL PRIMARY KEY,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  payday DATE NOT NULL CHECK(payday >= DATE '2026-01-01'),
  actual_amount NUMERIC(12,2) NOT NULL CHECK(actual_amount >= 0),
  gross_amount NUMERIC(12,2) CHECK(gross_amount >= 0),
  period_start DATE,
  period_end DATE,
  notes VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id,payday),
  CHECK ((period_start IS NULL AND period_end IS NULL) OR
    (period_start IS NOT NULL AND period_end IS NOT NULL AND period_start <= period_end AND period_end <= payday))
);
CREATE INDEX paychecks_payday_idx ON paychecks(payday DESC);
