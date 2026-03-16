import { v4 as uuid } from "uuid";
import type { DbClient } from "./db.js";
import type { Environment, Cohort, PlanNode, PlanEdge } from "./types.js";
import { mirrorRunToGraphRun } from "./graph-run-mirror.js";

/**
 * Scheduler: creates runs, initializes node_progress, enqueues roots,
 * and advances successors when nodes complete.
 */

export interface CreateRunParams {
  planId: string;
  releaseId: string;
  policyVersion: string;
  environment: Environment;
  cohort: Cohort | null;
  rootIdempotencyKey: string;
  /** Pinned git ref/commit for this run (Plan §2.4 Invariant 3). */
  repoCommitBase?: string | null;
  routingReason?: string;
  routingRuleId?: string;
  promptTemplateVersion?: string;
  adapterContractVersion?: string;
  /** 'gateway' = use LLM_GATEWAY_URL; 'openai_direct' = use OPENAI_API_KEY on runner. Default 'gateway'. */
  llmSource?: "gateway" | "openai_direct" | null;
}

export async function createRun(db: DbClient, params: CreateRunParams): Promise<string> {
  const runId = uuid();

  const llmSource = params.llmSource === "openai_direct" ? "openai_direct" : "gateway";
  const repoCommitBase = params.repoCommitBase ?? null;
  await db.query("SAVEPOINT before_runs_insert");
  try {
    await db.query(
      `INSERT INTO runs (id, plan_id, release_id, policy_version, environment, cohort,
         status, root_idempotency_key, routed_at, routing_reason, routing_rule_id,
         prompt_template_version, adapter_contract_version, llm_source, repo_commit_base)
       VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,now(),$8,$9,$10,$11,$12,$13)`,
      [
        runId, params.planId, params.releaseId, params.policyVersion,
        params.environment, params.cohort, params.rootIdempotencyKey,
        params.routingReason ?? null, params.routingRuleId ?? null,
        params.promptTemplateVersion ?? null, params.adapterContractVersion ?? null,
        llmSource, repoCommitBase,
      ],
    );
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "42703") {
      await db.query("ROLLBACK TO SAVEPOINT before_runs_insert");
      try {
        await db.query(
          `INSERT INTO runs (id, plan_id, release_id, policy_version, environment, cohort,
             status, root_idempotency_key, routed_at, routing_reason, routing_rule_id,
             prompt_template_version, adapter_contract_version, llm_source, repo_commit_base)
           VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,now(),$8,$9,$10,$11,$12,$13)`,
          [
            runId, params.planId, params.releaseId, params.policyVersion,
            params.environment, params.cohort, params.rootIdempotencyKey,
            params.routingReason ?? null, params.routingRuleId ?? null,
            params.promptTemplateVersion ?? null, params.adapterContractVersion ?? null,
            llmSource, repoCommitBase,
          ],
        );
      } catch (err2: unknown) {
        if ((err2 as { code?: string }).code === "42703") {
          await db.query("ROLLBACK TO SAVEPOINT before_runs_insert");
          await db.query(
            `INSERT INTO runs (id, plan_id, release_id, policy_version, environment, cohort,
               status, root_idempotency_key, routed_at, routing_reason, routing_rule_id,
               prompt_template_version, adapter_contract_version)
             VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,now(),$8,$9,$10,$11)`,
            [
              runId, params.planId, params.releaseId, params.policyVersion,
              params.environment, params.cohort, params.rootIdempotencyKey,
              params.routingReason ?? null, params.routingRuleId ?? null,
              params.promptTemplateVersion ?? null, params.adapterContractVersion ?? null,
            ],
          );
        } else {
          throw err2;
        }
      }
    } else {
      throw err;
    }
  } finally {
    await db.query("RELEASE SAVEPOINT before_runs_insert").catch(() => {});
  }

  await db.query(
    `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'queued')`,
    [runId],
  );

  const nodes = await db.query<PlanNode>(
    `SELECT * FROM plan_nodes WHERE plan_id = $1`, [params.planId],
  );

  const edges = await db.query<PlanEdge>(
    `SELECT * FROM plan_edges WHERE plan_id = $1`, [params.planId],
  );

  const inDegree = new Map<string, number>();
  for (const node of nodes.rows) {
    inDegree.set(node.id, 0);
  }
  for (const edge of edges.rows) {
    inDegree.set(edge.to_node_id, (inDegree.get(edge.to_node_id) ?? 0) + 1);
  }

  let hasQueuedJob = false;
  for (const node of nodes.rows) {
    const depsTotal = inDegree.get(node.id) ?? 0;
    const isRoot = depsTotal === 0;
    const isApproval = (node as { node_type?: string }).node_type === "approval";

    await db.query(
      `INSERT INTO node_progress (id, run_id, plan_node_id, deps_total, deps_satisfied, eligible_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        uuid(), runId, node.id, depsTotal,
        isRoot ? depsTotal : 0,
        isRoot ? new Date() : null,
        isRoot ? "eligible" : "pending",
      ],
    );

    if (isRoot) {
      if (isApproval) {
        await db.query(
          `INSERT INTO approval_requests (id, run_id, plan_node_id, requested_at, requested_reason, requested_by)
           VALUES ($1, $2, $3, now(), $4, 'scheduler')
           ON CONFLICT (run_id, plan_node_id) DO NOTHING`,
          [uuid(), runId, node.id, "Approval node – awaiting human decision"],
        ).catch(() => {});
      } else {
        hasQueuedJob = true;
        const jobRunId = uuid();
        const idempotencyKey = `${runId}:${node.id}`;
        await db.query(
          `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
           VALUES ($1, $2, $3, 1, 'queued', $4)`,
          [jobRunId, runId, node.id, idempotencyKey],
        );
      }
    }
  }

  if (hasQueuedJob) {
    await db.query(`UPDATE runs SET status = 'running', started_at = COALESCE(started_at, now()) WHERE id = $1`, [runId]);
    await db.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'started')`, [runId]).catch(() => {});
    await db.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_entered')`, [runId]).catch(() => {});
  }

  // Phase 5A: mirror run to graph_run (execution layer) for observability
  mirrorRunToGraphRun(db, runId, params.planId).catch(() => {});

  // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
  if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
    const rootJobCount = nodes.rows.filter((n) => (inDegree.get(n.id) ?? 0) === 0 && (n as { node_type?: string }).node_type !== "approval").length;
    try {
      fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "control-plane/src/scheduler.ts:createRun", message: "createRun done", data: { runId, planId: params.planId, rootJobCount, nodeCount: nodes.rows.length }, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {});
    } catch { /* ignore */ }
  }
  // #endregion
  return runId;
}

