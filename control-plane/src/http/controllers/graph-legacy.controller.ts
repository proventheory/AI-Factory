import type { Request, Response } from "express";
import { pool, withTransaction } from "../../db.js";
import { createRun } from "../../scheduler.js";
import { lookupBySignature as incidentLookup } from "../../incident-memory.js";

export async function graphTopology(req: Request, res: Response): Promise<void> {
  try {
    const planId = String(req.params.planId ?? "");
    const [nodesRows, edgesRows] = await Promise.all([
      pool.query(
        "SELECT id, node_key, job_type, node_type FROM plan_nodes WHERE plan_id = $1 ORDER BY node_key",
        [planId]
      ),
      pool.query("SELECT from_node_id, to_node_id, condition FROM plan_edges WHERE plan_id = $1", [
        planId,
      ]),
    ]);
    const nodes = nodesRows.rows.map(
      (n: { id: string; node_key: string; job_type: string; node_type: string }) => ({
        id: n.id,
        node_key: n.node_key,
        job_type: n.job_type,
        node_type: n.node_type,
      })
    );
    const edges = edgesRows.rows.map(
      (e: { from_node_id: string; to_node_id: string; condition: string }) => ({
        from_node_id: e.from_node_id,
        to_node_id: e.to_node_id,
        condition: e.condition,
      })
    );
    res.json({ plan_id: planId, nodes, edges });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphFrontier(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.runId ?? "");
    const run = await pool
      .query("SELECT plan_id FROM runs WHERE id = $1", [runId])
      .then((r) => r.rows[0]);
    if (!run) {
      res.status(404).json({
        error: "Run not found",
        run_id: runId,
        completed_node_ids: [],
        pending_node_ids: [],
      });
      return;
    }
    const planId = (run as { plan_id: string }).plan_id;
    const nodeProgress = await pool.query(
      "SELECT plan_node_id, status FROM node_progress WHERE run_id = $1",
      [runId]
    );
    const completed_node_ids: string[] = [];
    const pending_node_ids: string[] = [];
    for (const row of nodeProgress.rows as { plan_node_id: string; status: string }[]) {
      if (
        row.status === "succeeded" ||
        row.status === "failed" ||
        row.status === "skipped"
      ) {
        completed_node_ids.push(row.plan_node_id);
      } else {
        pending_node_ids.push(row.plan_node_id);
      }
    }
    if (completed_node_ids.length === 0 && pending_node_ids.length === 0) {
      const allNodes = await pool.query("SELECT id FROM plan_nodes WHERE plan_id = $1", [
        planId,
      ]);
      pending_node_ids.push(
        ...(allNodes.rows as { id: string }[]).map((n) => n.id)
      );
    }
    res.json({
      run_id: runId,
      plan_id: planId,
      completed_node_ids,
      pending_node_ids,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphRepairPlan(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.runId ?? "");
    const nodeId = String(req.params.nodeId ?? "");
    const jobRun = await pool
      .query(
        "SELECT id, error_signature, status FROM job_runs WHERE run_id = $1 AND plan_node_id = $2 ORDER BY attempt DESC LIMIT 1",
        [runId, nodeId]
      )
      .then(
        (r) =>
          r.rows[0] as
            | { id: string; error_signature: string | null; status: string }
            | undefined
      );
    let suggested_actions: { action_id: string; label: string; description: string | null }[] =
      [];
    const subgraph_replay_scope: string[] = [];
    if (jobRun?.error_signature) {
      const similar = await incidentLookup(
        pool,
        jobRun.error_signature ?? "",
        null,
        5
      );
      suggested_actions = (
        similar as { memory_id?: string; resolution?: string; failure_signature?: string }[]
      ).map((s, i) => ({
        action_id: `incident_${i}`,
        label: s.resolution
          ? (s.resolution as string).slice(0, 200)
          : "Apply resolution from incident memory",
        description: s.failure_signature ?? null,
      }));
    }
    res.json({
      run_id: runId,
      node_id: nodeId,
      suggested_actions,
      subgraph_replay_scope,
      error_signature: jobRun?.error_signature ?? null,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphSubgraphReplay(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { run_id?: string; node_ids?: string[] };
    const runId = body?.run_id;
    if (!runId) {
      res.status(400).json({ error: "run_id required" });
      return;
    }
    let r = await pool
      .query(
        "SELECT plan_id, release_id, policy_version, environment, cohort, llm_source FROM runs WHERE id = $1",
        [runId]
      )
      .catch(() => null);
    if (!r || r.rows.length === 0) {
      r = await pool.query(
        "SELECT plan_id, release_id, policy_version, environment, cohort FROM runs WHERE id = $1",
        [runId]
      );
      if (r.rows.length === 0) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
    }
    const row = r.rows[0] as {
      plan_id: string;
      release_id: string;
      policy_version: string | null;
      environment: string;
      cohort: string | null;
      llm_source?: string;
    };
    const llmSource =
      row.llm_source === "openai_direct" ? ("openai_direct" as const) : ("gateway" as const);
    const newRunId = await withTransaction(async (client) => {
      return createRun(client, {
        planId: row.plan_id,
        releaseId: row.release_id,
        policyVersion: row.policy_version ?? "latest",
        environment: row.environment as "sandbox" | "staging" | "prod",
        cohort: row.cohort as "canary" | "control" | null,
        rootIdempotencyKey: `subgraph_replay:${runId}:${Date.now()}`,
        llmSource,
      });
    });
    res.json({
      run_id: newRunId,
      replayed: 1,
      message: "New run created from same plan (full replay).",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphAudit(req: Request, res: Response): Promise<void> {
  try {
    const runId = String(req.params.runId ?? "");
    const run = await pool
      .query("SELECT id, status, plan_id FROM runs WHERE id = $1", [runId])
      .then((r) => r.rows[0]);
    if (!run) {
      res.status(404).json({
        error: "Run not found",
        run_id: runId,
        issues: [],
        summary: null,
      });
      return;
    }
    const jobRuns = await pool.query(
      "SELECT jr.id, jr.plan_node_id, jr.status, jr.error_signature, pn.node_key FROM job_runs jr JOIN plan_nodes pn ON pn.id = jr.plan_node_id WHERE jr.run_id = $1 ORDER BY jr.attempt DESC",
      [runId]
    );
    const byNode = new Map<
      string,
      { status: string; error_signature: string | null; node_key: string }
    >();
    for (const j of jobRuns.rows as {
      plan_node_id: string;
      status: string;
      error_signature: string | null;
      node_key: string;
    }[]) {
      if (!byNode.has(j.plan_node_id)) {
        byNode.set(j.plan_node_id, {
          status: j.status,
          error_signature: j.error_signature,
          node_key: j.node_key,
        });
      }
    }
    const issues = Array.from(byNode.entries())
      .filter(([, v]) => v.status === "failed")
      .map(([plan_node_id, v]) => ({
        plan_node_id,
        node_key: v.node_key,
        error_signature: v.error_signature,
      }));
    const summary = {
      run_id: runId,
      run_status: (run as { status: string }).status,
      total_nodes: byNode.size,
      failed: issues.length,
      succeeded: Array.from(byNode.values()).filter(
        (v) => v.status === "succeeded"
      ).length,
    };
    res.json({ run_id: runId, issues, summary });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphMissingCapabilities(req: Request, res: Response): Promise<void> {
  try {
    const planId = String(req.params.planId ?? "");
    const nodeRows = await pool.query(
      "SELECT DISTINCT job_type FROM plan_nodes WHERE plan_id = $1",
      [planId]
    );
    const jobTypes = (nodeRows.rows as { job_type: string }[]).map((r) => r.job_type);
    let missing: string[] = [];
    try {
      const opRows = await pool.query("SELECT DISTINCT key FROM operators");
      const known = new Set((opRows.rows as { key: string }[]).map((r) => r.key));
      missing = jobTypes.filter((jt) => !known.has(jt));
    } catch {
      missing = jobTypes;
    }
    res.json({ plan_id: planId, job_types: jobTypes, missing });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function graphLineage(req: Request, res: Response): Promise<void> {
  try {
    const artifactId = String(req.params.artifactId ?? "");
    let artifactRow: {
      id: string;
      run_id: string;
      producer_plan_node_id: string | null;
      artifact_type: string;
      derived_from_artifact_id?: string | null;
      scope_type?: string | null;
      scope_id?: string | null;
    } | undefined;
    try {
      artifactRow = await pool
        .query(
          "SELECT id, run_id, producer_plan_node_id, artifact_type, derived_from_artifact_id, scope_type, scope_id FROM artifacts WHERE id = $1",
          [artifactId]
        )
        .then((r) => r.rows[0] as typeof artifactRow);
    } catch (colErr: unknown) {
      if ((colErr as { code?: string }).code === "42703") {
        artifactRow = await pool
          .query(
            "SELECT id, run_id, producer_plan_node_id, artifact_type FROM artifacts WHERE id = $1",
            [artifactId]
          )
          .then((r) => r.rows[0] as typeof artifactRow);
      } else throw colErr;
    }
    if (!artifactRow) {
      res.status(404).json({
        error: "Artifact not found",
        artifact_id: artifactId,
        producers: [],
        consumers: [],
      });
      return;
    }
    const producers: unknown[] = [];
    if (artifactRow.producer_plan_node_id) {
      const producerNode = await pool
        .query(
          "SELECT pn.id AS plan_node_id, pn.node_key, pn.job_type, p.run_id FROM plan_nodes pn JOIN plans p ON p.id = pn.plan_id WHERE pn.id = $1",
          [artifactRow.producer_plan_node_id]
        )
        .then((r) => r.rows[0]);
      if (producerNode) {
        producers.push({
          plan_node_id: producerNode.plan_node_id,
          run_id: producerNode.run_id,
          node_key: producerNode.node_key,
          artifact_type: artifactRow.artifact_type,
          role: "producer",
        });
      }
    }
    let consumers: unknown[] = [];
    try {
      const consumerRows = await pool.query(
        `SELECT ac.job_run_id, ac.plan_node_id, ac.run_id, pn.node_key
         FROM artifact_consumption ac
         JOIN plan_nodes pn ON pn.id = ac.plan_node_id
         WHERE ac.artifact_id = $1`,
        [artifactId]
      );
      consumers = consumerRows.rows.map((r) => ({
        job_run_id: r.job_run_id,
        plan_node_id: r.plan_node_id,
        run_id: r.run_id,
        node_key: r.node_key,
        role: "consumer",
      }));
    } catch {
      // artifact_consumption table may not exist
    }
    let derived_from: { artifact_id: string } | null = null;
    if (artifactRow.derived_from_artifact_id) {
      derived_from = { artifact_id: artifactRow.derived_from_artifact_id };
    }
    const scope =
      artifactRow.scope_type && artifactRow.scope_id
        ? { scope_type: artifactRow.scope_type, scope_id: artifactRow.scope_id }
        : null;
    const part_of_project =
      scope?.scope_type === "project" ? { project_id: scope.scope_id } : null;
    let referenced_by: { page_ref: string; ref_type: string }[] = [];
    try {
      const refRows = await pool.query(
        "SELECT page_ref, ref_type FROM artifact_page_references WHERE artifact_id = $1",
        [artifactId]
      );
      referenced_by = (
        refRows.rows as { page_ref: string; ref_type: string }[]
      ).map((r) => ({ page_ref: r.page_ref, ref_type: r.ref_type }));
    } catch {
      // artifact_page_references may not exist
    }
    res.json({
      artifact_id: artifactId,
      producers,
      consumers,
      declared_producer: producers[0] ?? null,
      observed_consumers: consumers,
      derived_from,
      scope,
      part_of_project: part_of_project ?? null,
      referenced_by,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
