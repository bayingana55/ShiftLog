import { HISTORY_START, HISTORY_END } from "./planning.js";
import moment from "moment-timezone";
import { addDays, instant, localDate } from "./time.js";
import { check, date } from "./validation.js";
export function generateHistory(input, jobs, now = new Date()) {
  const from = date(input.from),
    to = date(input.to);
  check(
    from >= HISTORY_START &&
      from <= to &&
      to <= HISTORY_END &&
      to <= localDate(now),
    "Historical imports are limited to January 1–September 17, 2026. Log later shifts manually.",
  );
  check(
    moment(to).diff(moment(from), "days") <= 730,
    "Preview at most two years at once.",
  );
  const apple = jobs.find((j) => j.name.toLowerCase() === "apple");
  const depot = jobs.find((j) => j.name.toLowerCase() === "home depot");
  check(apple && depot, "Apple and Home Depot jobs must exist.", 409);
  const rows = [];
  function add(day, job, start, end, breakMinutes, overnight = false) {
    const clock_in = instant(`${day}T${start}`),
      clock_out = instant(`${overnight ? addDays(day, 1) : day}T${end}`);
    if (clock_out > now) return; // Never import a future or currently unfinished scheduled shift.
    rows.push({
      job_id: job.id,
      job_name: job.name,
      clock_in,
      clock_out,
      break_minutes: breakMinutes,
      break_start: null,
      source: "schedule",
      history_key: `schedule:${job.id}:${day}`,
    });
  }
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = moment.utc(day).day();
    const extra = day >= "2026-05-01" && day <= "2026-09-07";
    const depotDays =
      day < "2026-05-01" ? [1, 4, 6] : extra ? [1, 2, 3, 4, 6] : [4, 6];
    if (depotDays.includes(weekday))
      add(day, depot, "21:00", "05:30", 30, true);
    // Apple is specified from May onward; no earlier Apple history is inferred.
    if (day >= "2026-05-01") {
      if (weekday === 1) add(day, apple, "08:00", "13:00", 0);
      if (weekday === 5) add(day, apple, "18:00", "22:00", 0);
      if (weekday === 6 || (extra && weekday === 4))
        add(day, apple, "10:00", "19:00", 60);
      if (weekday === 0) add(day, apple, "09:30", "18:30", 60);
    }
  }
  return rows.sort((a, b) => a.clock_in - b.clock_in);
}
