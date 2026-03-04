import { test, expect } from "@playwright/test";

test.describe("layout", () => {
  test("AppShell visible @desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible();
    const sidebar = page.locator("aside");
    await expect(sidebar).toBeVisible();
  });

  test("main content area present @desktop", async ({ page }) => {
    await page.goto("/dashboard");
    const main = page.getByRole("main");
    await expect(main).toBeVisible();
    await expect(main.locator("div").first()).toBeVisible();
  });

  test("no horizontal overflow on body @desktop", async ({ page }) => {
    await page.goto("/dashboard");
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("no horizontal overflow on body @mobile", async ({ page }) => {
    await page.goto("/dashboard");
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test("no horizontal overflow on body @tablet", async ({ page }) => {
    await page.goto("/dashboard");
    const body = page.locator("body");
    const scrollWidth = await body.evaluate((el) => el.scrollWidth);
    const clientWidth = await body.evaluate((el) => el.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });
});
