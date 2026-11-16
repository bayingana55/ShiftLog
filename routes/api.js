import { HISTORY_START } from "../lib/planning.js";
import { Router } from "express";
import {
  check,
  id,
  amount,
  date,
  shiftInput,
  transactionInput,
  paycheckInput,
  payRate,
} from "../lib/validation.js";
import {
  getShifts,
  getTransactions,
  getSummary,
  getPaychecks,
} from "../lib/data.js";
import { localDate } from "../lib/time.js";

// Every write shares a transaction lock, so two requests at the same moment
// cannot both pass the overlap or savings-balance checks.
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
    // Two shifts overlap when each one starts before the other ends.
    "SELECT id FROM shifts WHERE id<>$3 AND clock_in < $2 AND clock_out > $1",
    [s.clock_in, s.clock_out, except],
  );
  check(
    !overlap.rowCount,
    "This shift overlaps another shift. Check the Shifts page.",
    409,
  );
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
    if (day < HISTORY_START) return false;
    return (
      (!query.from || day >= query.from) &&
      (!query.to || day <= query.to) &&
      (!query.job_id || row.job_id === Number(query.job_id)) &&
      (!query.type || row.type === query.type) &&
      (!query.category || row.category === query.category)
    );
  });
}
async function savingsBalance(db) {
  const result = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN type='savings' THEN amount WHEN type='withdrawal' THEN -amount ELSE 0 END),0) AS balance
    FROM transactions WHERE date >= $1 AND date <= $2`,
    [HISTORY_START, localDate()],
  );
  return Number(result.rows[0].balance);
}
async function validateSavingsBalance(db) {
  check(
    (await savingsBalance(db)) >= 0,
    "This change would make actual savings negative. Reduce or remove the related withdrawal first.",
    409,
  );
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
        return (
          await c.query(
            `INSERT INTO shifts(job_id,clock_in,clock_out,break_minutes,break_start)
            VALUES($1,$2,$3,$4,$5) RETURNING *`,
            [s.job_id, s.clock_in, s.clock_out, s.break_minutes, s.break_start],
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
          clock_out: old.clock_out.toISOString(),
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
    res.status(201).json(
      await write(db, async (c) => {
        const row = (
          await c.query(
            "INSERT INTO transactions(date,amount,type,category,description) VALUES($1,$2,$3,$4,$5) RETURNING *,date::text",
            [t.date, t.amount, t.type, t.category, t.description],
          )
        ).rows[0];
        await validateSavingsBalance(c);
        return row;
      }),
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
        const row = (
          await c.query(
            "UPDATE transactions SET date=$1,amount=$2,type=$3,category=$4,description=$5 WHERE id=$6 RETURNING *,date::text",
            [t.date, t.amount, t.type, t.category, t.description, key],
          )
        ).rows[0];
        await validateSavingsBalance(c);
        return row;
      }),
    );
  });
  router.delete("/transactions/:id", async (req, res) => {
    await write(db, async (c) => {
      check(
        (
          await c.query("DELETE FROM transactions WHERE id=$1", [
            id(req.params.id),
          ])
        ).rowCount,
        "Transaction not found.",
        404,
      );
      await validateSavingsBalance(c);
    });
    res.status(204).end();
  });
  router.get("/paychecks", async (req, res) =>
    res.json(await getPaychecks(db)),
  );
  router.post("/paychecks", async (req, res) => {
    const p = paycheckInput(req.body);
    res.status(201).json(
      (
        await db.query(
          `INSERT INTO paychecks(job_id,payday,actual_amount,gross_amount,notes)
      VALUES($1,$2,$3,$4,$5) RETURNING *,payday::text`,
          [p.job_id, p.payday, p.actual_amount, p.gross_amount, p.notes],
        )
      ).rows[0],
    );
  });
  router.patch("/paychecks/:id", async (req, res) => {
    const key = id(req.params.id);
    res.json(
      await write(db, async (c) => {
        const old = (
          await c.query("SELECT *,payday::text FROM paychecks WHERE id=$1", [
            key,
          ])
        ).rows[0];
        check(old, "Paycheck not found.", 404);
        const p = paycheckInput({ ...old, ...req.body });
        return (
          await c.query(
            `UPDATE paychecks SET job_id=$1,payday=$2,actual_amount=$3,gross_amount=$4,notes=$5,updated_at=NOW()
        WHERE id=$6 RETURNING *,payday::text`,
            [p.job_id, p.payday, p.actual_amount, p.gross_amount, p.notes, key],
          )
        ).rows[0];
      }),
    );
  });
  router.delete("/paychecks/:id", async (req, res) => {
    check(
      (await db.query("DELETE FROM paychecks WHERE id=$1", [id(req.params.id)]))
        .rowCount,
      "Paycheck not found.",
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
      base = payRate(b.base_rate);
    const premium =
      b.premium_rate === "" || b.premium_rate == null
        ? null
        : payRate(b.premium_rate);
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
  return router;
}
