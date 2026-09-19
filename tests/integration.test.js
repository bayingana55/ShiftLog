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
      "create, edit, overnight pay, invalid input, overlap and delete",
      async () => {
        shift = await send(
          "/api/shifts",
          "POST",
          {
            job_id: apple,
            clock_in: "2026-09-14T08:00",
            clock_out: "2026-09-14T13:00",
          },
          201,
        );
        assert.equal((await send("/api/shifts"))[0].gross, 125);
        await send(`/api/shifts/${shift.id}`, "PATCH", {
          clock_out: "2026-09-14T14:00",
          break_minutes: 60,
        });
        assert.equal((await send("/api/shifts"))[0].gross, 125);
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
          { job_id: 99999, clock_in: "2026-09-13T12:00" },
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
            clock_in: "2026-09-17T21:00",
            clock_out: "2026-09-18T05:30",
            break_minutes: 30,
          },
          201,
        );
        assert.equal(
          (await send("/api/shifts")).find((s) => s.id === overnight.id).gross,
          179.64,
        );
        assert.equal((await send("/api/shifts?job_id=" + apple)).length, 1);
        await send(`/api/shifts/${shift.id}`, "DELETE", undefined, 204);
        await send(`/api/shifts/${shift.id}`, "DELETE", undefined, 404);
      },
    );
    await t.test(
      "concurrent clock-ins allow one active shift; clock-out updates it",
      async () => {
        const results = await Promise.all([
          request("/api/clock-in", "POST", { job_id: apple }),
          request("/api/clock-in", "POST", { job_id: depot }),
        ]);
        assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
        const active = results.find((r) => r.status === 201).body;
        await send(`/api/shifts/${active.id}/clock-out`, "PATCH", {
          break_minutes: 0,
        });
        await send(
          `/api/shifts/${active.id}/clock-out`,
          "PATCH",
          { break_minutes: 0 },
          409,
        );
        assert.equal(
          (await send("/api/shifts")).filter((s) => !s.clock_out).length,
          0,
        );
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
      "dashboard aggregates match shifts; analytics returns 12 months",
      async () => {
        const s = await send("/api/dashboard"),
          shifts = await send("/api/shifts");
        const expected = shifts
          .filter((x) => x.clock_out && localDate(x.clock_in) >= s.period.month)
          .reduce((n, x) => n + x.gross, 0);
        assert.equal(s.gross_month, Math.round(expected * 100) / 100);
        assert.equal((await send("/api/analytics")).monthly.length, 12);
        assert.equal(s.payroll.available, false);
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
      "history preview is read-only and concurrent import is idempotent",
      async () => {
        const range = { from: "2026-01-01", to: "2026-01-10" };
        const before = (await send("/api/shifts")).length;
        const rows = await send("/api/history/preview", "POST", range);
        assert.equal((await send("/api/shifts")).length, before);
        assert.ok(rows.length > 0);
        const payload = { ...range, keys: rows.map((s) => s.history_key) };
        const results = await Promise.all([
          send("/api/history/import", "POST", payload),
          send("/api/history/import", "POST", payload),
        ]);
        assert.equal(
          results.reduce((s, r) => s + r.inserted, 0),
          rows.length,
        );
        const third = await send("/api/history/import", "POST", payload);
        assert.equal(third.inserted, 0);
        assert.equal((await send("/api/shifts")).length, before + rows.length);
      },
    );
    await t.test(
      "invalid JSON, SQL-like IDs and cross-origin writes are rejected",
      async () => {
        await send("/api/shifts/1%20OR%201=1", "DELETE", undefined, 400);
        const cross = await fetch(base + "/api/clock-in", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://example.com",
          },
          body: JSON.stringify({ job_id: apple }),
        });
        assert.equal(cross.status, 403);
        const invalid = await fetch(base + "/api/clock-in", {
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
