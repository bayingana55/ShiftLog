import moment from "moment-timezone";
export const HISTORY_START = "2026-01-01";
export function trackedMonths(through) {
  const months = [];
  for (
    let month = HISTORY_START;
    month <= through;
    month = moment.utc(month).add(1, "month").format("YYYY-MM-DD")
  )
    months.push(month.slice(0, 7));
  return months;
}
