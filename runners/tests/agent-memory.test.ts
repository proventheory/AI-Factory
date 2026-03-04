/**
 * Unit tests for agent-memory module.
 * Run: npx tsx --test runners/tests/agent-memory.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("agent-memory module exports", () => {
  it("exports readAgentMemory", async () => {
    const mod = await import("../src/agent-memory.js");
    assert.strictEqual(typeof mod.readAgentMemory, "function");
  });

  it("exports writeAgentMemory", async () => {
    const mod = await import("../src/agent-memory.js");
    assert.strictEqual(typeof mod.writeAgentMemory, "function");
  });

  it("exports readMemoryForContext", async () => {
    const mod = await import("../src/agent-memory.js");
    assert.strictEqual(typeof mod.readMemoryForContext, "function");
  });

  it("exports writeMemoryFromResult", async () => {
    const mod = await import("../src/agent-memory.js");
    assert.strictEqual(typeof mod.writeMemoryFromResult, "function");
  });
});
