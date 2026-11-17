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
    base_rate: 20,
    premium_rate: null,
    premium_start: 1320,
    premium_end: 330,
  },
  {
    job_id: 2,
    effective_from: "1900-01-01",
    base_rate: 18,
    premium_rate: 20,
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
test("Apple five hours = $100; nine hours minus lunch = $160", () => {
  assert.equal(
    calculatePay(shift(1, "2026-09-14T09:00", "2026-09-14T14:00"), rules).gross,
    100,
  );
  const result = calculatePay(
    shift(1, "2026-09-12T09:00", "2026-09-12T18:00", 60),
    rules,
  );
  assert.equal(result.paid_hours, 8);
  assert.equal(result.gross, 160);
});
test("Home Depot overnight splits rates; unspecified break allocated proportionally", () => {
  const result = calculatePay(
    shift(2, "2026-09-17T20:00", "2026-09-18T04:00", 30),
    rules,
  );
  assert.equal(result.paid_hours, 7.5);
  assert.equal(result.gross, 146.25);
  assert.equal(result.breakdown.length, 2);
  assert.equal(result.break_method, "proportional");
});
test("Precisely timed break deducts from its actual pay bucket", () => {
  assert.equal(
    calculatePay(
      shift(2, "2026-09-17T20:00", "2026-09-18T04:00", 30, "2026-09-18T01:00"),
      rules,
    ).gross,
    146,
  );
  assert.equal(
    calculatePay(
      shift(2, "2026-09-17T20:00", "2026-09-18T04:00", 30, "2026-09-17T20:00"),
      rules,
    ).gross,
    147,
  );
});
test("Rate boundary and effective dates apply exactly", () => {
  assert.equal(
    calculatePay(shift(2, "2026-09-17T21:00", "2026-09-17T22:00"), rules).gross,
    18,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-17T22:00", "2026-09-17T23:00"), rules).gross,
    20,
  );
  const raised = [
    ...rules,
    { ...rules[0], effective_from: "2026-09-15", base_rate: 30 },
  ];
  assert.equal(
    calculatePay(shift(1, "2026-09-14T23:00", "2026-09-15T01:00"), raised)
      .gross,
    50,
  );
});
test("A break longer than the shift fails", () => {
  assert.throws(() =>
    calculatePay(shift(1, "2026-09-14T09:00", "2026-09-14T10:00", 61), rules),
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
  assert.equal(result.gross, 40);
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
    10,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-18T05:30", "2026-09-18T06:30"), rules).gross,
    18,
  );
  assert.equal(
    calculatePay(shift(2, "2026-09-18T05:00", "2026-09-18T06:00"), rules).gross,
    19,
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
  assert.equal(payRate("19.99"), 19.99);
  for (const value of ["100000000", "999999999", "19.991"])
    assert.throws(() => payRate(value), { status: 400 });
});
test("A new job needs a name, a base rate and a distinct premium window", async () => {
  const { jobInput, rejectDuplicateJob } = await import("../lib/validation.js");
  assert.deepEqual(
    jobInput({
      name: "  Night job ",
      base_rate: "18",
      premium_rate: "20",
      premium_start: 1320,
      premium_end: 330,
    }),
    {
      name: "Night job",
      base_rate: 18,
      premium_rate: 20,
      premium_start: 1320,
      premium_end: 330,
    },
  );
  const valid = { name: "Day job", base_rate: 20, premium_rate: "" };
  assert.equal(
    jobInput({ ...valid, premium_start: 1320, premium_end: 330 }).premium_rate,
    null,
  );
  for (const bad of [
    { ...valid, name: "   " },
    { ...valid, name: "x".repeat(101) },
    { ...valid, name: 42 },
    { ...valid, base_rate: "0" },
    { ...valid, premium_rate: "-1" },
    { ...valid, premium_start: 600, premium_end: 600 },
    { ...valid, premium_start: 1440, premium_end: 0 },
  ])
    assert.throws(
      () => jobInput({ premium_start: 1320, premium_end: 330, ...bad }),
      { status: 400 },
    );
  assert.throws(() => rejectDuplicateJob(true), { status: 409 });
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

test("Shifts overlap only when each starts before the other ends", async () => {
  const { overlaps, rejectOverlap, rejectNegativeSavings } =
    await import("../lib/validation.js");
  const a = shift(1, "2026-09-14T09:00", "2026-09-14T14:00");
  assert.ok(overlaps(a, shift(2, "2026-09-14T13:00", "2026-09-14T15:00")));
  assert.ok(overlaps(a, shift(2, "2026-09-14T10:00", "2026-09-14T11:00")));
  // Back-to-back shifts are allowed.
  assert.ok(!overlaps(a, shift(2, "2026-09-14T14:00", "2026-09-14T16:00")));
  assert.throws(() => rejectOverlap(true), { status: 409 });
  assert.throws(() => rejectNegativeSavings(-0.01), { status: 409 });
  assert.doesNotThrow(() => rejectNegativeSavings(0));
});

test("Sandbox demo starts blank with two generic jobs and a $5,000 goal", async () => {
  const { createBlankDemo } = await import("../lib/demo-data.js");
  const { summarize } = await import("../lib/data.js");
  const demo = createBlankDemo();
  assert.deepEqual(
    demo.jobs.map((j) => j.name),
    ["Day job", "Night job"],
  );
  assert.deepEqual(
    [demo.shifts, demo.transactions, demo.paychecks],
    [[], [], []],
  );
  const summary = summarize(demo, new Date("2026-09-22T12:00:00-07:00"));
  assert.equal(summary.goal, 5000);
  assert.equal(summary.hours_week, 0);
  assert.equal(summary.gross_month, 0);
  // Night job pays like the real app's rules: $18, and $20 from 22:00 to 05:30.
  assert.equal(
    calculatePay(
      shift(2, "2026-09-17T20:00", "2026-09-18T04:00", 30),
      demo.rates,
    ).gross,
    146.25,
  );
});

test("Sample data: four weeks of shifts, expenses and savings, generic jobs only", async () => {
  const { createBlankDemo, createSampleData } =
    await import("../lib/demo-data.js");
  const { summarize } = await import("../lib/data.js");
  const now = new Date("2026-09-22T12:00:00-07:00");
  const demo = createBlankDemo();
  const sample = createSampleData(demo.rates, now);
  assert.ok(sample.shifts.every((s) => s.clock_out <= now));
  assert.ok(
    sample.shifts.every((s) => ["Day job", "Night job"].includes(s.job_name)),
  );
  assert.ok(
    sample.transactions.every(
      (t) =>
        t.type !== "withdrawal" &&
        t.date >= "2026-08-26" &&
        t.date <= "2026-09-22",
    ),
  );
  // These numbers are checked again in tests/demo.spec.js.
  const summary = summarize({ ...demo, ...sample }, now);
  assert.equal(summary.hours_week, 7.5);
  assert.equal(summary.gross_month, 2227.5);
  // Spending stays well below earnings; savings reach about a quarter of the goal.
  assert.equal(summary.spending_month, 1320);
  assert.equal(summary.saved, 1200);
  assert.equal(summary.progress, 24);
});
