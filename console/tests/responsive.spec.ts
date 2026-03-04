import { test, expect } from "@playwright/test";

test.describe("responsive", () => {
  test("dashboard loads @mobile", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Overview")).toBeVisible();
  });

  test("dashboard loads @tablet", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Overview")).toBeVisible();
  });

  test("dashboard loads @desktop", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Overview")).toBeVisible();
  });

  test("runs page loads @mobile", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Pipeline Runs")).toBeVisible();
  });

  test("runs page loads @tablet", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Pipeline Runs")).toBeVisible();
  });

  test("runs page loads @desktop", async ({ page }) => {
    await page.goto("/runs");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByText("Pipeline Runs")).toBeVisible();
  });

  test("sidebar visible on desktop", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "Sidebar only visible on desktop");
    await page.goto("/dashboard");
    await expect(page.locator("aside")).toBeVisible();
  });

  test("mobile menu button present on mobile viewport", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "desktop", "Menu button only on small viewports");
    await page.goto("/dashboard");
    const menuButton = page.getByRole("button", { name: /open menu/i });
    await expect(menuButton).toBeVisible();
  });
});
