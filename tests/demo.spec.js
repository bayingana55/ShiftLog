import { test, expect } from "@playwright/test";

// The sandbox starts blank. Sample data is built relative to "today", so every
// test fixes the browser clock: Tuesday, September 22, 2026 at noon in Vancouver.
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-09-22T12:00:00-07:00"));
});

const card = (page, label) =>
  page.locator(".stat-card").filter({ hasText: label });
const NO_SHIFTS =
  "No shifts yet. Log your first shift to see your pay calculated.";
const NO_EXPENSES =
  "No expenses yet. Add an expense to see where your money goes.";

async function go(page, name) {
  await page.locator(`#navigation a[href="#${name}"]`).click();
  await expect(page.locator("#main")).not.toHaveAttribute("aria-busy", "true");
}
async function logShift(page, job, start, end) {
  // An empty page has a second "Log shift" button in its empty state.
  await page
    .getByRole("button", { name: "Log shift", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Job", exact: true })
    .selectOption({ label: job });
  await dialog.getByLabel("Start date & time (Vancouver)").fill(start);
  await dialog.getByLabel("End date & time (Vancouver)").fill(end);
  await dialog.getByRole("button", { name: "Save shift" }).click();
}
async function expectBlank(page) {
  await go(page, "dashboard");
  await expect(card(page, "Hours this week")).toContainText("0.0 hrs");
  await expect(card(page, "Earned this month")).toContainText("$0.00");
  await expect(card(page, "Spent this month")).toContainText("$0.00");
  await expect(card(page, "Saved vs goal")).toContainText("$0.00 of $5,000.00");
  await expect(page.locator("#main")).toContainText(NO_SHIFTS);
}

test("Starts blank: generic jobs, a $5,000 goal, empty states, no server", async ({
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
  await expect(page.locator("#demo-banner")).toContainText(
    "Sandbox demo: start by logging a shift. Your changes stay in your browser.",
  );
  await expectBlank(page);

  await go(page, "shifts");
  await expect(page.locator("#filtered-results")).toContainText(NO_SHIFTS);
  await expect(page.locator("#filtered-results tbody tr")).toHaveCount(0);
  await expect(page.locator('#filter-form [name="job_id"] option')).toHaveText([
    "All jobs",
    "Day job",
    "Night job",
  ]);

  await go(page, "money");
  await expect(page.locator("#filtered-results")).toContainText(NO_EXPENSES);
  await expect(page.locator(".savings-card")).toContainText(
    "$0.00 toward $5,000.00",
  );
  await expect(page.locator("#main")).toContainText(
    "No paychecks recorded yet.",
  );

  await go(page, "settings");
  await expect(page.locator('#goal-form [name="amount"]')).toHaveValue("5000");
  const rates = page.locator(".rate-list");
  await expect(rates).toContainText("Day job");
  await expect(rates).toContainText("$20.00/hr");
  await expect(rates).toContainText("Night job");
  await expect(rates).toContainText("$18.00/hr");
  await expect(rates).toContainText("$20.00/hr · 22:00–05:30");

  for (const name of ["dashboard", "shifts", "money", "settings"]) {
    await go(page, name);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflow, `overflow on ${name}`).toBe(false);
  }
  expect(
    requests.some((url) => new URL(url).pathname.startsWith("/api/")),
  ).toBe(false);
  expect(failures).toEqual([]);
});

test("Logging a shift updates the Overview; overlaps are rejected; Reset returns to blank", async ({
  page,
}) => {
  await page.goto("./");
  const hours = card(page, "Hours this week");
  const earned = card(page, "Earned this month");

  // Day job pays $20/hour: 4 hours = $80, calculated by lib/pay.js in the browser.
  await logShift(page, "Day job", "2026-09-22T06:00", "2026-09-22T10:00");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(hours).toContainText("4.0 hrs");
  await expect(earned).toContainText("$80.00");
  await expect(page.locator("#main")).not.toContainText(NO_SHIFTS);

  // Night job overnight: 20:00–22:00 at $18, 22:00–04:00 at $20 = $156.
  await logShift(page, "Night job", "2026-09-20T20:00", "2026-09-21T04:00");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(earned).toContainText("$236.00");
  // It started on Sunday, so it belongs to last week.
  await expect(hours).toContainText("4.0 hrs");

  // 09:00–11:00 overlaps the 06:00–10:00 shift.
  await logShift(page, "Night job", "2026-09-22T09:00", "2026-09-22T11:00");
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
  await expect(earned).toContainText("$236.00");

  // A refresh keeps the changes (sessionStorage); Reset returns to blank.
  await page.reload();
  await expect(earned).toContainText("$236.00");
  await page.getByRole("button", { name: "Reset demo" }).click();
  await expectBlank(page);
  await page.reload();
  await expectBlank(page);
});

test("Load sample data fills four weeks with generic jobs; Reset empties it", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Load sample data" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Day job and Night job");
  await dialog
    .getByRole("button", { name: "Load sample data", exact: true })
    .click();
  await expect(card(page, "Hours this week")).toContainText("7.5 hrs");
  await expect(card(page, "Earned this month")).toContainText("$2,227.50");
  await expect(card(page, "Spent this month")).toContainText("$1,820.00");
  await expect(page.locator("#main")).not.toContainText(NO_SHIFTS);

  await go(page, "shifts");
  const rows = page.locator("#filtered-results tbody tr");
  await expect(rows).toHaveCount(19);
  await page.locator('[name="job_id"]').selectOption({ label: "Night job" });
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(rows).toHaveCount(7);
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(page.locator("#filtered-results")).toContainText(
    "No shifts match this view.",
  );

  await go(page, "money");
  await expect(page.locator("#income-chart")).toBeVisible();
  expect(
    await page.evaluate(() => Object.keys(window.Chart.instances).length),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("cell", { name: "Sample groceries" }).first(),
  ).toBeVisible();
  // Only generic names, never a real employer.
  await expect(page.locator("body")).not.toContainText(/Apple|Home Depot/);

  await page.getByRole("button", { name: "Reset demo" }).click();
  await expectBlank(page);
});