/**
 * Called after a job_run succeeds: advance successor nodes.
 * Must be called under the run's scheduler lock.
 */
export async function advanceSuccessors(
  db: DbClient,
  runId: string,
  completedNodeId: string,
  winningJobRunId: string,
): Promise<void> {
  // Record completion (idempotent via ON CONFLICT DO NOTHING)
  await db.query(
    `INSERT INTO node_completions (run_id, from_node_id, job_run_id, completed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (run_id, from_node_id) DO NOTHING`,
    [runId, completedNodeId, winningJobRunId],
  );

  const successors = await db.query<{ to_node_id: string }>(
    `SELECT to_node_id FROM plan_edges
     WHERE plan_id = (SELECT plan_id FROM runs WHERE id = $1)
       AND from_node_id = $2
       AND condition = 'success'`,
    [runId, completedNodeId],
  );

  for (const { to_node_id } of successors.rows) {
    const result = await db.query<{ deps_satisfied: number; deps_total: number }>(
      `UPDATE node_progress
       SET deps_satisfied = deps_satisfied + 1,
           eligible_at = CASE WHEN deps_satisfied + 1 = deps_total THEN now() ELSE eligible_at END,
           status = CASE WHEN deps_satisfied + 1 = deps_total THEN 'eligible'::node_progress_status ELSE status END
       WHERE run_id = $1 AND plan_node_id = $2 AND status = 'pending'
       RETURNING deps_satisfied, deps_total`,
      [runId, to_node_id],
    );

    if (result.rows.length > 0 && result.rows[0].deps_satisfied === result.rows[0].deps_total) {
      const nodeTypeResult = await db.query<{ node_type: string }>(
        "SELECT node_type FROM plan_nodes WHERE id = $1",
        [to_node_id],
      );
      const isApproval = nodeTypeResult.rows[0]?.node_type === "approval";
      if (isApproval) {
        await db.query(
          `INSERT INTO approval_requests (id, run_id, plan_node_id, requested_at, requested_reason, requested_by)
           VALUES ($1, $2, $3, now(), $4, 'scheduler')
           ON CONFLICT (run_id, plan_node_id) DO NOTHING`,
          [uuid(), runId, to_node_id, "Approval node – awaiting human decision"],
        ).catch(() => {});
      } else {
        const jobRunId = uuid();
        const idempotencyKey = `${runId}:${to_node_id}`;
        await db.query(
          `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key)
           VALUES ($1, $2, $3, 1, 'queued', $4)`,
          [jobRunId, runId, to_node_id, idempotencyKey],
        );
        // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
        if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
          try {
            const nodeJob = await db.query<{ job_type: string }>("SELECT job_type FROM plan_nodes WHERE id = $1", [to_node_id]);
            fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "control-plane/src/scheduler.ts:advanceSuccessors", message: "job_run enqueued", data: { runId, to_node_id, job_type: nodeJob.rows[0]?.job_type }, timestamp: Date.now(), hypothesisId: "H2" }) }).catch(() => {});
          } catch { /* ignore */ }
        }
        // #endregion
      }
    }
  }
}

