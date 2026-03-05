/**
 * Unit tests for llm-budgets (checkBudgets logic; getBudgetsForJob/recordUsage require DB).
 * Run: npm test (or npx tsx --test runners/tests/llm-budgets.test.ts)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkBudgets } from "../src/llm-budgets.js";
import type { BudgetRow } from "../src/llm-budgets.js";

describe("checkBudgets", () => {
  it("does not throw when no budgets", () => {
    assert.doesNotThrow(() => checkBudgets([], 1000));
  });

  it("does not throw when budget_tokens is null (unlimited)", () => {
    const rows: BudgetRow[] = [
      {
        id: "1",
        scope_type: "job_type",
        scope_value: "copy_generate",
        budget_tokens: null,
        budget_dollars: null,
        current_usage: 0,
      },
    ];
    assert.doesNotThrow(() => checkBudgets(rows, 1_000_000));
  });

  it("does not throw when current_usage + tokensToAdd <= budget_tokens", () => {
    const rows: BudgetRow[] = [
      {
        id: "1",
        scope_type: "job_type",
        scope_value: "copy_generate",
        budget_tokens: 10_000,
        budget_dollars: null,
        current_usage: 1_000,
      },
    ];
    assert.doesNotThrow(() => checkBudgets(rows, 8_000));
    assert.doesNotThrow(() => checkBudgets(rows, 9_000));
  });

  it("throws when current_usage + tokensToAdd > budget_tokens", () => {
    const rows: BudgetRow[] = [
      {
        id: "1",
        scope_type: "job_type",
        scope_value: "copy_generate",
        budget_tokens: 10_000,
        budget_dollars: null,
        current_usage: 1_000,
      },
    ];
    assert.throws(
      () => checkBudgets(rows, 9_001),
      /llm_budget exceeded.*copy_generate.*10001.*10000/
    );
    assert.throws(
      () => checkBudgets(rows, 10_000),
      /llm_budget exceeded/
    );
  });

  it("handles current_usage as string (pg bigint)", () => {
    const rows: BudgetRow[] = [
      {
        id: "1",
        scope_type: "job_type",
        scope_value: "deck_generate",
        budget_tokens: 5_000,
        budget_dollars: null,
        current_usage: "3000" as unknown as number,
      },
    ];
    assert.doesNotThrow(() => checkBudgets(rows, 1_999));
    assert.throws(
      () => checkBudgets(rows, 2_001),
      /llm_budget exceeded/
    );
  });

  it("checks all budget rows and throws on first exceeded", () => {
    const rows: BudgetRow[] = [
      {
        id: "1",
        scope_type: "job_type",
        scope_value: "copy_generate",
        budget_tokens: 10_000,
        budget_dollars: null,
        current_usage: 0,
      },
      {
        id: "2",
        scope_type: "initiative",
        scope_value: "init-1",
        budget_tokens: 2_000,
        budget_dollars: null,
        current_usage: 1_500,
      },
    ];
    assert.doesNotThrow(() => checkBudgets(rows, 400)); // 1500+400=1900 < 2000
    assert.throws(
      () => checkBudgets(rows, 501),
      /initiative.*init-1/
    );
  });
});
