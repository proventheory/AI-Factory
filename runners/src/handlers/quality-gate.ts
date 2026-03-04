/**
 * Quality Gate handler: runs quality dimensions for the current phase.
 * Registered as job_type "quality_gate".
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { runQualityGate } from "../validators/quality-gate.js";

export async function handleQualityGate(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const phase = context.config?.phase as string ?? context.job_type ?? "codegen";
  const result = await runQualityGate(client, context, params, phase);

  const reportContent = JSON.stringify({
    phase,
    allPassed: result.allPassed,
    results: result.results,
  }, null, 2);

  const uri = `mem://quality_gate/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'quality_report', 'docs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify({ content: reportContent.slice(0, 10000) })],
  ).catch(() => {});

  if (!result.allPassed) {
    throw new Error(`Quality gate failed for phase '${phase}': ${result.results.filter(r => !r.passed).map(r => r.dimensionId).join(", ")}`);
  }
}
