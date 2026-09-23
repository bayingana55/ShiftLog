import test from "node:test";
import assert from "node:assert/strict";
import { calculatePay } from "../lib/pay.js";
import { instant, localDate } from "../lib/time.js";
import { generateHistory } from "../lib/history.js";
import { shiftInput, transactionInput } from "../lib/validation.js";
import { estimatePayroll } from "../lib/payroll.js";
const jobs = [
  { id: 1, name: "Apple" },
  { id: 2, name: "Home Depot" },
];
const rules = [
  {
    job_id: 1,
    effective_from: "1900-01-01",
    base_rate: 25,
    premium_rate: null,
    premium_start: 1320,
    premium_end: 330,
  },
  {
    job_id: 2,
    effective_from: "1900-01-01",
    base_rate: 20.47,
    premium_rate: 22.72,
    premium_start: 1320,
    premium_end: 330,
  },
];
const shift = (job, start, end, break_minutes = 0, break_start = null) => ({
  job_id: job,
  clock_in: instant(start),
  clock_out: end ? instant(end) : null,
  break_minutes,
  break_start: break_start ? instant(break_start) : null,
});
test("Apple five hours = $125; nine hours minus lunch = $200", () => {
  assert.equal(
    calculatePay(shift(1, "2026-09-14T08:00", "2026-09-14T13:00"), rules).gross,
    125,
  );
  const result = calculatePay(
    shift(1, "2026-09-12T10:00", "2026-09-12T19:00", 60),
    rules,
  );
  assert.equal(result.paid_hours, 8);
  assert.equal(result.gross, 200);
});
test("Home Depot overnight splits rates; unspecified break allocated proportionally", () => {
  const result = calculatePay(
    shift(2, "2026-09-17T21:00", "2026-09-18T05:30", 30),
    rules,
  );
  assert.equal(result.paid_hours, 8);
  assert.equal(result.gross, 179.64);
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.break_method, "proportional");
});
test("Precisely timed break deducts from its actual pay bucket", () => {
  assert.equal(
    calculatePay(
      shift(2, "2026-09-17T21:00", "2026-09-18T05:30", 30, "2026-09-18T01:00"),
      rules,
    ).gross,
    179.51,
  );
  assert.equal(
    calculatePay(
      shift(2, "2026-09-17T21:00", "2026-09-18T05:30", 30, "2026-09-17T21:00"),
      rules,
    ).gross,
    180.64,
  );
});
test("Rate boundary and effective dates apply exactly", () => {
  assert.equal(
    calculatePay(shift(2, "2026-09-17T21:00", "2026-09-17T22:00"), rules).gross,
    20.47,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-17T22:00", "2026-09-17T23:00"), rules).gross,
    22.72,
  );
  const raised = [
    ...rules,
    { ...rules[0], effective_from: "2026-09-15", base_rate: 30 },
  ];
  assert.equal(
    calculatePay(shift(1, "2026-09-14T23:00", "2026-09-15T01:00"), raised)
      .gross,
    55,
  );
});
test("Active shifts have no realized pay and excessive breaks fail", () => {
  assert.equal(
    calculatePay(shift(1, "2026-09-14T08:00", null), rules).gross,
    0,
  );
  assert.throws(() =>
    calculatePay(shift(1, "2026-09-14T08:00", "2026-09-14T09:00", 61), rules),
  );
});
test("Timezone resolves UTC correctly, spring transition, and Vancouver permanent time", () => {
  assert.equal(
    instant("2026-01-01T09:00").toISOString(),
    "2026-01-01T17:00:00.000Z",
  );
  assert.equal(
    instant("2026-09-01T09:00").toISOString(),
    "2026-09-01T16:00:00.000Z",
  );
  assert.equal(
    instant("2026-12-01T09:00").toISOString(),
    "2026-12-01T16:00:00.000Z",
  );
  assert.equal(localDate("2026-09-18T04:00:00Z"), "2026-09-17");
  assert.throws(() => instant("2026-03-08T02:30"));
  const result = calculatePay(
    shift(1, "2026-03-08T01:00", "2026-03-08T04:00"),
    rules,
  );
  assert.equal(result.paid_hours, 2);
  assert.equal(result.gross, 50);
});
test("History is deterministic, excludes unspecified Tuesdays and January Apple", () => {
  const input = { from: "2026-01-01", to: "2026-09-17" },
    now = new Date("2026-09-19T20:00Z");
  const rows = generateHistory(input, jobs, now);
  assert.deepEqual(rows, generateHistory(input, jobs, now));
  assert.equal(new Set(rows.map((r) => r.history_key)).size, rows.length);
  assert.ok(
    !rows.some((r) => r.job_id === 1 && localDate(r.clock_in) < "2026-05-01"),
  );
  assert.ok(
    !rows.some(
      (r) =>
        r.job_id === 1 &&
        new Date(`${localDate(r.clock_in)}T12:00Z`).getUTCDay() === 2,
    ),
  );
  assert.ok(
    rows.some((r) => r.job_id === 2 && localDate(r.clock_in) === "2026-09-07"),
  );
  assert.ok(
    !rows.some((r) => r.job_id === 2 && localDate(r.clock_in) === "2026-09-08"),
  );
  assert.ok(
    !rows.some((r) => r.job_id === 1 && localDate(r.clock_in) === "2026-09-10"),
  );
});
test("History omits unfinished overnight shift", () => {
  assert.equal(
    generateHistory(
      { from: "2026-09-17", to: "2026-09-17" },
      jobs,
      new Date("2026-09-18T06:00Z"),
    ).length,
    0,
  );
});
test("Validation rejects invalid timestamps, dates, fractional breaks and money", () => {
  assert.throws(() => shiftInput({ job_id: 1, clock_in: "2026-02-30T08:00" }));
  assert.throws(() =>
    shiftInput({
      job_id: 1,
      clock_in: "2026-01-01T08:00",
      clock_out: "2026-01-01T09:00",
      break_minutes: 1.5,
    }),
  );
  assert.throws(() =>
    transactionInput({
      date: "2026-02-30",
      amount: 2,
      type: "expense",
      category: "Food",
    }),
  );
  assert.throws(() =>
    transactionInput({
      date: "2026-01-01",
      amount: 1.001,
      type: "expense",
      category: "Food",
    }),
  );
  assert.throws(() =>
    transactionInput({ date: "2026-01-01", amount: -1, type: "savings" }),
  );
  assert.equal(
    transactionInput({ date: "2026-01-01", amount: 25, type: "savings" })
      .category,
    "Savings",
  );
});
test("Payroll remains explicitly unavailable", () =>
  assert.equal(estimatePayroll().net_pay, null));

