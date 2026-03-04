import { describe, it, expect } from "vitest";

describe("Editor components", () => {
  it("RichEditor module exports correctly", async () => {
    const mod = await import("../RichEditor");
    expect(mod.RichEditor).toBeDefined();
  });

  it("EditorToolbar module exports correctly", async () => {
    const mod = await import("../EditorToolbar");
    expect(mod.EditorToolbar).toBeDefined();
  });

  it("ReadOnlyViewer module exports correctly", async () => {
    const mod = await import("../ReadOnlyViewer");
    expect(mod.ReadOnlyViewer).toBeDefined();
  });

  it("barrel export includes all editor components", async () => {
    const mod = await import("../index");
    expect(mod.RichEditor).toBeDefined();
    expect(mod.EditorToolbar).toBeDefined();
    expect(mod.ReadOnlyViewer).toBeDefined();
  });
});
