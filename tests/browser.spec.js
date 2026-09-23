import { test, expect } from "@playwright/test";
test("Desktop and mobile: navigation, forms, work log, savings, imports, errors", async ({
  page,
}) => {
  const navigate = async (label) => {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.locator("#breadcrumb")).toHaveText(label);
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little work. A little progress." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clock in", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".brand")).toHaveText("ShiftLog");
  await expect(page.locator(".brand-mark")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Log your work" }),
  ).toBeVisible();
  await navigate("Shifts");
  await page
    .getByRole("button", { name: "Log shift", exact: true })
    .first()
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Start date & time (Vancouver)")
    .fill("2026-09-14T08:00");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-14T13:00");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.getByRole("cell", { name: "$125.00", exact: true }),
  ).toBeVisible();
  let row = page.getByRole("row").filter({ hasText: "Sep 14, 2026" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Unpaid break (minutes)")
    .fill("30");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save shift" })
    .click();
  await expect(
    page.getByRole("cell", { name: "$112.50", exact: true }),
  ).toBeVisible();
  await row.getByRole("button", { name: /Delete/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel" })
    .click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: /Delete/ }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await page
    .getByRole("button", { name: "Log shift", exact: true })
    .first()
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Job", exact: true })
    .selectOption({ label: "Home Depot" });
  await dialog
    .getByLabel("Start date & time (Vancouver)")
    .fill("2026-09-17T21:00");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-18T05:30");
  await dialog.getByLabel("Unpaid break (minutes)").fill("30");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(
    page.getByRole("cell", { name: "$179.64", exact: true }),
  ).toBeVisible();
  await navigate("Transactions");
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Amount (CAD)").fill("12.50");
  await dialog.getByLabel("Description").fill("Lunch test");
  await dialog.getByLabel("Category").selectOption("Food");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("cell", { name: "Lunch test" })).toBeVisible();
  row = page.getByRole("row").filter({ hasText: "Lunch test" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Amount (CAD)").fill("15");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save transaction" })
    .click();
  await expect(row.getByRole("cell", { name: "$15.00" })).toBeVisible();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(row).toHaveCount(0);
  await navigate("Savings");
  await page
    .getByRole("button", { name: "Add savings", exact: true })
    .first()
    .click();
  await page.getByRole("dialog").getByLabel("Amount (CAD)").fill("500");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save transaction" })
    .click();
  await expect(
    page.getByRole("cell", { name: "$500.00", exact: true }).first(),
  ).toBeVisible();
  await navigate("Settings");
  await page.getByLabel("Goal amount (CAD)").fill("1000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByLabel("Goal amount (CAD)")).toHaveValue("1000");
  await navigate("Savings");
  await navigate("Overview");
  await expect(page.getByText(/50% actually saved/)).toBeVisible();
  await navigate("Import history");
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Through", { exact: true }).fill("2026-01-03");
  await page.getByRole("button", { name: "Preview shifts" }).click();
  await expect(
    page.getByRole("heading", { name: /2 available/ }),
  ).toBeVisible();
  await expect(page.locator("[name=history-key]:checked")).toHaveCount(0);
  await page.getByRole("button", { name: "Select available" }).click();
  await page.getByRole("button", { name: "Import selected shifts" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Import selected", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  for (const label of [
    "Overview",
    "Earnings",
    "Analytics",
    "Shifts",
    "Transactions",
    "Savings",
    "Settings",
  ]) {
    await navigate(label);
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.locator("h1")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const label of [
    "Overview",
    "Shifts",
    "Earnings",
    "Transactions",
    "Savings",
    "Analytics",
    "Import history",
    "Settings",
  ]) {
    await navigate(label);
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    );
    expect(noOverflow, `mobile overflow on ${label}`).toBeTruthy();
  }
  await page.route("**/api/dashboard", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Test connection unavailable" }),
    }),
  );
  await navigate("Overview");
  await expect(page.getByRole("alert")).toHaveText(
    "Test connection unavailable",
  );
  await page.unroute("**/api/dashboard");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "A little work. A little progress." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Actual paycheck entry, optional periods, missing versus zero, budgets and chart labels", async ({
  page,
}) => {
  const navigate = async (label) => {
    await page
      .getByRole("navigation")
      .getByRole("link", { name: label, exact: true })
      .click();
    await expect(page.locator("#breadcrumb")).toHaveText(label);
    await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
  };
  await page.goto("/#earnings");
  await expect(
    page.getByRole("heading", { name: "Earnings & paychecks" }),
  ).toBeVisible();
  const checks = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Actual paychecks", exact: true }),
  });
  for (const [job, amount] of [
    ["Apple", "1200"],
    ["Home Depot", "800"],
  ]) {
    await page
      .getByRole("button", { name: "Record paycheck", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByRole("combobox", { name: "Employer", exact: true })
      .selectOption({ label: job });
    await dialog.getByLabel("Payday", { exact: true }).fill("2026-09-18");
    await dialog.getByLabel("Actual amount received (CAD)").fill(amount);
    await expect(dialog.getByLabel("Work period start (optional)")).toHaveValue(
      "",
    );
    await dialog.getByRole("button", { name: "Save paycheck" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await expect(checks.getByRole("row")).toHaveCount(3);
  const apple = checks.getByRole("row").filter({ hasText: "Apple" });
  await apple.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Actual amount received (CAD)")
    .fill("1250");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save paycheck" })
    .click();
  await expect(
    apple.getByRole("cell", { name: "$1,250.00", exact: true }),
  ).toBeVisible();
  await navigate("Overview");
  const actual = page
    .locator(".stat-card")
    .filter({ hasText: "Actual pay this month" });
  await expect(actual).toContainText("$2,050.00");
  await expect(
    page.locator(".stat-card").filter({ hasText: "Actual cash remaining" }),
  ).toContainText("$2,050.00");
  await page.getByLabel("Spending comparison").selectOption("actual");
  await expect(page.locator("#comparison-label")).toHaveText("Actual expenses");
  const chart = await page.evaluate(
    () => window.Chart.getChart("income-chart").data,
  );
  expect(chart.labels[0]).toBe("Jan 2026");
  expect(chart.datasets[1].label).toBe("Actual expenses");
  await navigate("Earnings");
  const depot = checks.getByRole("row").filter({ hasText: "Home Depot" });
  await depot.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await expect(depot).toHaveCount(0);
  await apple.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Actual amount received (CAD)")
    .fill("0");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save paycheck" })
    .click();
  await navigate("Overview");
  await expect(actual).toContainText("$0.00");
  await navigate("Earnings");
  await apple.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete", exact: true })
    .click();
  await navigate("Overview");
  await expect(actual).toContainText("Not recorded");
  await navigate("Settings");
  await page
    .getByRole("button", { name: "Edit planned expenses", exact: true })
    .click();
  const rent = page
    .locator(".budget-edit-row")
    .filter({ has: page.locator('input[name="category"][value="Rent"]') });
  await rent.getByLabel("Monthly amount (CAD)").fill("1600");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save budget" })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await navigate("Overview");
  await expect(
    page
      .locator(".stat-card")
      .filter({ hasText: "Planned expenses this month" }),
  ).toContainText("$2,250.00");
  await navigate("Analytics");
  await expect(
    page.getByRole("cell", { name: "Jan 2026", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /2025/ })).toHaveCount(0);
});

test("Overview provides direct editing, savings reduction, withdrawals, and expense removal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("main")).not.toHaveAttribute("aria-busy", "true");
  const savings = page
    .locator(".stat-card")
    .filter({ hasText: "Actual savings balance" });
  const expenses = page
    .locator(".stat-card")
    .filter({ hasText: "Actual expenses this month" });
  const planned = page
    .locator(".stat-card")
    .filter({ hasText: "Planned expenses this month" });
  const dialog = page.getByRole("dialog");
  async function setBalance(value) {
    await savings
      .getByRole("button", { name: "Set balance", exact: true })
      .click();
    await dialog.getByLabel("Actual savings balance (CAD)").fill(value);
    await dialog.getByRole("button", { name: "Save balance" }).click();
    await expect(dialog).not.toBeVisible();
  }
  await setBalance("1000");
  await expect(savings).toContainText("$1,000.00");
  await setBalance("900");
  await expect(savings).toContainText("$900.00");
  await savings.getByRole("button", { name: "Withdraw", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("50");
  await dialog.getByLabel("Description").fill("Withdrawal example");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$850.00");
  await savings.getByRole("button", { name: "History", exact: true }).click();
  let row = dialog.getByRole("row").filter({ hasText: "Withdrawal example" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("20");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$880.00");
  await savings.getByRole("button", { name: "History", exact: true }).click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(savings).toContainText("$900.00");
  await expenses
    .getByRole("button", { name: "Add expense", exact: true })
    .click();
  await dialog.getByLabel("Amount (CAD)").fill("25");
  await dialog.getByLabel("Description").fill("Editable expense");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(expenses).toContainText("$25.00");
  await expenses
    .getByRole("button", { name: "Edit / remove", exact: true })
    .click();
  row = dialog.getByRole("row").filter({ hasText: "Editable expense" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("10");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(expenses).toContainText("$10.00");
  await expenses
    .getByRole("button", { name: "Edit / remove", exact: true })
    .click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(expenses).toContainText("$10.00");
  await expenses
    .getByRole("button", { name: "Edit / remove", exact: true })
    .click();
  await row.getByRole("button", { name: "Delete", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(expenses).toContainText("$0.00");
  await planned
    .getByRole("button", { name: "Edit budget", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "+ Add category", exact: true })
    .click();
  const newRow = dialog.locator(".budget-edit-row").last();
  await newRow.getByLabel("Category", { exact: true }).fill("Travel");
  await newRow.getByLabel("Monthly amount (CAD)").fill("100");
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(planned).toContainText("$2,350.00");
  await planned
    .getByRole("button", { name: "Edit budget", exact: true })
    .click();
  const travel = dialog
    .locator(".budget-edit-row")
    .filter({ has: page.locator('input[value="Travel"]') });
  await travel.getByRole("button", { name: "Remove category" }).click();
  await dialog.getByRole("button", { name: "Save budget" }).click();
  await expect(planned).toContainText("$2,250.00");
  const goal = page
    .locator(".stat-card")
    .filter({ hasText: "Remaining actual goal" });
  await goal.getByRole("button", { name: "Edit goal", exact: true }).click();
  await dialog.getByLabel("Goal amount (CAD)").fill("2000");
  await dialog.getByRole("button", { name: "Save goal" }).click();
  await expect(goal).toContainText("$1,100.00");
  await page.setViewportSize({ width: 390, height: 844 });
  await setBalance("0");
  await expect(savings).toContainText("$0.00");
  await planned
    .getByRole("button", { name: "Edit budget", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Change projection", exact: true })
    .click();
  await expect(dialog).toContainText(
    "logged gross earnings minus planned expenses",
  );
  await dialog
    .getByRole("button", { name: "Edit planned expenses", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Edit planned expenses" }),
  ).toBeVisible();
});