/**
 * Complete an approval node after human approved: create synthetic job_run (succeeded), node_completions, update node_progress, advance successors.
 */
export async function completeApprovalAndAdvance(
  db: DbClient,
  runId: string,
  planNodeId: string,
): Promise<void> {
  const jobRunId = uuid();
  await db.query(
    `INSERT INTO job_runs (id, run_id, plan_node_id, attempt, status, idempotency_key, started_at, ended_at)
     VALUES ($1, $2, $3, 1, 'succeeded', $4, now(), now())`,
    [jobRunId, runId, planNodeId, `approval:${runId}:${planNodeId}`],
  );
  await db.query(
    `INSERT INTO node_completions (run_id, from_node_id, job_run_id, completed_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (run_id, from_node_id) DO NOTHING`,
    [runId, planNodeId, jobRunId],
  );
  await db.query(
    `UPDATE node_progress SET status = 'succeeded' WHERE run_id = $1 AND plan_node_id = $2`,
    [runId, planNodeId],
  );
  const runUpdated = await db.query(
    `UPDATE runs SET status = 'running', started_at = COALESCE(started_at, now()) WHERE id = $1 AND status = 'queued' RETURNING id`,
    [runId],
  );
  if (runUpdated.rowCount && runUpdated.rowCount > 0) {
    await db.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'started')`, [runId]).catch(() => {});
    await db.query(`INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_entered')`, [runId]).catch(() => {});
  }
  await advanceSuccessors(db, runId, planNodeId, jobRunId);
  await checkRunCompletion(db, runId);
}

/**
 * Check if all nodes in the run have succeeded; if so, mark the run succeeded.
 */
export async function checkRunCompletion(db: DbClient, runId: string): Promise<boolean> {
  const result = await db.query<{ total: string; succeeded: string }>(
    `SELECT
       count(*) as total,
       count(*) FILTER (WHERE status = 'succeeded') as succeeded
     FROM node_progress WHERE run_id = $1`,
    [runId],
  );

  const { total, succeeded } = result.rows[0];
  if (total === succeeded && Number(total) > 0) {
    await db.query(
      `UPDATE runs SET status = 'succeeded', ended_at = now() WHERE id = $1 AND status = 'running'`,
      [runId],
    );
    await db.query(
      `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_exited')`,
      [runId],
    ).catch(() => {});
    await db.query(
      `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'succeeded')`,
      [runId],
    );
    return true;
  }
  return false;
}

/**
 * When a job fails, mark the run as failed if there are no more queued or running
 * job_runs for this run. So the run status stops being "running" and pollers (e.g.
 * the email wizard) see "failed" instead of timing out.
 */
export async function markRunFailedIfNoPendingJobs(db: DbClient, runId: string): Promise<void> {
  const pending = await db.query<{ c: string }>(
    `SELECT count(*)::text AS c FROM job_runs WHERE run_id = $1 AND status IN ('queued', 'running')`,
    [runId],
  );
  if (Number(pending.rows[0]?.c ?? 0) > 0) return;
  await db.query(
    `UPDATE runs SET status = 'failed', ended_at = now() WHERE id = $1 AND status = 'running'`,
    [runId],
  );
  await db.query(
    `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'stage_exited')`,
    [runId],
  ).catch(() => {});
  await db.query(
    `INSERT INTO run_events (run_id, event_type) VALUES ($1, 'failed')`,
    [runId],
  ).catch(() => {});
}

/**
 * Acquire the scheduler lock for a run (prevents duplicate schedulers).
 */
export async function acquireRunLock(
  db: DbClient,
  runId: string,
  lockDurationMs: number = 60_000,
): Promise<string | null> {
  const token = uuid();
  const expiresAt = new Date(Date.now() + lockDurationMs);

  const result = await db.query(
    `UPDATE runs
     SET scheduler_lock_token = $2, scheduler_lock_expires_at = $3
     WHERE id = $1
       AND (scheduler_lock_token IS NULL OR scheduler_lock_expires_at < now())
     RETURNING id`,
    [runId, token, expiresAt],
  );

  return result.rows.length > 0 ? token : null;
}

export async function releaseRunLock(
  db: DbClient,
  runId: string,
  token: string,
): Promise<void> {
  await db.query(
    `UPDATE runs
     SET scheduler_lock_token = NULL, scheduler_lock_expires_at = NULL
     WHERE id = $1 AND scheduler_lock_token = $2`,
    [runId, token],
  );
}
