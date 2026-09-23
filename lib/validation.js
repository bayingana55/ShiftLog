import { HISTORY_START } from "./planning.js";
import { instant, validDate, localDate } from "./time.js";
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function check(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}
export function id(value) {
  check(
    /^\d+$/.test(String(value)) &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) > 0,
    "Invalid ID.",
  );
  return Number(value);
}
export function amount(value) {
  check(
    (typeof value === "string" || typeof value === "number") &&
      /^\d+(\.\d{1,2})?$/.test(String(value)) &&
      Number(value) > 0 &&
      Number(value) <= 999999999,
    "Amount must be positive, with at most two decimal places.",
  );
  return Number(value);
}
export function date(value) {
  check(validDate(value), "Use a valid date (YYYY-MM-DD).");
  return value;
}
export function timestamp(value) {
  try {
    return instant(value);
  } catch (e) {
    throw new HttpError(400, e.message);
  }
}
export function shiftInput(body) {
  const job_id = id(body.job_id),
    clock_in = timestamp(body.clock_in);
  const clock_out = body.clock_out ? timestamp(body.clock_out) : null;
  const break_minutes = Number(body.break_minutes ?? 0);
  const break_start = body.break_start ? timestamp(body.break_start) : null;
  check(
    localDate(clock_in) >= HISTORY_START,
    "Work history starts January 1, 2026.",
  );
  check(clock_in <= new Date(), "Clock-in cannot be in the future.");
  check(
    Number.isInteger(break_minutes) &&
      break_minutes >= 0 &&
      break_minutes <= 1440,
    "Break must be a whole number of minutes from 0 to 1440.",
  );
  if (clock_out) {
    check(
      clock_out <= new Date() && clock_out > clock_in,
      "Clock-out must be after clock-in and not in the future. Use the next date for an overnight shift.",
    );
    check(
      clock_out - clock_in <= 48 * 3600000,
      "Shifts cannot exceed 48 hours.",
    );
    check(
      break_minutes * 60000 <= clock_out - clock_in,
      "Break cannot exceed shift length.",
    );
    if (break_start)
      check(
        break_start >= clock_in &&
          +break_start + break_minutes * 60000 <= +clock_out,
        "Break must be within the shift.",
      );
  } else
    check(
      break_minutes === 0 && !break_start,
      "Enter the break when completing the shift.",
    );
  return { job_id, clock_in, clock_out, break_minutes, break_start };
}
export const categories = [
  "Rent",
  "Food",
  "Transportation",
  "Phone",
  "Shopping",
  "Entertainment",
  "Other",
];
export function transactionInput(body) {
  const value = {
    date: date(body.date),
    amount: amount(body.amount),
    type: body.type,
    category: body.category,
    description: body.description ?? "",
  };
  check(
    value.date >= HISTORY_START,
    "Financial history starts January 1, 2026.",
  );
  check(value.date <= localDate(), "Transaction date cannot be in the future.");
  check(
    ["expense", "savings", "withdrawal"].includes(value.type),
    "Choose expense, savings deposit, or savings withdrawal.",
  );
  if (["savings", "withdrawal"].includes(value.type))
    value.category = "Savings";
  check(
    ["savings", "withdrawal"].includes(value.type) ||
      categories.includes(value.category),
    "Choose a valid expense category.",
  );
  check(
    typeof value.description === "string" && value.description.length <= 240,
    "Description must be at most 240 characters.",
  );
  return value;
}

export function nonnegativeAmount(value) {
  if (
    (typeof value === "string" || typeof value === "number") &&
    /^0+(\.0{1,2})?$/.test(String(value))
  )
    return 0;
  return amount(value);
}
export function payRate(value) {
  const rate = amount(value);
  check(rate <= 99999999.99, "Pay rate must not exceed 99,999,999.99.");
  return rate;
}
export function paycheckInput(body) {
  const value = {
    job_id: id(body.job_id),
    payday: date(body.payday),
    actual_amount: nonnegativeAmount(body.actual_amount),
    gross_amount:
      body.gross_amount == null || body.gross_amount === ""
        ? null
        : nonnegativeAmount(body.gross_amount),
    period_start: body.period_start ? date(body.period_start) : null,
    period_end: body.period_end ? date(body.period_end) : null,
    notes: body.notes ?? "",
  };
  check(
    value.payday >= HISTORY_START && value.payday <= localDate(),
    "Payday must be between January 1, 2026 and today.",
  );
  check(
    (!value.period_start && !value.period_end) ||
      (value.period_start &&
        value.period_end &&
        value.period_start <= value.period_end &&
        value.period_end <= value.payday),
    "Leave both work-period dates blank, or enter a start and end on or before payday.",
  );
  check(
    typeof value.notes === "string" && value.notes.length <= 500,
    "Notes must be at most 500 characters.",
  );
  return value;
}
