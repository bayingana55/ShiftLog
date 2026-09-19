import { Router } from "express";
import {
  check,
  id,
  amount,
  date,
  shiftInput,
  transactionInput,
} from "../lib/validation.js";
import { getShifts, getTransactions, getSummary } from "../lib/data.js";
import { generateHistory } from "../lib/history.js";
import { localDate } from "../lib/time.js";
import { calculatePay } from "../lib/pay.js";

// Every shift write shares a transaction lock, so concurrent requests cannot bypass
// overlap checks. The partial unique index independently enforces one active shift.
async function write(db, action) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(735101)");
    const result = await action(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
async function validateShift(db, s, except = 0) {
  check(
    (await db.query("SELECT id FROM jobs WHERE id=$1", [s.job_id])).rowCount,
    "Job not found.",
    404,
  );
  const overlap = await db.query(
    `SELECT id FROM shifts WHERE id<>$3 AND clock_in < COALESCE($2::timestamptz,'infinity'::timestamptz)
    AND COALESCE(clock_out,'infinity'::timestamptz)>$1::timestamptz`,
    [s.clock_in, s.clock_out, except],
  );
  check(
    !overlap.rowCount,
    "This shift overlaps an existing or active shift. Review shift history.",
    409,
  );
}
async function insertShift(db, s) {
  return (
    await db.query(
      `INSERT INTO shifts(job_id,clock_in,clock_out,break_minutes,break_start,source,history_key)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        s.job_id,
        s.clock_in,
        s.clock_out,
        s.break_minutes,
        s.break_start,
        s.source || "manual",
        s.history_key || null,
      ],
    )
  ).rows[0];
}
function filterRows(rows, query, field) {
  if (query.from) date(query.from);
  if (query.to) date(query.to);
  check(
    !query.from || !query.to || query.from <= query.to,
    "Start date must not be after end date.",
  );
  if (query.job_id) id(query.job_id);
  return rows.filter((row) => {
    const day = field === "date" ? row.date : localDate(row[field]);
    return (
      (!query.from || day >= query.from) &&
      (!query.to || day <= query.to) &&
      (!query.job_id || row.job_id === Number(query.job_id)) &&
      (!query.type || row.type === query.type) &&
      (!query.category || row.category === query.category)
    );
  });
}
export function api(db) {
  const router = Router();
  router.get("/jobs", async (req, res) =>
    res.json((await db.query("SELECT * FROM jobs ORDER BY id")).rows),
  );
  router.get("/shifts", async (req, res) =>
    res.json(filterRows(await getShifts(db), req.query, "clock_in")),
  );
  router.post("/shifts", async (req, res) => {
    const s = shiftInput(req.body);
    res.status(201).json(
      await write(db, async (c) => {
        await validateShift(c, s);
        return insertShift(c, s);
      }),
    );
  });
  router.post("/clock-in", async (req, res) => {
    const s = shiftInput({
      job_id: req.body.job_id,
      clock_in: new Date().toISOString(),
    });
    res.status(201).json(
      await write(db, async (c) => {
        await validateShift(c, s);
        return insertShift(c, { ...s, source: "clock" });
      }),
    );
  });
  router.patch("/shifts/:id/clock-out", async (req, res) => {
    const shiftId = id(req.params.id);
    res.json(
      await write(db, async (c) => {
        const current = (
          await c.query("SELECT * FROM shifts WHERE id=$1", [shiftId])
        ).rows[0];
        check(current, "Shift not found.", 404);
        check(!current.clock_out, "Shift is already clocked out.", 409);
        const s = shiftInput({
          ...current,
          clock_in: current.clock_in.toISOString(),
          clock_out: new Date().toISOString(),
          break_minutes: req.body.break_minutes ?? 0,
          break_start: req.body.break_start,
        });
        return (
          await c.query(
            "UPDATE shifts SET clock_out=$1,break_minutes=$2,break_start=$3 WHERE id=$4 RETURNING *",
            [s.clock_out, s.break_minutes, s.break_start, shiftId],
          )
        ).rows[0];
      }),
    );
  });
  router.patch("/shifts/:id", async (req, res) => {
    const shiftId = id(req.params.id);
    res.json(
      await write(db, async (c) => {
        const old = (
          await c.query("SELECT * FROM shifts WHERE id=$1", [shiftId])
        ).rows[0];
        check(old, "Shift not found.", 404);
        const s = shiftInput({
          ...old,
          clock_in: old.clock_in.toISOString(),
          clock_out: old.clock_out?.toISOString(),
          break_start: old.break_start?.toISOString(),
          ...req.body,
        });
        await validateShift(c, s, shiftId);
        return (
          await c.query(
            "UPDATE shifts SET job_id=$1,clock_in=$2,clock_out=$3,break_minutes=$4,break_start=$5 WHERE id=$6 RETURNING *",
            [
              s.job_id,
              s.clock_in,
              s.clock_out,
              s.break_minutes,
              s.break_start,
              shiftId,
            ],
          )
        ).rows[0];
      }),
    );
  });
  router.delete("/shifts/:id", async (req, res) => {
    await write(db, async (c) =>
      check(
        (await c.query("DELETE FROM shifts WHERE id=$1", [id(req.params.id)]))
          .rowCount,
        "Shift not found.",
        404,
      ),
    );
    res.status(204).end();
  });
  router.get("/transactions", async (req, res) =>
    res.json(filterRows(await getTransactions(db), req.query, "date")),
  );
  router.post("/transactions", async (req, res) => {
    const t = transactionInput(req.body);
    res
      .status(201)
      .json(
        (
          await db.query(
            "INSERT INTO transactions(date,amount,type,category,description) VALUES($1,$2,$3,$4,$5) RETURNING *,date::text",
            [t.date, t.amount, t.type, t.category, t.description],
          )
        ).rows[0],
      );
  });
  router.patch("/transactions/:id", async (req, res) => {
    const key = id(req.params.id);
    res.json(
      await write(db, async (c) => {
        const old = (
          await c.query("SELECT *,date::text FROM transactions WHERE id=$1", [
            key,
          ])
        ).rows[0];
        check(old, "Transaction not found.", 404);
        const t = transactionInput({ ...old, ...req.body });
        return (
          await c.query(
            "UPDATE transactions SET date=$1,amount=$2,type=$3,category=$4,description=$5 WHERE id=$6 RETURNING *,date::text",
            [t.date, t.amount, t.type, t.category, t.description, key],
          )
        ).rows[0];
      }),
    );
  });
  router.delete("/transactions/:id", async (req, res) => {
    check(
      (
        await db.query("DELETE FROM transactions WHERE id=$1", [
          id(req.params.id),
        ])
      ).rowCount,
      "Transaction not found.",
      404,
    );
    res.status(204).end();
  });
  router.get("/savings-goal", async (req, res) =>
    res.json(
      (await db.query("SELECT * FROM savings_goals WHERE id=1")).rows[0],
    ),
  );
  router.put("/savings-goal", async (req, res) =>
    res.json(
      (
        await db.query(
          "UPDATE savings_goals SET amount=$1 WHERE id=1 RETURNING *",
          [amount(req.body.amount)],
        )
      ).rows[0],
    ),
  );
  router.get("/dashboard", async (req, res) => res.json(await getSummary(db)));
  router.get("/analytics", async (req, res) => {
    const { monthly, by_job } = await getSummary(db);
    res.json({ monthly, by_job });
  });
  router.get("/pay-rates", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT *,effective_from::text FROM pay_rates ORDER BY job_id,pay_rates.effective_from DESC",
        )
      ).rows,
    ),
  );
  router.put("/pay-rates", async (req, res) => {
    const b = req.body,
      job = id(b.job_id),
      effective = date(b.effective_from),
      base = amount(b.base_rate);
    const premium =
      b.premium_rate === "" || b.premium_rate == null
        ? null
        : amount(b.premium_rate);
    const start = Number(b.premium_start),
      end = Number(b.premium_end);
    check(
      Number.isInteger(start) &&
        Number.isInteger(end) &&
        start >= 0 &&
        start < 1440 &&
        end >= 0 &&
        end < 1440 &&
        start !== end,
      "Set distinct premium start/end times.",
    );
    check(
      (await db.query("SELECT id FROM jobs WHERE id=$1", [job])).rowCount,
      "Job not found.",
      404,
    );
    res.json(
      (
        await db.query(
          `INSERT INTO pay_rates(job_id,effective_from,base_rate,premium_rate,premium_start,premium_end) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(job_id,effective_from) DO UPDATE SET base_rate=$3,premium_rate=$4,premium_start=$5,premium_end=$6 RETURNING *`,
          [job, effective, base, premium, start, end],
        )
      ).rows[0],
    );
  });
  async function preview(client, input) {
    const jobs = await client.query("SELECT * FROM jobs");
    const existing = await client.query("SELECT * FROM shifts");
    const rates = await client.query(
      "SELECT *,effective_from::text FROM pay_rates",
    );
    return generateHistory(input, jobs.rows).map((s) => {
      const duplicate = existing.rows.some(
        (e) =>
          e.history_key === s.history_key ||
          (e.job_id === s.job_id && +e.clock_in === +s.clock_in),
      );
      const overlap = existing.rows.some(
        (e) =>
          +e.clock_in < +s.clock_out &&
          (!e.clock_out || +e.clock_out > +s.clock_in),
      );
      return {
        ...s,
        ...calculatePay(s, rates.rows),
        status: duplicate ? "existing" : overlap ? "conflict" : "ready",
      };
    });
  }
  router.post("/history/preview", async (req, res) =>
    res.json(await preview(db, req.body)),
  );
  router.post("/history/import", async (req, res) => {
    check(
      Array.isArray(req.body.keys) &&
        req.body.keys.length > 0 &&
        req.body.keys.length <= 2000 &&
        req.body.keys.every((k) => typeof k === "string"),
      "Select shifts from the preview.",
    );
    res.json(
      await write(db, async (c) => {
        const candidates = await preview(c, req.body),
          keys = new Set(req.body.keys);
        check(
          [...keys].every((key) =>
            candidates.some((s) => s.history_key === key),
          ),
          "Preview has changed. Generate it again.",
        );
        let inserted = 0,
          skipped = 0;
        for (const s of candidates.filter((s) => keys.has(s.history_key))) {
          if (s.status !== "ready") {
            skipped++;
            continue;
          }
          await validateShift(c, s);
          await insertShift(c, s);
          inserted++;
        }
        return { inserted, skipped };
      }),
    );
  });
  return router;
}
