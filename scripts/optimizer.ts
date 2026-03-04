/**
 * Phase 5: Self-optimizer — reads telemetry, outputs routing/budget suggestions.
 * Run nightly or manually: npx tsx scripts/optimizer.ts
 * Set CONTROL_PLANE_API to the Control Plane URL.
 */

const API = process.env.CONTROL_PLANE_API ?? "http://localhost:3001";

interface UsageByJobType {
  job_type: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
}

interface UsageByModel {
  model_id: string;
  model_tier: string;
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
  slow_calls: number;
}

interface RoutingSuggestion {
  job_type: string;
  current_tier?: string;
  suggested_tier: string;
  reason: string;
}

interface BudgetSuggestion {
  scope_type: string;
  scope_value: string;
  suggested_budget_tokens: number;
  reason: string;
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function run() {
  console.log(`[optimizer] Fetching telemetry from ${API}...`);

  const [byJobType, byModel] = await Promise.all([
    fetchJson<{ items: UsageByJobType[] }>("/v1/usage/by_job_type"),
    fetchJson<{ items: UsageByModel[] }>("/v1/usage/by_model"),
  ]);

  console.log(`[optimizer] Found ${byJobType.items.length} job types, ${byModel.items.length} models`);

  const routingSuggestions: RoutingSuggestion[] = [];
  const budgetSuggestions: BudgetSuggestion[] = [];

  for (const jt of byJobType.items) {
    // Suggest downgrade to fast/chat for high-volume, low-latency job types
    if (jt.calls > 100 && jt.avg_latency_ms < 2000) {
      routingSuggestions.push({
        job_type: jt.job_type,
        suggested_tier: "fast/chat",
        reason: `High volume (${jt.calls} calls) with low latency (${jt.avg_latency_ms}ms avg); fast/chat with caching would reduce cost.`,
      });
    }

    // Suggest upgrade to max/chat for low-volume but high-token job types
    if (jt.calls < 20 && Number(jt.tokens_out) > 50_000) {
      routingSuggestions.push({
        job_type: jt.job_type,
        suggested_tier: "max/chat",
        reason: `Low volume (${jt.calls} calls) but high output (${jt.tokens_out} tokens); max/chat may produce better quality.`,
      });
    }

    // Budget suggestion based on current usage + 20% headroom
    const totalTokens = Number(jt.tokens_in) + Number(jt.tokens_out);
    if (totalTokens > 10_000) {
      budgetSuggestions.push({
        scope_type: "job_type",
        scope_value: jt.job_type,
        suggested_budget_tokens: Math.ceil(totalTokens * 1.2),
        reason: `Current usage: ${totalTokens} tokens/30d. Suggested budget: ${Math.ceil(totalTokens * 1.2)} (20% headroom).`,
      });
    }
  }

  // Check for models with high slow_calls rate
  for (const m of byModel.items) {
    if (m.slow_calls > m.calls * 0.1 && m.calls > 10) {
      console.log(`[optimizer] WARNING: ${m.model_id} has ${m.slow_calls}/${m.calls} slow calls (>5s)`);
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    routing_suggestions: routingSuggestions,
    budget_suggestions: budgetSuggestions,
    telemetry_summary: {
      job_types: byJobType.items.length,
      models: byModel.items.length,
      total_calls: byJobType.items.reduce((s, j) => s + j.calls, 0),
    },
  };

  console.log(`\n[optimizer] Results:`);
  console.log(JSON.stringify(output, null, 2));

  // Optionally apply routing suggestions to DB
  if (process.env.OPTIMIZER_APPLY === "true") {
    console.log(`\n[optimizer] Applying ${routingSuggestions.length} routing policies...`);
    for (const s of routingSuggestions) {
      await fetch(`${API}/v1/routing_policies`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin" },
        body: JSON.stringify({ job_type: s.job_type, model_tier: s.suggested_tier }),
      });
      console.log(`  → ${s.job_type}: ${s.suggested_tier}`);
    }
    console.log(`\n[optimizer] Applying ${budgetSuggestions.length} budgets...`);
    for (const b of budgetSuggestions) {
      await fetch(`${API}/v1/llm_budgets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": "admin" },
        body: JSON.stringify({ scope_type: b.scope_type, scope_value: b.scope_value, budget_tokens: b.suggested_budget_tokens }),
      });
      console.log(`  → ${b.scope_type}/${b.scope_value}: ${b.suggested_budget_tokens} tokens`);
    }
  }

  console.log("\n[optimizer] Done.");
}

run().catch((e) => {
  console.error("[optimizer] Error:", e);
  process.exit(1);
});
