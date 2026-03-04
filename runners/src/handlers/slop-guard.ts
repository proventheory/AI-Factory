/**
 * Slop Guard handler: runs L0/L1 slop detection on predecessor artifacts.
 * Registered as job_type "slop_guard".
 */
import type pg from "pg";
import type { JobContext } from "../job-context.js";
import { runSlopGuard } from "../validators/slop-guard.js";

export async function handleSlopGuard(
  client: pg.PoolClient,
  context: JobContext,
  params: { runId: string; jobRunId: string; planNodeId: string },
): Promise<void> {
  const artifacts = context.predecessor_artifacts ?? [];
  const failures: string[] = [];

  for (const artifact of artifacts) {
    const content = (artifact as any).metadata_json?.content ?? artifact.uri ?? "";
    const artifactType = artifact.artifact_type ?? "code";

    const result = await runSlopGuard(client, content, artifactType, params.runId, params.jobRunId);

    if (!result.passed) {
      failures.push(`${artifact.artifact_type} (${artifact.id ?? "?"}): ${result.details}`);
    }
  }

  const reportContent = JSON.stringify({
    checked: artifacts.length,
    failures: failures.length,
    details: failures,
  }, null, 2);

  const uri = `mem://slop_guard/${context.run_id}/${context.plan_node_id}`;
  await client.query(
    `INSERT INTO artifacts (id, run_id, job_run_id, producer_plan_node_id, artifact_type, artifact_class, uri, metadata_json)
     VALUES (gen_random_uuid(), $1, $2, $3, 'slop_report', 'docs', $4, $5::jsonb)`,
    [params.runId, params.jobRunId, params.planNodeId, uri, JSON.stringify({ content: reportContent.slice(0, 10000) })],
  ).catch(() => {});

  if (failures.length > 0) {
    throw new Error(`Slop guard failed on ${failures.length} artifact(s): ${failures[0]}`);
  }
}
