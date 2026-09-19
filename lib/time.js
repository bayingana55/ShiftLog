import moment from "moment-timezone";
export const ZONE = "America/Vancouver";
export const localDate = (value = new Date()) =>
  moment(value).tz(ZONE).format("YYYY-MM-DD");
export const localMinute = (value) => {
  const t = moment(value).tz(ZONE);
  return t.hour() * 60 + t.minute();
};
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    moment(value, "YYYY-MM-DD", true).isValid()
  );
}
export function instant(value) {
  if (typeof value !== "string")
    throw new Error("Enter a valid date and time.");
  // datetime-local inputs are Vancouver wall time; offset-bearing API inputs are instants.
  const explicit = /(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  const parsed = explicit
    ? moment.parseZone(value, moment.ISO_8601, true)
    : moment.tz(value, ["YYYY-MM-DDTHH:mm", "YYYY-MM-DDTHH:mm:ss"], true, ZONE);
  if (
    !parsed.isValid() ||
    (!explicit &&
      parsed.format(
        value.length === 16 ? "YYYY-MM-DDTHH:mm" : "YYYY-MM-DDTHH:mm:ss",
      ) !== value)
  ) {
    throw new Error(
      "Invalid date/time, or a local time skipped by a daylight-saving transition.",
    );
  }
  return parsed.toDate();
}
export function periods(now = new Date()) {
  const t = moment(now).tz(ZONE);
  return {
    today: t.format("YYYY-MM-DD"),
    week: t.clone().startOf("isoWeek").format("YYYY-MM-DD"),
    month: t.format("YYYY-MM-01"),
  };
}
export function addDays(date, days) {
  return moment.utc(date).add(days, "day").format("YYYY-MM-DD");
}
