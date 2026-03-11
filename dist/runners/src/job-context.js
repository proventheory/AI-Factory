/**
 * Build job context for a claimed job: plan_node (agent_role), predecessor artifacts, run metadata.
 * See docs/TODO_MULTI_FRAMEWORK_PLAN.md — Runner: job context includes agent_role and artifacts.
 */
/**
 * Get predecessor plan_node ids for this run/node from plan_edges and node_completions.
 */
async function getPredecessorPlanNodeIds(client, runId, planNodeId) {
    const planResult = await client.query("SELECT plan_id FROM runs WHERE id = $1", [runId]);
    if (planResult.rows.length === 0)
        return [];
    const planId = planResult.rows[0].plan_id;
    const edgesResult = await client.query("SELECT from_node_id FROM plan_edges WHERE plan_id = $1 AND to_node_id = $2", [planId, planNodeId]);
    const fromIds = edgesResult.rows.map((r) => r.from_node_id);
    const completedResult = await client.query("SELECT from_node_id FROM node_completions WHERE run_id = $1", [runId]);
    const completedSet = new Set(completedResult.rows.map((r) => r.from_node_id));
    return fromIds.filter((id) => completedSet.has(id));
}
/**
 * Load artifacts for the given run and producer plan_node ids.
 */
async function loadPredecessorArtifacts(client, runId, producerPlanNodeIds) {
    if (producerPlanNodeIds.length === 0)
        return [];
    const r = await client
        .query(`SELECT id, run_id, producer_plan_node_id, artifact_type, uri
       FROM artifacts
       WHERE run_id = $1 AND producer_plan_node_id = ANY($2::uuid[])`, [runId, producerPlanNodeIds])
        .catch(() => ({ rows: [] }));
    return r.rows ?? [];
}
/**
 * Build full job context for a claimed job run.
 */
export async function getJobContext(client, jobRun) {
    let runResult;
    try {
        runResult = await client.query("SELECT id, plan_id, workspace_path, human_feedback, llm_source FROM runs WHERE id = $1", [jobRun.run_id]);
    }
    catch {
        try {
            runResult = await client.query("SELECT id, plan_id, workspace_path, human_feedback FROM runs WHERE id = $1", [jobRun.run_id]);
        }
        catch {
            runResult = await client.query("SELECT id, plan_id FROM runs WHERE id = $1", [jobRun.run_id]);
        }
    }
    if (runResult.rows.length === 0)
        return null;
    const run = runResult.rows[0];
    const planId = run.plan_id;
    const llm_source = run.llm_source === "openai_direct" ? "openai_direct" : "gateway";
    let nodeResult;
    try {
        nodeResult = await client.query("SELECT id, plan_id, node_key, job_type, agent_role FROM plan_nodes WHERE id = $1", [jobRun.plan_node_id]);
    }
    catch {
        nodeResult = await client.query("SELECT id, plan_id, node_key, job_type FROM plan_nodes WHERE id = $1", [jobRun.plan_node_id]);
    }
    if (nodeResult.rows.length === 0)
        return null;
    const node = nodeResult.rows[0];
    const initiativeIdResult = await client.query("SELECT initiative_id FROM plans WHERE id = $1", [planId]);
    const initiative_id = initiativeIdResult.rows[0]?.initiative_id ?? null;
    const predecessorIds = await getPredecessorPlanNodeIds(client, jobRun.run_id, jobRun.plan_node_id);
    const predecessorArtifacts = await loadPredecessorArtifacts(client, jobRun.run_id, predecessorIds);
    const predecessorArtifactIds = predecessorArtifacts.map((a) => a.id);
    let goal_metadata = null;
    if (initiative_id) {
        try {
            const metaResult = await client.query("SELECT goal_metadata FROM initiatives WHERE id = $1", [initiative_id]);
            const row = metaResult.rows[0];
            if (row?.goal_metadata != null && typeof row.goal_metadata === "object" && !Array.isArray(row.goal_metadata)) {
                goal_metadata = row.goal_metadata;
            }
        }
        catch {
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
        workspace_path: run.workspace_path ?? null,
        human_feedback: run.human_feedback ?? null,
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
export async function recordArtifactConsumption(client, runId, jobRunId, planNodeId, artifactIds, role = "input") {
    if (artifactIds.length === 0)
        return;
    for (const artifactId of artifactIds) {
        try {
            await client.query(`INSERT INTO artifact_consumption (id, artifact_id, run_id, job_run_id, plan_node_id, role)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)
         ON CONFLICT (artifact_id, job_run_id) DO NOTHING`, [artifactId, runId, jobRunId, planNodeId, role]);
        }
        catch {
            // artifact_consumption table may not exist yet (migration not applied)
        }
    }
}
//# sourceMappingURL=job-context.js.map