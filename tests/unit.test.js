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
  const input = { from: "2026-01-01", to: "2026-09-18" },
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
