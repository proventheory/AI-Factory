/**
 * Unit tests for llm-client cache headers and safe/unsafe classification.
 * Run: npx tsx --test runners/tests/llm-client.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isSafeToCache } from "../src/llm-client.js";

describe("isSafeToCache", () => {
  const safeTypes = ["triage", "analyze_repo", "code_review", "plan_compile", "plan_migration", "research"];
  const unsafeTypes = ["codegen", "write_patch", "submit_pr", "apply_batch", "openhands_resolver", "prd", "design", "unit_test"];

  for (const jt of safeTypes) {
    it(`returns true for safe job_type: ${jt}`, () => {
      assert.strictEqual(isSafeToCache(jt), true);
    });
  }

  for (const jt of unsafeTypes) {
    it(`returns false for unsafe job_type: ${jt}`, () => {
      assert.strictEqual(isSafeToCache(jt), false);
    });
  }

  it("returns false for unknown job_type", () => {
    assert.strictEqual(isSafeToCache("unknown_type"), false);
  });

  it("returns false for approval (no LLM call)", () => {
    assert.strictEqual(isSafeToCache("approval"), false);
  });
});

describe("chat headers (mock)", () => {
  it("would send x-cache-scope: safe for plan_compile", () => {
    const jobType = "plan_compile";
    const headers: Record<string, string> = {};
    if (isSafeToCache(jobType)) {
      headers["x-cache-scope"] = "safe";
    } else {
      headers["x-cache-scope"] = "no-cache";
      headers["cache-control"] = "no-cache";
    }
    assert.strictEqual(headers["x-cache-scope"], "safe");
    assert.strictEqual(headers["cache-control"], undefined);
  });

  it("would send x-cache-scope: safe for code_review", () => {
    const headers: Record<string, string> = {};
    if (isSafeToCache("code_review")) {
      headers["x-cache-scope"] = "safe";
    } else {
      headers["x-cache-scope"] = "no-cache";
    }
    assert.strictEqual(headers["x-cache-scope"], "safe");
  });

  it("would send x-cache-scope: safe for triage", () => {
    const headers: Record<string, string> = {};
    if (isSafeToCache("triage")) {
      headers["x-cache-scope"] = "safe";
    } else {
      headers["x-cache-scope"] = "no-cache";
    }
    assert.strictEqual(headers["x-cache-scope"], "safe");
  });

  it("would send no-cache for codegen", () => {
    const headers: Record<string, string> = {};
    if (isSafeToCache("codegen")) {
      headers["x-cache-scope"] = "safe";
    } else {
      headers["x-cache-scope"] = "no-cache";
      headers["cache-control"] = "no-cache";
    }
    assert.strictEqual(headers["x-cache-scope"], "no-cache");
    assert.strictEqual(headers["cache-control"], "no-cache");
  });

  it("would send no-cache for write_patch", () => {
    const headers: Record<string, string> = {};
    if (isSafeToCache("write_patch")) {
      headers["x-cache-scope"] = "safe";
    } else {
      headers["x-cache-scope"] = "no-cache";
      headers["cache-control"] = "no-cache";
    }
    assert.strictEqual(headers["x-cache-scope"], "no-cache");
    assert.strictEqual(headers["cache-control"], "no-cache");
  });
});
