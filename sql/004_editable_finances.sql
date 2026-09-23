-- Preserve existing records while allowing withdrawals and custom budget categories.
ALTER TABLE transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE transactions DROP CONSTRAINT transactions_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_type_check
  CHECK(type IN ('expense','savings','withdrawal'));
ALTER TABLE transactions ADD CONSTRAINT transactions_check
  CHECK ((type IN ('savings','withdrawal') AND category='Savings') OR
         (type='expense' AND category <> 'Savings'));
ALTER TABLE budget_rates DROP CONSTRAINT budget_rates_category_check;
ALTER TABLE budget_rates ADD CONSTRAINT budget_rates_category_check
  CHECK(length(trim(category)) BETWEEN 1 AND 60);
