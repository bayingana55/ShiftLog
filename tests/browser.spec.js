import { test, expect } from "@playwright/test";
test("Desktop and mobile: navigation, forms, clock, savings, imports, errors", async ({
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
  await expect(page.getByText("No active shift.")).toBeVisible();
  await page.getByRole("button", { name: "Clock in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "On the clock at Apple" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clock out", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Clock out", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ready when you are." }),
  ).toBeVisible();
  await navigate("Shifts");
  await page.getByRole("button", { name: "Add shift", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Clock in (Vancouver)").fill("2026-09-14T08:00");
  await dialog.getByLabel("Clock out (Vancouver)").fill("2026-09-14T13:00");
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
  await expect(page.getByRole("cell", { name: "$500.00" })).toBeVisible();
  await navigate("Settings");
  await page.getByLabel("Goal amount (CAD)").fill("1000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await expect(page.getByLabel("Goal amount (CAD)")).toHaveValue("1000");
  await navigate("Savings");
  await expect(page.getByText("50% of your goal")).toBeVisible();
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
