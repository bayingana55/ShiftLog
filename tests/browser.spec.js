import { test, expect } from "@playwright/test";
import { localDate } from "../lib/time.js";

// All tests share one isolated test database (scripts/test-server.js),
// so each test sets up the state it depends on.
const money = (value) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    value,
  );
async function navigate(page, label) {
  await page
    .getByRole("navigation")
    .getByRole("link", { name: label, exact: true })
    .click();
  await expect(page.locator("#breadcrumb")).toHaveText(label);
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
}

test("Shifts: log, edit, delete, and overnight premium pay", async ({
  page,
}) => {
  await page.goto("/");
  await navigate(page, "Shifts");
  const dialog = page.getByRole("dialog");
  await page
    .getByRole("button", { name: "Log shift", exact: true })
    .first()
    .click();
  await dialog
    .getByLabel("Start date & time (Vancouver)")
    .fill("2026-09-14T09:00");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-14T14:00");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.getByRole("cell", { name: "$100.00", exact: true }),
  ).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: "Sep 14, 2026" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Unpaid break (minutes)").fill("30");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.getByRole("cell", { name: "$90.00", exact: true }),
  ).toBeVisible();

  // Cancelling a delete keeps the row; confirming removes it.
  await row.getByRole("button", { name: /Delete/ }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Delete/ }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);

  // Overnight Home Depot shift: 22:00–05:30 is premium, 30-minute break.
  await page
    .getByRole("button", { name: "Log shift", exact: true })
    .first()
    .click();
  await dialog
    .getByRole("combobox", { name: "Job", exact: true })
    .selectOption({ label: "Home Depot" });
  await dialog
    .getByLabel("Start date & time (Vancouver)")
    .fill("2026-09-17T20:00");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-18T04:00");
  await dialog.getByLabel("Unpaid break (minutes)").fill("30");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.getByRole("cell", { name: "$146.25", exact: true }),
  ).toBeVisible();
});

test("Money: paychecks, expenses, savings, goal, and chart", async ({
  page,
}) => {
  // Start from a zero savings balance, whatever earlier tests left behind.
  const { saved } = await (await page.request.get("/api/dashboard")).json();
  if (saved > 0)
    await page.request.post("/api/transactions", {
      data: { date: localDate(), type: "withdrawal", amount: saved },
    });
  await page.goto("/#money");
  await expect(
    page.getByRole("heading", { name: "Money", exact: true }),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");

  // Paychecks: two employers can be paid on the same day.
  const paychecks = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Paychecks", exact: true }),
  });
  for (const [job, amount] of [
    ["Apple", "1200"],
    ["Home Depot", "800"],
  ]) {
    await page
      .getByRole("button", { name: "Record paycheck", exact: true })
      .click();
    await dialog
      .getByRole("combobox", { name: "Employer", exact: true })
      .selectOption({ label: job });
    await dialog.getByLabel("Payday", { exact: true }).fill(localDate());
    await dialog.getByLabel("Actual amount received (CAD)").fill(amount);
    await dialog.getByRole("button", { name: "Save paycheck" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(paychecks.getByRole("row")).toHaveCount(3); // header + 2
  const apple = paychecks.getByRole("row").filter({ hasText: "Apple" });
  await apple.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Actual amount received (CAD)").fill("1250");
  await dialog.getByRole("button", { name: "Save paycheck" }).click();
  await expect(
    apple.getByRole("cell", { name: "$1,250.00", exact: true }),
  ).toBeVisible();
  const depot = paychecks.getByRole("row").filter({ hasText: "Home Depot" });
  await depot.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(depot).toHaveCount(0);

  // Expenses: add, edit, delete.
  const list = page.locator("#filtered-results");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await dialog.getByLabel("Amount (CAD)").fill("12.50");
  await dialog.getByLabel("Description").fill("Lunch test");
  await dialog.getByLabel("Category").selectOption("Food");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  const lunch = list.getByRole("row").filter({ hasText: "Lunch test" });
  await lunch.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("15");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(lunch.getByRole("cell", { name: "$15.00" })).toBeVisible();
  await lunch.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(lunch).toHaveCount(0);

  // Savings: balance is deposits minus withdrawals.
  const savings = page.locator(".savings-card");
  async function saveSavings(button, amount, description = "") {
    await savings.getByRole("button", { name: button, exact: true }).click();
    await dialog.getByLabel("Amount (CAD)").fill(amount);
    await dialog.getByLabel("Description").fill(description);
    await dialog.getByRole("button", { name: "Save transaction" }).click();
  }
  await saveSavings("Add savings", "1000");
  await expect(savings).toContainText("$1,000.00");
  await saveSavings("Withdraw", "100", "Withdrawal example");
  await expect(savings).toContainText("$900.00");
  const withdrawal = list
    .getByRole("row")
    .filter({ hasText: "Withdrawal example" });
  await withdrawal.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("20");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$980.00");
  await withdrawal.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(savings).toContainText("$1,000.00");

  // Savings can never go below zero.
  await saveSavings("Withdraw", "5000");
  await expect(dialog.getByRole("alert")).toContainText("negative");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(savings).toContainText("$1,000.00");

  // The goal is edited in one place: Settings.
  await savings.getByRole("link", { name: "Change goal" }).click();
  await page.getByLabel("Goal amount (CAD)").fill("2000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByLabel("Goal amount (CAD)")).toHaveValue("2000");
  await navigate(page, "Money");
  await expect(savings).toContainText("50% saved");

  const chart = await page.evaluate(
    () => window.Chart.getChart("income-chart").data,
  );
  expect(chart.labels[0]).toBe("Jan 2026");
  expect(chart.datasets[1].label).toBe("Expenses");
});

test("Overview: four cards, quick actions, mobile layout, and errors", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your month at a glance" }),
  ).toBeVisible();
  await expect(page.locator(".stat-card")).toHaveCount(4);

  const before = await (await page.request.get("/api/dashboard")).json();
  const saved = page.locator(".stat-card").filter({ hasText: "Saved vs goal" });
  await expect(saved).toContainText(`${before.progress}%`);

  const spent = page
    .locator(".stat-card")
    .filter({ hasText: "Spent this month" });
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Amount (CAD)").fill("25");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save transaction" })
    .click();
  await expect(spent).toContainText(money(before.spending_month + 25));

  await page.getByRole("button", { name: "Log shift", exact: true }).click();
  await expect(
    page.getByRole("dialog").getByRole("heading", { name: "Log shift" }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();

  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of ["Overview", "Shifts", "Money", "Settings"]) {
    await navigate(page, label);
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    expect(noOverflow, `mobile overflow on ${label}`).toBeTruthy();
  }

  // A failed request shows an error with a working "Try again" button.
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test connection unavailable" }),
    }),
  );
  await navigate(page, "Overview");
  await expect(page.getByRole("alert")).toHaveText(
    "Test connection unavailable",
  );
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Your month at a glance" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
