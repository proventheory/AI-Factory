/**
 * Build job context for a claimed job: plan_node (agent_role), predecessor artifacts, run metadata.
 * See docs/TODO_MULTI_FRAMEWORK_PLAN.md — Runner: job context includes agent_role and artifacts.
 */

import type pg from "pg";

export interface PredecessorArtifact {
  id: string;
  run_id: string;
  producer_plan_node_id: string;
  artifact_type: string;
  uri: string;
}

export interface JobContext {
  run_id: string;
  initiative_id: string | null;
  plan_node_id: string;
  node_key: string;
  job_type: string;
  agent_role: string | null;
  workspace_path: string | null;
  human_feedback: string | null;
  predecessor_artifact_ids: string[];
  predecessor_artifacts: PredecessorArtifact[];
  /** 'gateway' = use LLM_GATEWAY_URL; 'openai_direct' = use OPENAI_API_KEY. Default 'gateway'. */
  llm_source: "gateway" | "openai_direct";
  /** Optional phase/config for quality gate and other handlers. */
  config?: { phase?: string };
  /** Initiative goal_metadata (e.g. for seo_migration_audit: source_url, target_url, crawl options). */
  goal_metadata?: Record<string, unknown> | null;
}

/**
 * Get predecessor plan_node ids for this run/node from plan_edges and node_completions.
 */
async function getPredecessorPlanNodeIds(
  client: pg.PoolClient,
  runId: string,
  planNodeId: string
): Promise<string[]> {
  const planResult = await client.query(
    "SELECT plan_id FROM runs WHERE id = $1",
    [runId]
  );
  if (planResult.rows.length === 0) return [];
  const planId = planResult.rows[0].plan_id as string;

  const edgesResult = await client.query<{ from_node_id: string }>(
    "SELECT from_node_id FROM plan_edges WHERE plan_id = $1 AND to_node_id = $2",
    [planId, planNodeId]
  );
  const fromIds = edgesResult.rows.map((r) => r.from_node_id);

  const completedResult = await client.query<{ from_node_id: string }>(
    "SELECT from_node_id FROM node_completions WHERE run_id = $1",
    [runId]
  );
  const completedSet = new Set(completedResult.rows.map((r) => r.from_node_id));
  return fromIds.filter((id) => completedSet.has(id));
}

/**
 * Load artifacts for the given run and producer plan_node ids.
 */
async function loadPredecessorArtifacts(
  client: pg.PoolClient,
  runId: string,
  producerPlanNodeIds: string[]
): Promise<PredecessorArtifact[]> {
  if (producerPlanNodeIds.length === 0) return [];
  const r = await client
    .query<PredecessorArtifact>(
      `SELECT id, run_id, producer_plan_node_id, artifact_type, uri
       FROM artifacts
       WHERE run_id = $1 AND producer_plan_node_id = ANY($2::uuid[])`,
      [runId, producerPlanNodeIds]
    )
    .catch(() => ({ rows: [] as PredecessorArtifact[] }));
  return r.rows ?? [];
}

/**
 * Build full job context for a claimed job run.
 */
export async function getJobContext(
  client: pg.PoolClient,
  jobRun: { id: string; run_id: string; plan_node_id: string }
): Promise<JobContext | null> {
  let runResult: { rows: Array<Record<string, unknown>> };
  try {
    runResult = await client.query(
      "SELECT id, plan_id, workspace_path, human_feedback, llm_source FROM runs WHERE id = $1",
      [jobRun.run_id]
    );
  } catch {
    try {
      runResult = await client.query(
        "SELECT id, plan_id, workspace_path, human_feedback FROM runs WHERE id = $1",
        [jobRun.run_id]
      );
    } catch {
      runResult = await client.query(
        "SELECT id, plan_id FROM runs WHERE id = $1",
        [jobRun.run_id]
      );
    }
  }
  if (runResult.rows.length === 0) return null;
  const run = runResult.rows[0];
  const planId = run.plan_id as string;
  const llm_source = (run as { llm_source?: string }).llm_source === "openai_direct" ? "openai_direct" : "gateway";

  let nodeResult: { rows: Array<Record<string, unknown>> };
  try {
    nodeResult = await client.query(
      "SELECT id, plan_id, node_key, job_type, agent_role FROM plan_nodes WHERE id = $1",
      [jobRun.plan_node_id]
    );
  } catch {
    nodeResult = await client.query(
      "SELECT id, plan_id, node_key, job_type FROM plan_nodes WHERE id = $1",
      [jobRun.plan_node_id]
    );
  }
  if (nodeResult.rows.length === 0) return null;
  const node = nodeResult.rows[0] as { node_key: string; job_type: string; agent_role?: string | null };

  const initiativeIdResult = await client.query(
    "SELECT initiative_id FROM plans WHERE id = $1",
    [planId]
  );
  const initiative_id = initiativeIdResult.rows[0]?.initiative_id as string | null ?? null;

  const predecessorIds = await getPredecessorPlanNodeIds(client, jobRun.run_id, jobRun.plan_node_id);
  const predecessorArtifacts = await loadPredecessorArtifacts(client, jobRun.run_id, predecessorIds);
  const predecessorArtifactIds = predecessorArtifacts.map((a) => a.id);

  let goal_metadata: Record<string, unknown> | null = null;
  if (initiative_id) {
    try {
      const metaResult = await client.query<{ goal_metadata: unknown }>(
        "SELECT goal_metadata FROM initiatives WHERE id = $1",
        [initiative_id]
      );
      const row = metaResult.rows[0];
      if (row?.goal_metadata != null && typeof row.goal_metadata === "object" && !Array.isArray(row.goal_metadata)) {
        goal_metadata = row.goal_metadata as Record<string, unknown>;
      }
    } catch {
      // initiatives may not have goal_metadata column in older migrations
    }
  }

  return {
    run_id: jobRun.run_id,
    initiative_id,
    plan_node_id: jobRun.plan_node_id,
    node_key: node.node_key,
    job_type: node.job_type,
    agent_role: node.agent_role ?? null,
    workspace_path: (run as { workspace_path?: string | null }).workspace_path ?? null,
    human_feedback: (run as { human_feedback?: string | null }).human_feedback ?? null,
    predecessor_artifact_ids: predecessorArtifactIds,
    predecessor_artifacts: predecessorArtifacts,
    llm_source,
    goal_metadata: goal_metadata ?? undefined,
  };
}

/**
 * Record artifact consumption for graph lineage (V1 self-heal).
 * Call after a job run succeeds; inserts into artifact_consumption for each artifact used as input.
 * Table may not exist in older DBs — safe to no-op on error.
 */
export async function recordArtifactConsumption(
  client: pg.PoolClient,
  runId: string,
  jobRunId: string,
  planNodeId: string,
  artifactIds: string[],
  role: string = "input"
): Promise<void> {
  if (artifactIds.length === 0) return;
  for (const artifactId of artifactIds) {
    try {
      await client.query(
        `INSERT INTO artifact_consumption (id, artifact_id, run_id, job_run_id, plan_node_id, role)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT (artifact_id, job_run_id) DO NOTHING`,
        [artifactId, runId, jobRunId, planNodeId, role]
      );
    } catch {
      // artifact_consumption table may not exist yet (migration not applied)
    }
  }
}
