import { describe, it, expect } from "vitest";

describe("Chart components", () => {
  it("LineChart module exports correctly", async () => {
    const mod = await import("../LineChart");
    expect(mod.LineChart).toBeDefined();
  });

  it("AreaChart module exports correctly", async () => {
    const mod = await import("../AreaChart");
    expect(mod.AreaChart).toBeDefined();
  });

  it("BarChart module exports correctly", async () => {
    const mod = await import("../BarChart");
    expect(mod.BarChart).toBeDefined();
  });

  it("PieChart module exports correctly", async () => {
    const mod = await import("../PieChart");
    expect(mod.PieChart).toBeDefined();
  });

  it("RadarChart module exports correctly", async () => {
    const mod = await import("../RadarChart");
    expect(mod.RadarChart).toBeDefined();
  });

  it("ComposedChart module exports correctly", async () => {
    const mod = await import("../ComposedChart");
    expect(mod.ComposedChart).toBeDefined();
  });

  it("ChartContainer module exports correctly", async () => {
    const mod = await import("../ChartContainer");
    expect(mod.ChartContainer).toBeDefined();
  });

  it("ChartTooltipContent module exports correctly", async () => {
    const mod = await import("../ChartTooltip");
    expect(mod.ChartTooltipContent).toBeDefined();
  });

  it("ChartLegend module exports correctly", async () => {
    const mod = await import("../ChartLegend");
    expect(mod.ChartLegend).toBeDefined();
  });

  it("barrel export includes all charts", async () => {
    const mod = await import("../index");
    expect(mod.LineChart).toBeDefined();
    expect(mod.AreaChart).toBeDefined();
    expect(mod.BarChart).toBeDefined();
    expect(mod.PieChart).toBeDefined();
    expect(mod.RadarChart).toBeDefined();
    expect(mod.ComposedChart).toBeDefined();
    expect(mod.ChartContainer).toBeDefined();
    expect(mod.ChartTooltipContent).toBeDefined();
    expect(mod.ChartLegend).toBeDefined();
  });
});