test("Home Depot premium ends exactly at 5:30 AM", () => {
  assert.equal(
    calculatePay(shift(2, "2026-09-18T05:00", "2026-09-18T05:30"), rules).gross,
    11.36,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-18T05:30", "2026-09-18T06:30"), rules).gross,
    20.47,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-18T05:00", "2026-09-18T06:00"), rules).gross,
    21.6,
  );
});

import {
  trackedMonths,
  budgetForMonth,
  payPeriods,
  BUDGET_CATEGORIES,
} from "../lib/planning.js";
import {
  paycheckInput,
  nonnegativeAmount,
  payRate,
} from "../lib/validation.js";
test("Nonnegative amounts accept consistently formatted zero values", () => {
  for (const value of [0, "0", "0.0", "0.00", "00.00"])
    assert.equal(nonnegativeAmount(value), 0);
  for (const value of ["", " ", null, false, [], "0.000", "-1"])
    assert.throws(() => nonnegativeAmount(value), { status: 400 });
  assert.equal(nonnegativeAmount("12.34"), 12.34);
});
test("Pay rates respect the NUMERIC(10,2) database limit", () => {
  assert.equal(payRate("99999999.99"), 99999999.99);
  assert.equal(payRate("22.72"), 22.72);
  for (const value of ["100000000", "999999999", "22.721"])
    assert.throws(() => payRate(value), { status: 400 });
});
test("Reports start in January 2026 and expand beyond twelve months", () => {
  assert.deepEqual(trackedMonths("2026-03-01"), [
    "2026-01",
    "2026-02",
    "2026-03",
  ]);
  assert.equal(trackedMonths("2027-02-01").length, 14);
});
test("Budgets sum to $2150, with changes applied only from their effective month", () => {
  const rates = BUDGET_CATEGORIES.map((category, i) => ({
    category,
    effective_from: "2026-01-01",
    amount: [1500, 300, 150, 200][i],
  }));
  rates.push({ category: "Rent", effective_from: "2026-09-01", amount: 1600 });
  assert.equal(
    budgetForMonth(rates, "2026-08").reduce((n, r) => n + r.amount, 0),
    2150,
  );
  assert.equal(
    budgetForMonth(rates, "2026-09").reduce((n, r) => n + r.amount, 0),
    2250,
  );
});
test("Payday schedule uses September 18 anchor without inventing coverage", () => {
  const periods = payPeriods(
    [],
    jobs,
    { anchor_payday: "2026-09-18", interval_days: 14 },
    [],
    "2026-09-19",
  );
  assert.equal(periods[0].payday, "2026-01-09");
  assert.ok(periods.some((p) => p.payday === "2026-10-02"));
  assert.ok(
    periods.every((p) => p.gross_estimate === null && p.period_start === null),
  );
  const dates = [...new Set(periods.map((p) => p.payday))];
  for (let i = 1; i < dates.length; i++)
    assert.equal((new Date(dates[i]) - new Date(dates[i - 1])) / 86400000, 14);
});
test("Only configured work periods assign shifts to estimated checks", () => {
  const rows = payPeriods(
    [
      {
        job_id: 1,
        clock_in: instant("2026-09-01T08:00"),
        clock_out: instant("2026-09-01T13:00"),
        gross: 125,
      },
    ],
    jobs,
    { anchor_payday: "2026-09-18", interval_days: 14 },
    [{ job_id: 1, anchor_period_end: "2026-09-12" }],
    "2026-09-19",
  );
  const apple = rows.find((p) => p.job_id === 1 && p.payday === "2026-09-18");
  assert.equal(apple.period_start, "2026-08-30");
  assert.equal(apple.gross_estimate, 125);
  assert.equal(
    rows.find((p) => p.job_id === 2 && p.payday === "2026-09-18")
      .gross_estimate,
    null,
  );
});
test("Manual paycheck accepts zero and unknown period but rejects partial dates", () => {
  const p = paycheckInput({
    job_id: 1,
    payday: "2026-09-18",
    actual_amount: 0,
  });
  assert.equal(p.actual_amount, 0);
  assert.equal(p.period_start, null);
  assert.equal(p.gross_amount, null);
  assert.throws(() =>
    paycheckInput({
      job_id: 1,
      payday: "2026-09-18",
      actual_amount: 100,
      period_start: "2026-09-01",
    }),
  );
});
test("Historical generator stops at Sep 17 and rejects Sep 18/19 imports", () => {
  const rows = generateHistory(
    { from: "2026-01-01", to: "2026-09-17" },
    jobs,
    new Date("2026-09-19T20:00Z"),
  );
  assert.equal(rows.length, 245);
  assert.ok(rows.every((s) => localDate(s.clock_in) <= "2026-09-17"));
  assert.throws(() =>
    generateHistory({ from: "2026-01-01", to: "2026-09-18" }, jobs),
  );
});
