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
  check(value.date <= localDate(), "Transaction date cannot be in the future.");
  check(
    ["expense", "savings"].includes(value.type),
    "Choose expense or savings deposit.",
  );
  if (value.type === "savings") value.category = "Savings";
  check(
    value.type === "savings" || categories.includes(value.category),
    "Choose a valid expense category.",
  );
  check(
    typeof value.description === "string" && value.description.length <= 240,
    "Description must be at most 240 characters.",
  );
  return value;
}
