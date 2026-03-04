/**
 * Continuous Improvement optimizer handler.
 * Reads last N runs from DB (via CP API), identifies worst dimensions,
 * suggests improvements. Registered as job_type "optimizer".
 */
import { chat, isGatewayConfigured } from "../llm-client.js";
import type pg from "pg";
import type { JobContext } from "../job-context.js";

export async function handleOptimizer(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const cpUrl = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");

  let usageData = "No usage data available";
  try {
    const res = await fetch(`${cpUrl}/v1/usage`);
    if (res.ok) usageData = JSON.stringify(await res.json());
  } catch { /* ignore */ }

  let validationData = "No validation data available";
  try {
    const valRes = await client.query(
      `SELECT validator_type, status, count(*)::int as cnt
       FROM validations WHERE created_at > now() - interval '7 days'
       GROUP BY validator_type, status ORDER BY cnt DESC LIMIT 50`
    );
    validationData = JSON.stringify(valRes.rows);
  } catch { /* ignore */ }

  const systemPrompt = `You are an AI Factory optimizer. Analyze recent metrics and suggest improvements.
Output JSON: {
  "routing_changes": [{"job_type": "...", "current_tier": "...", "suggested_tier": "...", "reason": "..."}],
  "quality_changes": [{"dimension": "...", "current_threshold": N, "suggested_threshold": N, "reason": "..."}],
  "slop_guard_additions": [{"rule_id": "...", "pattern": "...", "reason": "..."}],
  "prompt_improvements": [{"job_type": "...", "suggestion": "..."}],
  "summary": "..."
}`;

  const userPrompt = `Recent usage:\n${usageData}\n\nRecent validations:\n${validationData}`;

  let content = "Optimizer not available (LLM gateway not configured)";
  if (isGatewayConfigured()) {
    const result = await chat({
      model: "max/chat",
      messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
      max_tokens: 4096,
      context: { run_id: context.run_id, job_run_id: params.jobRunId, job_type: "optimizer" },
    });
    content = result.content;
  }

  const uri = `mem://optimizer/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'improvement_spec', 'docs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify({ content: content.slice(0, 10000) })],
  ).catch(() => {});
}
