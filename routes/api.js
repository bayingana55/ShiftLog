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
  nonnegativeAmount,
  payRate,
} from "../lib/validation.js";
import {
  getShifts,
  getTransactions,
  getSummary,
  getPaychecks,
} from "../lib/data.js";
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
    check(s.clock_out, "A logged shift requires an end date and time.");
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
  router.put("/savings-balance", async (req, res) => {
    const target = nonnegativeAmount(req.body.amount);
    res.json(
      await write(db, async (c) => {
        const current = await savingsBalance(c);
        const difference = Math.round((target - current) * 100) / 100;
        if (difference !== 0)
          await c.query(
            "INSERT INTO transactions(date,amount,type,category,description) VALUES($1,$2,$3,$4,$5)",
            [
              localDate(),
              Math.abs(difference),
              difference > 0 ? "savings" : "withdrawal",
              "Savings",
              "Savings balance adjustment",
            ],
          );
        return { balance: target, adjustment: difference };
      }),
    );
  });
  router.get("/paychecks", async (req, res) =>
    res.json(await getPaychecks(db)),
  );
  router.post("/paychecks", async (req, res) => {
    const p = paycheckInput(req.body);
    res.status(201).json(
      (
        await db.query(
          `INSERT INTO paychecks(job_id,payday,actual_amount,gross_amount,period_start,period_end,notes)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *,payday::text,period_start::text,period_end::text`,
          [
            p.job_id,
            p.payday,
            p.actual_amount,
            p.gross_amount,
            p.period_start,
            p.period_end,
            p.notes,
          ],
        )
      ).rows[0],
    );
  });
  router.patch("/paychecks/:id", async (req, res) => {
    const key = id(req.params.id);
    res.json(
      await write(db, async (c) => {
        const old = (
          await c.query(
            "SELECT *,payday::text,period_start::text,period_end::text FROM paychecks WHERE id=$1",
            [key],
          )
        ).rows[0];
        check(old, "Paycheck not found.", 404);
        const p = paycheckInput({ ...old, ...req.body });
        return (
          await c.query(
            `UPDATE paychecks SET job_id=$1,payday=$2,actual_amount=$3,gross_amount=$4,period_start=$5,period_end=$6,notes=$7,updated_at=NOW()
        WHERE id=$8 RETURNING *,payday::text,period_start::text,period_end::text`,
            [
              p.job_id,
              p.payday,
              p.actual_amount,
              p.gross_amount,
              p.period_start,
              p.period_end,
              p.notes,
              key,
            ],
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
  router.get("/analytics", async (req, res) => {
    const { monthly, by_job, history_start } = await getSummary(db);
    res.json({ monthly, by_job, history_start });
  });
  router.get("/budget", async (req, res) =>
    res.json(
      (
        await db.query(
          "SELECT category,amount,effective_from::text FROM budget_rates ORDER BY effective_from DESC,category",
        )
      ).rows,
    ),
  );
  router.put("/budget", async (req, res) => {
    const effective = date(req.body.effective_from);
    check(
      effective >= HISTORY_START && effective.endsWith("-01"),
      "Budget changes must start on the first day of a month from January 2026.",
    );
    const items = req.body.items;
    check(
      Array.isArray(items) && items.length <= 50,
      "Provide up to 50 budget categories.",
    );
    const values = items.map((item) => {
      check(
        item &&
          typeof item.category === "string" &&
          item.category.trim().length >= 1 &&
          item.category.trim().length <= 60,
        "Category names must be 1–60 characters.",
      );
      return {
        category: item.category.trim(),
        amount: nonnegativeAmount(item.amount),
      };
    });
    check(
      new Set(values.map((item) => item.category.toLowerCase())).size ===
        values.length,
      "Each budget category must have a unique name.",
    );
    await write(db, async (c) => {
      // Zero rows end removed categories from this month without erasing past budgets.
      const previous = (
        await c.query(
          "SELECT DISTINCT category FROM budget_rates WHERE effective_from <= $1",
          [effective],
        )
      ).rows;
      const removed = previous
        .filter((old) => !values.some((item) => item.category === old.category))
        .map((old) => ({ ...old, amount: 0 }));
      for (const item of [...removed, ...values])
        await c.query(
          "INSERT INTO budget_rates(category,effective_from,amount) VALUES($1,$2,$3) ON CONFLICT(category,effective_from) DO UPDATE SET amount=EXCLUDED.amount",
          [item.category, effective, item.amount],
        );
    });
    res.json({ effective_from: effective, items: values });
  });
  router.get("/pay-periods", async (req, res) => {
    const summary = await getSummary(db);
    res.json({
      schedule: summary.payroll_schedule,
      coverage: summary.payroll_coverage,
      periods: summary.pay_periods,
    });
  });
  router.put("/payroll-coverage", async (req, res) => {
    const job = id(req.body.job_id);
    const end = req.body.anchor_period_end
      ? date(req.body.anchor_period_end)
      : null;
    check(
      !end || (end >= "2026-01-01" && end <= "2026-09-18"),
      "Enter the last work date covered by the September 18, 2026 paycheck.",
    );
    check(
      (await db.query("SELECT id FROM jobs WHERE id=$1", [job])).rowCount,
      "Job not found.",
      404,
    );
    res.json(
      (
        await db.query(
          "INSERT INTO payroll_coverage(job_id,anchor_period_end) VALUES($1,$2) ON CONFLICT(job_id) DO UPDATE SET anchor_period_end=$2 RETURNING job_id,anchor_period_end::text",
          [job, end],
        )
      ).rows[0],
    );
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
