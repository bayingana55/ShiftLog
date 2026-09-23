import { test, expect } from "@playwright/test";

test("Fictional demo loads every page under a repository path without backend requests", async ({
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
  for (const name of [
    "dashboard",
    "shifts",
    "earnings",
    "transactions",
    "savings",
    "analytics",
    "history",
    "settings",
  ]) {
    await page.locator(`#navigation a[href="#${name}"]`).click();
    await expect(page.locator("#main h1")).toBeVisible();
    await expect(page.locator("#demo-banner")).toContainText(
      "fictional records",
    );
    await expect(
      page.locator(
        '#main [data-action="add-shift"]:enabled, #main [data-action^="delete-"]:enabled, #main [data-action^="edit-"]:enabled',
      ),
    ).toHaveCount(0);
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

test("Filters and chart comparisons work while saving is blocked", async ({
  page,
}) => {
  await page.goto("./#shifts");
  await page.locator('[name="job_id"]').selectOption("1");
  await page.locator('[name="from"]').fill("2026-09-01");
  await page.locator('[name="to"]').fill("2026-09-22");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("#filtered-results tbody tr")).toHaveCount(9);
  await expect(
    page.locator('#filtered-results [data-action="edit-shift"]:enabled'),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "This week", exact: true }).click();
  await expect(page.locator("#filtered-results tbody tr")).toHaveCount(1);
  await page.locator('#navigation a[href="#analytics"]').click();
  await page.locator("#spending-comparison").selectOption("actual");
  await expect(page.locator("#comparison-label")).toHaveText("Actual expenses");
  expect(
    await page.evaluate(() => Object.keys(window.Chart.instances).length),
  ).toBeGreaterThan(0);
  const message = await page.evaluate(async () => {
    const { api } = await import("./js/ui.js");
    try {
      await api("/shifts", { method: "POST", body: {} });
    } catch (error) {
      return error.message;
    }
  });
  expect(message).toContain("read-only");
});
