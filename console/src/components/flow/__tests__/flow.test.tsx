import { describe, it, expect } from "vitest";

describe("Flow components", () => {
  it("PlanNode module exports correctly", async () => {
    const mod = await import("../PlanNode");
    expect(mod.PlanNode).toBeDefined();
  });

  it("StartEndNodes module exports correctly", async () => {
    const mod = await import("../StartEndNodes");
    expect(mod.StartNode).toBeDefined();
    expect(mod.EndNode).toBeDefined();
  });

  it("FlowToolbar module exports correctly", async () => {
    const mod = await import("../FlowToolbar");
    expect(mod.FlowToolbar).toBeDefined();
  });

  it("FlowCanvas module exports correctly", async () => {
    const mod = await import("../FlowCanvas");
    expect(mod.FlowCanvas).toBeDefined();
  });

  it("PlanDagViewer module exports correctly", async () => {
    const mod = await import("../PlanDagViewer");
    expect(mod.PlanDagViewer).toBeDefined();
  });

  it("RunFlowViewer module exports correctly", async () => {
    const mod = await import("../RunFlowViewer");
    expect(mod.RunFlowViewer).toBeDefined();
  });

  it("layoutDag produces valid output", async () => {
    const { layoutDag } = await import("../layout");
    const nodes = [
      { id: "a", position: { x: 0, y: 0 }, data: {} },
      { id: "b", position: { x: 0, y: 0 }, data: {} },
    ];
    const edges = [{ id: "a-b", source: "a", target: "b" }];
    const result = layoutDag(nodes, edges);
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.nodes[0].position.x).not.toBe(0);
    expect(result.nodes[0].position.y).not.toBe(0);
  });

  it("barrel export includes all flow components", async () => {
    const mod = await import("../index");
    expect(mod.FlowCanvas).toBeDefined();
    expect(mod.PlanNode).toBeDefined();
    expect(mod.StartNode).toBeDefined();
    expect(mod.EndNode).toBeDefined();
    expect(mod.FlowToolbar).toBeDefined();
    expect(mod.PlanDagViewer).toBeDefined();
    expect(mod.RunFlowViewer).toBeDefined();
    expect(mod.layoutDag).toBeDefined();
  });
});
