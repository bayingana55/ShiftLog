import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server.js";
import { isolatedDatabase } from "./database.js";
import { migrate } from "../scripts/migrate.js";
import { localDate } from "../lib/time.js";

test("Database-backed REST workflows in an isolated test schema", async (t) => {
  const { db, cleanup } = await isolatedDatabase();
  const server = createApp(db).listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = "GET", body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: res.status,
      body: res.status === 204 ? null : await res.json(),
    };
  };
  const send = async (path, method, body, status = 200) => {
    const r = await request(path, method, body);
    assert.equal(r.status, status, JSON.stringify(r.body));
    return r.body;
  };
  try {
    let apple, depot, shift;
    await t.test(
      "server serves UI, DB connection and migration rerun work",
      async () => {
        assert.equal((await fetch(base)).status, 200);
        assert.equal((await db.query("SELECT 1 AS ok")).rows[0].ok, 1);
        await migrate(db);
        const jobs = await send("/api/jobs");
        apple = jobs.find((j) => j.name === "Apple").id;
        depot = jobs.find((j) => j.name === "Home Depot").id;
        assert.equal((await send("/api/shifts")).length, 0);
      },
    );
    await t.test(
      "migration 005 removed unused tables and columns",
      async () => {
        const tables = (
          await db.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema()",
          )
        ).rows.map((r) => r.table_name);
        for (const removed of [
          "payroll_schedule",
          "payroll_coverage",
          "budget_rates",
        ])
          assert.ok(!tables.includes(removed), removed);
        const columns = (
          await db.query(
            "SELECT table_name||'.'||column_name AS name, is_nullable FROM information_schema.columns WHERE table_schema=current_schema()",
          )
        ).rows;
        const names = columns.map((c) => c.name);
        for (const removed of [
          "paychecks.period_start",
          "paychecks.period_end",
          "jobs.hourly_wage",
          "shifts.history_key",
        ])
          assert.ok(!names.includes(removed), removed);
        assert.equal(
          columns.find((c) => c.name === "shifts.clock_out").is_nullable,
          "NO",
        );
      },
    );
    await t.test(
      "create, edit, overnight pay, invalid input, overlap and delete",
      async () => {
        shift = await send(
          "/api/shifts",
          "POST",
          {
            job_id: apple,
            clock_in: "2026-09-14T09:00",
            clock_out: "2026-09-14T14:00",
          },
          201,
        );
        assert.equal((await send("/api/shifts"))[0].gross, 100);
        await send(`/api/shifts/${shift.id}`, "PATCH", {
          clock_out: "2026-09-14T15:00",
          break_minutes: 60,
        });
        assert.equal((await send("/api/shifts"))[0].gross, 100);
        await send(
          "/api/shifts",
          "POST",
          {
            job_id: depot,
            clock_in: "2026-09-14T12:00",
            clock_out: "2026-09-14T15:00",
          },
          409,
        );
        await send(
          "/api/shifts",
          "POST",
          {
            job_id: 99999,
            clock_in: "2026-09-13T12:00",
            clock_out: "2026-09-13T13:00",
          },
          404,
        );
        await send(
          "/api/shifts",
          "POST",
          {
            job_id: apple,
            clock_in: "2026-09-12T12:00",
            clock_out: "2026-09-12T11:00",
          },
          400,
        );
        const overnight = await send(
          "/api/shifts",
          "POST",
          {
            job_id: depot,
            clock_in: "2026-09-17T20:00",
            clock_out: "2026-09-18T04:00",
            break_minutes: 30,
          },
          201,
        );
        assert.equal(
          (await send("/api/shifts")).find((s) => s.id === overnight.id).gross,
          146.25,
        );
        assert.equal((await send("/api/shifts?job_id=" + apple)).length, 1);
        await send(`/api/shifts/${shift.id}`, "DELETE", undefined, 204);
        await send(`/api/shifts/${shift.id}`, "DELETE", undefined, 404);
      },
    );
    await t.test("expense CRUD, savings deposit and savings goal", async () => {
      const tx = await send(
        "/api/transactions",
        "POST",
        {
          date: localDate(),
          amount: "12.50",
          category: "Food",
          description: "Lunch",
          type: "expense",
        },
        201,
      );
      await send(`/api/transactions/${tx.id}`, "PATCH", { amount: 15 });
      assert.equal(Number((await send("/api/transactions"))[0].amount), 15);
      await send(
        "/api/transactions",
        "POST",
        { date: localDate(), amount: 500, type: "savings" },
        201,
      );
      await send("/api/savings-goal", "PUT", { amount: 1000 });
      const s = await send("/api/dashboard");
      assert.equal(s.saved, 500);
      assert.equal(s.progress, 50);
      assert.equal(s.remaining, 500);
      assert.equal(s.spending_month, 15);
      await send(`/api/transactions/${tx.id}`, "DELETE", undefined, 204);
      assert.equal((await send("/api/dashboard")).spending_month, 0);
      await send(
        "/api/transactions",
        "POST",
        { date: localDate(), amount: -1, type: "savings" },
        400,
      );
    });
    await t.test(
      "dashboard aggregates match shifts; monthly rows start in January 2026",
      async () => {
        const s = await send("/api/dashboard"),
          shifts = await send("/api/shifts");
        const expected = shifts
          .filter((x) => x.clock_out && localDate(x.clock_in) >= s.period.month)
          .reduce((n, x) => n + x.gross, 0);
        assert.equal(s.gross_month, Math.round(expected * 100) / 100);
        assert.equal(s.monthly[0].month, "2026-01");
        assert.equal(s.monthly.at(-1).month, s.period.month.slice(0, 7));
      },
    );
    await t.test(
      "pay rules validate and change earnings from effective dates",
      async () => {
        await send("/api/pay-rates", "PUT", {
          job_id: depot,
          effective_from: "2026-09-01",
          base_rate: 21,
          premium_rate: 23,
          premium_start: 1320,
          premium_end: 330,
        });
        assert.equal((await send("/api/pay-rates")).length, 3);
        await send(
          "/api/pay-rates",
          "PUT",
          { job_id: depot, effective_from: "bad" },
          400,
        );
      },
    );
    await t.test(
      "a new job gets a pay rule and is used for shift pay",
      async () => {
        const rule = { premium_start: 1320, premium_end: 120 };
        const job = await send(
          "/api/jobs",
          "POST",
          { name: " Weekend job ", base_rate: 16, premium_rate: 24, ...rule },
          201,
        );
        assert.equal(job.name, "Weekend job");
        assert.ok((await send("/api/jobs")).some((j) => j.id === job.id));
        const rate = (await send("/api/pay-rates")).find(
          (r) => r.job_id === job.id,
        );
        assert.equal(rate.effective_from, "2026-01-01");
        assert.equal(Number(rate.premium_rate), 24);
        // 21:00–22:00 at $16, then 22:00–23:00 at the $24 premium.
        const created = await send(
          "/api/shifts",
          "POST",
          {
            job_id: job.id,
            clock_in: "2026-02-10T21:00",
            clock_out: "2026-02-10T23:00",
          },
          201,
        );
        assert.equal(
          (await send("/api/shifts")).find((x) => x.id === created.id).gross,
          40,
        );
        await send(`/api/shifts/${created.id}`, "DELETE", undefined, 204);

        const count = (await send("/api/jobs")).length;
        await send(
          "/api/jobs",
          "POST",
          { name: "weekend JOB", base_rate: 16, ...rule },
          409,
        );
        await send(
          "/api/jobs",
          "POST",
          { name: "", base_rate: 16, ...rule },
          400,
        );
        await send("/api/jobs", "POST", { name: "No rate", ...rule }, 400);
        await send(
          "/api/jobs",
          "POST",
          {
            name: "Same times",
            base_rate: 16,
            premium_start: 60,
            premium_end: 60,
          },
          400,
        );
        assert.equal((await send("/api/jobs")).length, count);
      },
    );

    await t.test(
      "Paycheck CRUD supports two employers per payday and a real zero",
      async () => {
        const a = await send(
          "/api/paychecks",
          "POST",
          { job_id: apple, payday: localDate(), actual_amount: 1200 },
          201,
        );
        const d = await send(
          "/api/paychecks",
          "POST",
          { job_id: depot, payday: localDate(), actual_amount: 800 },
          201,
        );
        assert.equal(a.gross_amount, null);
        assert.equal(d.notes, "");
        await send(
          "/api/paychecks",
          "POST",
          { job_id: apple, payday: localDate(), actual_amount: 100 },
          409,
        );
        const total = async () =>
          (await send("/api/paychecks")).reduce(
            (sum, p) => sum + Number(p.actual_amount),
            0,
          );
        assert.equal(await total(), 2000);
        await send(`/api/paychecks/${a.id}`, "PATCH", {
          actual_amount: 1250,
          notes: "Corrected amount",
        });
        assert.equal(await total(), 2050);
        await send(`/api/paychecks/${d.id}`, "DELETE", undefined, 204);
        await send(`/api/paychecks/${a.id}`, "PATCH", { actual_amount: 0 });
        const [zero] = await send("/api/paychecks");
        assert.equal(Number(zero.actual_amount), 0); // a real $0 is kept
        await send(`/api/paychecks/${a.id}`, "DELETE", undefined, 204);
        assert.equal((await send("/api/paychecks")).length, 0);
        await send(
          "/api/paychecks",
          "POST",
          { job_id: apple, payday: localDate(), actual_amount: -1 },
          400,
        );
        await send(
          "/api/paychecks",
          "POST",
          {
            job_id: apple,
            payday: localDate(),
            actual_amount: 100,
            gross_amount: -5,
          },
          400,
        );
      },
    );
    await t.test("a logged shift requires an end time", async () => {
      await send(
        "/api/shifts",
        "POST",
        { job_id: apple, clock_in: "2026-09-18T09:00" },
        400,
      );
    });

    await t.test(
      "withdrawals reduce savings, never below zero, even concurrently",
      async () => {
        const before = await send("/api/dashboard");
        assert.equal(before.saved, 500); // the 500 deposit from the earlier test
        const withdrawal = await send(
          "/api/transactions",
          "POST",
          {
            date: localDate(),
            type: "withdrawal",
            amount: 100,
            description: "Test withdrawal",
          },
          201,
        );
        const summary = await send("/api/dashboard");
        assert.equal(summary.saved, 400);
        assert.equal(summary.spending_month, before.spending_month);
        await send(`/api/transactions/${withdrawal.id}`, "PATCH", {
          amount: 50,
        });
        assert.equal((await send("/api/dashboard")).saved, 450);
        await send(
          `/api/transactions/${withdrawal.id}`,
          "DELETE",
          undefined,
          204,
        );
        assert.equal((await send("/api/dashboard")).saved, 500);
        await send(
          "/api/transactions",
          "POST",
          { date: localDate(), type: "withdrawal", amount: 501 },
          409,
        );
        const concurrent = await Promise.all([
          request("/api/transactions", "POST", {
            date: localDate(),
            type: "withdrawal",
            amount: 300,
          }),
          request("/api/transactions", "POST", {
            date: localDate(),
            type: "withdrawal",
            amount: 300,
          }),
        ]);
        assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
        // Deleting the deposit would leave the 300 withdrawal below zero.
        const deposit = (await send("/api/transactions")).find(
          (t) => t.type === "savings" && Number(t.amount) === 500,
        );
        await send(`/api/transactions/${deposit.id}`, "DELETE", undefined, 409);
        assert.equal((await send("/api/dashboard")).saved, 200);
      },
    );
    await t.test(
      "invalid JSON, SQL-like IDs and cross-origin writes are rejected",
      async () => {
        await send("/api/shifts/1%20OR%201=1", "DELETE", undefined, 400);
        const cross = await fetch(base + "/api/shifts", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          body: JSON.stringify({ job_id: apple }),
        });
        assert.equal(cross.status, 403);
        const invalid = await fetch(base + "/api/shifts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        });
        assert.equal(invalid.status, 400);
        assert.ok(!(await invalid.text()).includes("stack"));
      },
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await cleanup();
  }
});