test("Add job in Settings: appears in Log shift, uses its rate, Reset removes it", async ({
  page,
}) => {
  await page.goto("./#settings");
  const form = page.locator("#job-form");
  await form.getByLabel("Job name").fill("Weekend job");
  await form.getByLabel("Base rate (CAD/hour)").fill("16");
  await form.getByLabel("Premium rate (optional)").fill("24");
  await form.getByLabel("Premium starts").fill("22:00");
  await form.getByLabel("Premium ends").fill("02:00");
  await form.getByRole("button", { name: "Add job" }).click();
  await expect(page.locator(".rate-list")).toContainText("Weekend job");

  // Same validation as the real app: duplicate names and missing rates fail.
  await form.getByLabel("Job name").fill("day JOB");
  await form.getByLabel("Base rate (CAD/hour)").fill("16");
  await form.getByRole("button", { name: "Add job" }).click();
  await expect(form.getByRole("alert")).toHaveText(
    "A job with this name already exists.",
  );

  // 21:00–22:00 at $16 plus 22:00–23:00 at the $24 premium = $40.
  await go(page, "shifts");
  await logShift(page, "Weekend job", "2026-09-21T21:00", "2026-09-21T23:00");
  const row = page.getByRole("row").filter({ hasText: "Sep 21, 2026" });
  await expect(row).toContainText("Weekend job");
  await expect(row.getByRole("cell", { name: "$40.00" })).toBeVisible();

  await page.reload();
  await expect(page.locator('#filter-form [name="job_id"] option')).toHaveText([
    "All jobs",
    "Day job",
    "Night job",
    "Weekend job",
  ]);
  await page.getByRole("button", { name: "Reset demo" }).click();
  await go(page, "shifts");
  await expect(page.locator('#filter-form [name="job_id"] option')).toHaveText([
    "All jobs",
    "Day job",
    "Night job",
  ]);
});

test("Shifts edit and delete; expenses and savings update Money and Overview; paychecks read-only", async ({
  page,
}) => {
  await page.goto("./#shifts");
  await logShift(page, "Day job", "2026-09-22T06:00", "2026-09-22T10:00");
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
  await expect(page.locator("#filtered-results")).toContainText(NO_SHIFTS);

  await go(page, "money");
  await page.getByRole("button", { name: "Add expense", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("50");
  await dialog.getByLabel("Description").fill("Sandbox lunch");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("cell", { name: "Sandbox lunch" })).toBeVisible();

  const savings = page.locator(".savings-card");
  await savings
    .getByRole("button", { name: "Add savings", exact: true })
    .click();
  await dialog.getByLabel("Amount (CAD)").fill("100");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(savings).toContainText("$100.00 toward $5,000.00");
  // Savings can't go negative: same rule and message as the real API.
  await savings.getByRole("button", { name: "Withdraw", exact: true }).click();
  await dialog.getByLabel("Amount (CAD)").fill("150");
  await dialog.getByRole("button", { name: "Save transaction" }).click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "This change would make actual savings negative. Reduce or remove the related withdrawal first.",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("button", { name: "Record paycheck", exact: true }),
  ).toBeDisabled();

  // The goal can be changed in Settings.
  await go(page, "settings");
  await page.locator('#goal-form [name="amount"]').fill("1000");
  await page.getByRole("button", { name: "Save goal" }).click();
  await go(page, "dashboard");
  await expect(card(page, "Spent this month")).toContainText("$50.00");
  await expect(card(page, "Saved vs goal")).toContainText("10%");
  await expect(card(page, "Saved vs goal")).toContainText(
    "$100.00 of $1,000.00",
  );
});
