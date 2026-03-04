import { test, expect } from "@playwright/test";

const BASE = process.env.CONSOLE_URL ?? "http://localhost:3000";

test.describe("Admin pages load", () => {
  test("admin index page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin`);
    await expect(page.locator("h1")).toContainText("Admin");
  });

  test("admin initiatives list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/initiatives`);
    await expect(page.locator("h1")).toContainText("Initiatives");
  });

  test("admin runs list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/runs`);
    await expect(page.locator("h1")).toContainText("Runs");
  });

  test("admin job_runs list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/job_runs`);
    await expect(page.locator("h1")).toContainText("Job Runs");
  });

  test("admin artifacts list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/artifacts`);
    await expect(page.locator("h1")).toContainText("Artifacts");
  });

  test("admin plans list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/plans`);
    await expect(page.locator("h1")).toContainText("Plans");
  });

  test("admin approvals list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/approvals`);
    await expect(page.locator("h1")).toContainText("Approvals");
  });

  test("admin tool_calls list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/tool_calls`);
    await expect(page.locator("h1")).toContainText("Tool Calls");
  });

  test("admin costs page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/costs`);
    await expect(page.locator("h1")).toContainText("Cost");
  });

  test("admin agent_memory list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/agent_memory`);
    await expect(page.locator("h1")).toContainText("Agent Memory");
  });

  test("admin mcp_servers list loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/mcp_servers`);
    await expect(page.locator("h1")).toContainText("MCP Servers");
  });

  test("admin plan_nodes page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/plan_nodes`);
    await expect(page.locator("h1")).toContainText("Plan Nodes");
  });

  test("admin plan_edges page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/plan_edges`);
    await expect(page.locator("h1")).toContainText("Plan Edges");
  });

  test("admin new initiative page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/initiatives/new`);
    await expect(page.locator("h1")).toContainText("New");
  });

  test("admin mcp_servers new page loads", async ({ page }) => {
    await page.goto(`${BASE}/admin/mcp_servers/new`);
    await expect(page.locator("h1")).toContainText("New MCP Server");
  });
});
