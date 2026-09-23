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
      "dashboard aggregates match shifts; analytics starts in January 2026",
      async () => {
        const s = await send("/api/dashboard"),
          shifts = await send("/api/shifts");
        const expected = shifts
          .filter((x) => x.clock_out && localDate(x.clock_in) >= s.period.month)
          .reduce((n, x) => n + x.gross, 0);
        assert.equal(s.gross_month, Math.round(expected * 100) / 100);
        const analytics = await send("/api/analytics");
        assert.equal(analytics.monthly[0].month, "2026-01");
        assert.equal(
          analytics.monthly.at(-1).month,
          s.period.month.slice(0, 7),
        );
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
      "Budget planning, projections, and separate actual savings",
      async () => {
        const summary = await send("/api/dashboard");
        assert.equal(summary.goal, 1000); // prior goal CRUD test intentionally changes it
        assert.equal(summary.planned_month, 2150);
        assert.equal(
          summary.projected_month,
          Math.round((summary.gross_month - 2150) * 100) / 100,
        );
        assert.equal(
          summary.projected_saved,
          Math.round(
            summary.monthly.reduce((n, m) => n + m.income - m.planned, 0) * 100,
          ) / 100,
        );
        assert.equal(summary.saved, 500);
        assert.equal(summary.actual_pay_month, null);
        assert.equal(summary.cash_remaining_month, null);
        const rates = await send("/api/budget");
        assert.equal(rates.length, 4);
        const items = summary.budget_items.map((r) => ({
          ...r,
          amount: r.category === "Rent" ? 1600 : r.amount,
        }));
        await send("/api/budget", "PUT", {
          effective_from: summary.period.month,
          items,
        });
        const updated = await send("/api/dashboard");
        assert.equal(updated.planned_month, 2250);
        assert.equal(updated.monthly[0].planned, 2150);
        await send("/api/budget", "PUT", {
          effective_from: summary.period.month,
          items: summary.budget_items,
        });
        await send(
          "/api/budget",
          "PUT",
          { effective_from: "2026-09-02", items },
          400,
        );
      },
    );
    await t.test(
      "Paycheck CRUD supports two employers per payday, null dates, real zero and missing data",
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
        assert.equal(a.period_start, null);
        assert.equal(d.period_end, null);
        await send(
          "/api/paychecks",
          "POST",
          { job_id: apple, payday: localDate(), actual_amount: 100 },
          409,
        );
        let summary = await send("/api/dashboard");
        assert.equal(summary.actual_pay_month, 2000);
        assert.equal(summary.saved, 500);
        assert.equal(
          summary.cash_remaining_month,
          2000 - summary.spending_month,
        );
        await send(`/api/paychecks/${a.id}`, "PATCH", {
          actual_amount: 1250,
          notes: "Corrected amount",
        });
        assert.equal((await send("/api/dashboard")).actual_pay_month, 2050);
        await send(`/api/paychecks/${d.id}`, "DELETE", undefined, 204);
        await send(`/api/paychecks/${a.id}`, "PATCH", { actual_amount: 0 });
        assert.equal((await send("/api/dashboard")).actual_pay_month, 0);
        await send(`/api/paychecks/${a.id}`, "DELETE", undefined, 204);
        assert.equal((await send("/api/dashboard")).actual_pay_month, null);
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
            period_start: "2026-09-01",
          },
          400,
        );
      },
    );
    await t.test(
      "Payday anchor is separate from coverage; estimates require explicit configuration",
      async () => {
        const result = await send("/api/pay-periods");
        assert.equal(result.schedule.anchor_payday, "2026-09-18");
        assert.ok(result.periods.some((p) => p.payday === "2026-01-09"));
        assert.ok(
          result.periods.every(
            (p) => p.period_start === null && p.gross_estimate === null,
          ),
        );
        await send("/api/payroll-coverage", "PUT", {
          job_id: apple,
          anchor_period_end: "2026-09-12",
        });
        const configured = await send("/api/pay-periods");
        assert.equal(
          configured.periods.find(
            (p) => p.job_id === apple && p.payday === "2026-09-18",
          ).period_start,
          "2026-08-30",
        );
        assert.equal(
          configured.periods.find(
            (p) => p.job_id === depot && p.payday === "2026-09-18",
          ).gross_estimate,
          null,
        );
        await send("/api/payroll-coverage", "PUT", {
          job_id: apple,
          anchor_period_end: "",
        });
      },
    );
    await t.test(
      "Full authorized schedule import preserves samples, ends Sep 17, and reruns safely",
      async () => {
        const range = { from: "2026-01-01", to: "2026-09-17" };
        const rows = await send("/api/history/preview", "POST", range);
        assert.equal(rows.length, 245);
        const input = { ...range, keys: rows.map((r) => r.history_key) };
        await send("/api/history/import", "POST", input);
        assert.equal(
          (await send("/api/history/import", "POST", input)).inserted,
          0,
        );
        const shifts = await send("/api/shifts");
        const imported = shifts.filter((s) => s.source === "schedule");
        assert.ok(imported.every((s) => localDate(s.clock_in) <= "2026-09-17"));
        assert.equal(
          new Set(shifts.map((s) => s.job_id + ":" + s.clock_in)).size,
          shifts.length,
        );
        await send(
          "/api/history/preview",
          "POST",
          { ...range, to: "2026-09-18" },
          400,
        );
        await send(
          "/api/shifts",
          "POST",
          { job_id: apple, clock_in: "2026-09-18T08:00" },
          400,
        );
      },
    );

    await t.test(
      "Savings adjustments and withdrawals preserve honest totals and protect concurrent balance",
      async () => {
        const before = await send("/api/dashboard");
        await send("/api/savings-balance", "PUT", { amount: 1000 });
        assert.equal((await send("/api/dashboard")).saved, 1000);
        const reduced = await send("/api/savings-balance", "PUT", {
          amount: 700,
        });
        assert.equal(reduced.adjustment, -300);
        const noChange = await send("/api/savings-balance", "PUT", {
          amount: 700,
        });
        assert.equal(noChange.adjustment, 0);
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
        let summary = await send("/api/dashboard");
        assert.equal(summary.saved, 600);
        assert.equal(summary.spending_month, before.spending_month);
        assert.equal(summary.projected_saved, before.projected_saved);
        await send(`/api/transactions/${withdrawal.id}`, "PATCH", {
          amount: 50,
        });
        assert.equal((await send("/api/dashboard")).saved, 650);
        await send(
          `/api/transactions/${withdrawal.id}`,
          "DELETE",
          undefined,
          204,
        );
        assert.equal((await send("/api/dashboard")).saved, 700);
        await send(
          "/api/transactions",
          "POST",
          { date: localDate(), type: "withdrawal", amount: 701 },
          409,
        );
        assert.equal((await send("/api/dashboard")).saved, 700);
        const concurrent = await Promise.all([
          request("/api/transactions", "POST", {
            date: localDate(),
            type: "withdrawal",
            amount: 500,
          }),
          request("/api/transactions", "POST", {
            date: localDate(),
            type: "withdrawal",
            amount: 500,
          }),
        ]);
        assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409]);
        const deposit = (await send("/api/transactions")).find(
          (t) => t.type === "savings" && Number(t.amount) === 500,
        );
        await send(`/api/transactions/${deposit.id}`, "DELETE", undefined, 409);
        await send("/api/savings-balance", "PUT", { amount: 0 });
        assert.equal((await send("/api/dashboard")).saved, 0);
        await send("/api/savings-balance", "PUT", { amount: -1 }, 400);
      },
    );
    await t.test(
      "Budget categories can be added, renamed, removed, and cleared without deleting earlier plans",
      async () => {
        const month = localDate().slice(0, 7) + "-01";
        await send("/api/budget", "PUT", {
          effective_from: month,
          items: [
            { category: "Travel", amount: 250 },
            { category: "Rent", amount: 1000 },
          ],
        });
        let summary = await send("/api/dashboard");
        assert.equal(summary.planned_month, 1250);
        assert.equal(summary.monthly[0].planned, 2150);
        await send("/api/budget", "PUT", {
          effective_from: month,
          items: [{ category: "Trips", amount: 200 }],
        });
        summary = await send("/api/dashboard");
        assert.equal(summary.planned_month, 200);
        assert.deepEqual(summary.budget_items, [
          { category: "Trips", amount: 200 },
        ]);
        await send("/api/budget", "PUT", { effective_from: month, items: [] });
        assert.equal((await send("/api/dashboard")).planned_month, 0);
        await send(
          "/api/budget",
          "PUT",
          {
            effective_from: month,
            items: [
              { category: "Rent", amount: 1 },
              { category: "rent", amount: 2 },
            ],
          },
          400,
        );
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
