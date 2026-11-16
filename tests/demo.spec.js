import { test, expect } from "@playwright/test";

// The sandbox builds its fictional data relative to "today", so every test
// fixes the browser clock: Tuesday, September 22, 2026 at noon in Vancouver.
// At that moment the demo has 7.5 hours this week and $2,227.50 earned in September.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00-07:00"));
});

const card = (page, label) =>
  page.locator(".stat-card").filter({ hasText: label });

async function logShift(page, job, start, end) {
  await page.getByRole("button", { name: "Log shift", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Job", exact: true })
    .selectOption({ label: job });
  await dialog.getByLabel("Start date & time (Vancouver)").fill(start);
  await dialog.getByLabel("End date & time (Vancouver)").fill(end);
  await dialog.getByRole("button", { name: "Save shift" }).click();
}

test("Every page loads in the browser alone, with no server requests", async ({
  page,
}) => {
  const failures = [];
  page.on("pageerror", (error) => failures.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(response.url());
  });
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("./");
  for (const name of ["dashboard", "shifts", "money", "settings"]) {
    await page.locator(`#navigation a[href="#${name}"]`).click();
    await expect(page.locator("#main h1")).toBeVisible();
    await expect(page.locator("#demo-banner")).toContainText(
      "Sandbox demo: fictional data. Your changes stay in your browser.",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow).toBe(false);
  }
  expect(
    requests.some((url) => new URL(url).pathname.startsWith("/api/")),
  ).toBe(false);
  expect(failures).toEqual([]);
});

test("Logging a shift updates the Overview; overlaps are rejected; Reset restores", async ({
  page,
}) => {
  await page.goto("./");
  const hours = card(page, "Hours this week");
  const earned = card(page, "Earned this month");
  await expect(hours).toContainText("7.5 hrs");
  await expect(earned).toContainText("$2,227.50");

  // Apple pays $20/hour: 4 hours = $80, calculated by lib/pay.js in the browser.
  await logShift(page, "Apple", "2026-09-22T06:00", "2026-09-22T10:00");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(hours).toContainText("11.5 hrs");
  await expect(earned).toContainText("$2,307.50");

  // Monday's demo Apple shift runs 09:00–17:00, so this overlaps it.
  await logShift(page, "Home Depot", "2026-09-21T16:00", "2026-09-21T18:00");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toHaveText(
    "This shift overlaps another shift. Check the Shifts page.",
  );
  // The clock says noon, so an afternoon shift today is in the future.
  await dialog
    .getByLabel("Start date & time (Vancouver)")
    .fill("2026-09-22T13:00");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-22T14:00");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(dialog.getByRole("alert")).toContainText("not in the future");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(hours).toContainText("11.5 hrs");

  // A refresh keeps the change (sessionStorage); Reset restores the original data.
  await page.reload();
  await expect(hours).toContainText("11.5 hrs");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expect(hours).toContainText("7.5 hrs");
  await expect(earned).toContainText("$2,227.50");
  await page.reload();
  await expect(hours).toContainText("7.5 hrs");
});

test("Shifts can be edited and deleted; expenses and savings update Money and Overview", async ({
  page,
}) => {
  await page.goto("./#shifts");
  await logShift(page, "Apple", "2026-09-22T06:00", "2026-09-22T10:00");
  const row = page.getByRole("row").filter({ hasText: "Sep 22, 2026" });
  await expect(row.getByRole("cell", { name: "$80.00" })).toBeVisible();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("End date & time (Vancouver)")
    .fill("2026-09-22T11:00");
  await dialog.getByRole("button", { name: "Save shift" }).click();
  await expect(row.getByRole("cell", { name: "$100.00" })).toBeVisible();
  await row.getByRole("button", { name: /Delete/ }).click();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(row).toHaveCount(0);

  await page.locator('#navigation a[href="#money"]').click();
  await page
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await dialog.getByLabel("Amount (CAD)").fill("50");
  await dialog.getByLabel("Description").fill("Sandbox lunch");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("cell", { name: "Sandbox lunch" })).toBeVisible();

  const savings = page.locator(".savings-card");
  await expect(savings).toContainText("$6,885.00");
  await savings
    .getByRole("button", { name: "Add savings", exact: true })
    .click();
  await dialog.getByLabel("Amount (CAD)").fill("100");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$6,985.00");
  // Savings can't go negative: same rule and message as the real API.
  await savings.getByRole("button", { name: "Withdraw", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("10000");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This change would make actual savings negative. Reduce or remove the related withdrawal first.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await savings.getByRole("button", { name: "Withdraw", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("35");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$6,950.00");

  await page.locator('#navigation a[href="#dashboard"]').click();
  await expect(card(page, "Spent this month")).toContainText("$1,863.00");
  await expect(card(page, "Saved vs goal")).toContainText("$6,950.00");
});

test("Filters and charts work; paychecks and pay rates stay read-only", async ({
  page,
}) => {
  await page.goto("./#shifts");
  await page.locator('[name="job_id"]').selectOption("1");
  await page.locator('[name="from"]').fill("2026-09-01");
  await page.locator('[name="to"]').fill("2026-09-22");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("#filtered-results tbody tr")).toHaveCount(9);
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(page.locator("#filtered-results tbody tr")).toHaveCount(1);
  await page.locator('#navigation a[href="#money"]').click();
  await expect(page.locator("#income-chart")).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(window.Chart.instances).length),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("button", { name: "Record paycheck", exact: true }),
  ).toBeDisabled();
  const message = await page.evaluate(async () => {
    const { api } = await import("./js/ui.js");
    try {
      await api("/paychecks", { method: "POST", body: {} });
    } catch (error) {
      return error.message;
    }
  });
  expect(message).toContain("read-only in this demo");
});
