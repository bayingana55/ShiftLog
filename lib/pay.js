import { localDate, localMinute } from "./time.js";
export const money = (value) =>
  Math.round((value + Number.EPSILON) * 100) / 100;
// Work in cents and milliseconds; round only the final shift total.
// Without a recorded break start, distribute unpaid time proportionally across rates.
export function calculatePay(shift, rules) {
  if (!shift.clock_out)
    return { paid_hours: 0, gross: 0, breakdown: [], break_method: "pending" };
  const start = +new Date(shift.clock_in),
    end = +new Date(shift.clock_out);
  const breakMs = Number(shift.break_minutes) * 60000;
  if (end <= start || breakMs < 0 || breakMs > end - start)
    throw new Error("Invalid shift duration or break.");
  const breakStart = shift.break_start ? +new Date(shift.break_start) : null;
  const sorted = rules
    .filter((r) => r.job_id === shift.job_id)
    .sort((a, b) =>
      String(b.effective_from).localeCompare(String(a.effective_from)),
    );
  const buckets = new Map();
  // Minute boundaries support overnight rate changes, effective dates, and DST.
  for (let cursor = start; cursor < end;) {
    const next = Math.min(end, Math.floor(cursor / 60000) * 60000 + 60000);
    const date = localDate(new Date(cursor));
    const rule = sorted.find(
      (r) => String(r.effective_from).slice(0, 10) <= date,
    );
    if (!rule) throw new Error("No pay rate configured for this shift date.");
    const minute = localMinute(new Date(cursor));
    const premium =
      rule.premium_rate !== null &&
      (rule.premium_start > rule.premium_end
        ? minute >= rule.premium_start || minute < rule.premium_end
        : minute >= rule.premium_start && minute < rule.premium_end);
    const rate = Math.round(
      Number(premium ? rule.premium_rate : rule.base_rate) * 100,
    );
    let paidMs = next - cursor;
    if (breakStart !== null)
      paidMs -= Math.max(
        0,
        Math.min(next, breakStart + breakMs) - Math.max(cursor, breakStart),
      );
    else paidMs *= 1 - breakMs / (end - start);
    buckets.set(rate, (buckets.get(rate) || 0) + paidMs);
    cursor = next;
  }
  const breakdown = [...buckets].map(([cents, ms]) => ({
    rate: cents / 100,
    hours: ms / 3600000,
  }));
  return {
    paid_hours: (end - start - breakMs) / 3600000,
    gross: money(breakdown.reduce((sum, b) => sum + b.rate * b.hours, 0)),
    breakdown,
    break_method:
      breakStart !== null ? "exact" : breakMs ? "proportional" : "none",
  };
}
