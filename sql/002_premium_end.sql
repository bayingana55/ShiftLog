-- Home Depot premium hours are 22:00–05:30.
-- Correct the previous 06:00 assumption without changing shifts or wage amounts.
ALTER TABLE pay_rates ALTER COLUMN premium_end SET DEFAULT 330;
UPDATE pay_rates
SET premium_end = 330
FROM jobs
WHERE pay_rates.job_id = jobs.id
  AND lower(jobs.name) = 'home depot'
  AND pay_rates.premium_end = 360;
