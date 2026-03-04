/**
 * Unit tests for optimizer logic (routing and budget suggestion rules).
 * Run: npx tsx --test scripts/optimizer.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

interface UsageByJobType {
  job_type: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
}

interface RoutingSuggestion {
  job_type: string;
  suggested_tier: string;
  reason: string;
}

interface BudgetSuggestion {
  scope_type: string;
  scope_value: string;
  suggested_budget_tokens: number;
  reason: string;
}

function computeSuggestions(items: UsageByJobType[]): { routing: RoutingSuggestion[]; budget: BudgetSuggestion[] } {
  const routing: RoutingSuggestion[] = [];
  const budget: BudgetSuggestion[] = [];

  for (const jt of items) {
    if (jt.calls > 100 && jt.avg_latency_ms < 2000) {
      routing.push({ job_type: jt.job_type, suggested_tier: "fast/chat", reason: `High volume low latency` });
    }
    if (jt.calls < 20 && Number(jt.tokens_out) > 50_000) {
      routing.push({ job_type: jt.job_type, suggested_tier: "max/chat", reason: `Low volume high output` });
    }
    const totalTokens = Number(jt.tokens_in) + Number(jt.tokens_out);
    if (totalTokens > 10_000) {
      budget.push({ scope_type: "job_type", scope_value: jt.job_type, suggested_budget_tokens: Math.ceil(totalTokens * 1.2), reason: `20% headroom` });
    }
  }
  return { routing, budget };
}

describe("optimizer suggestion logic", () => {
  it("suggests fast/chat for high-volume low-latency job types", () => {
    const { routing } = computeSuggestions([
      { job_type: "triage", calls: 200, tokens_in: 5000, tokens_out: 2000, avg_latency_ms: 500 },
    ]);
    assert.strictEqual(routing.length, 1);
    assert.strictEqual(routing[0].suggested_tier, "fast/chat");
    assert.strictEqual(routing[0].job_type, "triage");
  });

  it("suggests max/chat for low-volume high-output job types", () => {
    const { routing } = computeSuggestions([
      { job_type: "codegen", calls: 5, tokens_in: 10000, tokens_out: 60000, avg_latency_ms: 10000 },
    ]);
    assert.strictEqual(routing.length, 1);
    assert.strictEqual(routing[0].suggested_tier, "max/chat");
  });

  it("does not suggest routing for moderate usage", () => {
    const { routing } = computeSuggestions([
      { job_type: "code_review", calls: 50, tokens_in: 3000, tokens_out: 1000, avg_latency_ms: 1500 },
    ]);
    assert.strictEqual(routing.length, 0);
  });

  it("suggests budget with 20% headroom for high-token job types", () => {
    const { budget } = computeSuggestions([
      { job_type: "plan_compile", calls: 30, tokens_in: 8000, tokens_out: 5000, avg_latency_ms: 2000 },
    ]);
    assert.strictEqual(budget.length, 1);
    assert.strictEqual(budget[0].suggested_budget_tokens, Math.ceil(13000 * 1.2));
  });

  it("does not suggest budget for low-token job types", () => {
    const { budget } = computeSuggestions([
      { job_type: "approval", calls: 10, tokens_in: 100, tokens_out: 50, avg_latency_ms: 100 },
    ]);
    assert.strictEqual(budget.length, 0);
  });

  it("handles empty input", () => {
    const { routing, budget } = computeSuggestions([]);
    assert.strictEqual(routing.length, 0);
    assert.strictEqual(budget.length, 0);
  });
});
