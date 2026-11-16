import test from "node:test";
import assert from "node:assert/strict";
import { calculatePay } from "../lib/pay.js";
import { instant, localDate } from "../lib/time.js";
import { shiftInput, transactionInput } from "../lib/validation.js";
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
test("A break longer than the shift fails", () => {
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

import { trackedMonths } from "../lib/planning.js";
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
test("Paycheck accepts zero received and an optional gross amount", () => {
  const p = paycheckInput({
    job_id: 1,
    payday: "2026-09-18",
    actual_amount: 0,
  });
  assert.equal(p.actual_amount, 0);
  assert.equal(p.gross_amount, null);
  assert.equal(
    paycheckInput({
      job_id: 1,
      payday: "2026-09-18",
      actual_amount: 900,
      gross_amount: "1100.50",
    }).gross_amount,
    1100.5,
  );
  assert.throws(() =>
    paycheckInput({
      job_id: 1,
      payday: "2026-09-18",
      actual_amount: 100,
      gross_amount: -5,
    }),
  );
});
