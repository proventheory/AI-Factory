import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { computeDrift } from "../../release-manager.js";
import { handleDbMissingTable } from "../middleware/error-handler.js";

export async function dashboard(req: Request, res: Response): Promise<void> {
  try {
    const env = (req.query.environment as string) ?? "sandbox";
    const [staleLeases, queueDepth, workers] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`
      ).then((r) => r.rows[0]?.c ?? 0),
      pool.query(
        `SELECT count(*)::int AS c FROM job_runs jr JOIN runs r ON r.id = jr.run_id WHERE r.environment = $1 AND r.started_at > now() - interval '1 hour' AND jr.status IN ('queued','running')`,
        [env]
      ).then((r) => r.rows[0]?.c ?? 0),
      pool.query(`SELECT count(*)::int AS c FROM worker_registry WHERE last_heartbeat_at > now() - interval '5 minutes'`).then((r) => r.rows[0]?.c ?? 0),
    ]);
    res.json({ stale_leases: staleLeases, queue_depth: queueDepth, workers_alive: workers });
  } catch (e) {
    if (handleDbMissingTable(e, res)) return;
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function search(req: Request, res: Response): Promise<void> {
  try {
    const q = String(req.query.q ?? "").trim();
    const environment = (req.query.environment as string) || null;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    if (!q || q.length < 2) {
      res.json({ items: [], limit: 0 });
      return;
    }
    const pattern = `%${q.replace(/%/g, "\\%")}%`;

    const [initiatives, runs, jobRuns, artifacts, toolCalls, releases] = await Promise.all([
      pool.query(
        `SELECT id, title, intent_type, created_at FROM initiatives WHERE (title ILIKE $1 OR intent_type::text ILIKE $1) ORDER BY created_at DESC LIMIT $2`,
        [pattern, limit],
      ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "initiative", id: row.id, title: row.title, intent_type: row.intent_type, created_at: row.created_at, status: null, environment: null }))),
      environment
        ? pool.query(
            `SELECT r.id, r.status, r.environment, r.created_at FROM runs r WHERE (r.id::text ILIKE $1 OR r.root_idempotency_key ILIKE $1) AND r.environment = $2 ORDER BY r.created_at DESC LIMIT $3`,
            [pattern, environment, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "run", id: row.id, status: row.status, environment: row.environment, created_at: row.created_at, title: null, intent_type: null })))
        : pool.query(
            `SELECT r.id, r.status, r.environment, r.created_at FROM runs r WHERE (r.id::text ILIKE $1 OR r.root_idempotency_key ILIKE $1) ORDER BY r.created_at DESC LIMIT $2`,
            [pattern, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "run", id: row.id, status: row.status, environment: row.environment, created_at: row.created_at, title: null, intent_type: null }))),
      environment
        ? pool.query(
            `SELECT jr.id, jr.run_id, jr.error_signature, r.environment, r.created_at FROM job_runs jr JOIN runs r ON r.id = jr.run_id WHERE jr.error_signature ILIKE $1 AND r.environment = $2 ORDER BY jr.ended_at DESC NULLS LAST LIMIT $3`,
            [pattern, environment, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "job_run", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.error_signature, intent_type: null })))
        : pool.query(
            `SELECT jr.id, jr.run_id, jr.error_signature, r.environment, r.created_at FROM job_runs jr JOIN runs r ON r.id = jr.run_id WHERE jr.error_signature ILIKE $1 ORDER BY jr.ended_at DESC NULLS LAST LIMIT $2`,
            [pattern, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "job_run", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.error_signature, intent_type: null }))),
      environment
        ? pool.query(
            `SELECT a.id, a.run_id, a.artifact_type, a.uri, r.environment, a.created_at FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE (a.uri ILIKE $1 OR a.artifact_type ILIKE $1) AND r.environment = $2 ORDER BY a.created_at DESC LIMIT $3`,
            [pattern, environment, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "artifact", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.uri, intent_type: row.artifact_type })))
        : pool.query(
            `SELECT a.id, a.run_id, a.artifact_type, a.uri, r.environment, a.created_at FROM artifacts a JOIN runs r ON r.id = a.run_id WHERE (a.uri ILIKE $1 OR a.artifact_type ILIKE $1) ORDER BY a.created_at DESC LIMIT $2`,
            [pattern, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "artifact", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.uri, intent_type: row.artifact_type }))),
      environment
        ? pool.query(
            `SELECT tc.id, tc.operation_key, tc.idempotency_key, jr.run_id, r.environment, tc.started_at AS created_at FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id JOIN runs r ON r.id = jr.run_id WHERE (tc.operation_key ILIKE $1 OR tc.idempotency_key ILIKE $1) AND r.environment = $2 ORDER BY tc.started_at DESC NULLS LAST LIMIT $3`,
            [pattern, environment, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "tool_call", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.operation_key, intent_type: row.idempotency_key })))
        : pool.query(
            `SELECT tc.id, tc.operation_key, tc.idempotency_key, jr.run_id, r.environment, tc.started_at AS created_at FROM tool_calls tc JOIN job_runs jr ON jr.id = tc.job_run_id JOIN runs r ON r.id = jr.run_id WHERE (tc.operation_key ILIKE $1 OR tc.idempotency_key ILIKE $1) ORDER BY tc.started_at DESC NULLS LAST LIMIT $2`,
            [pattern, limit],
          ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "tool_call", id: row.id, run_id: row.run_id, status: null, environment: row.environment, created_at: row.created_at, title: row.operation_key, intent_type: row.idempotency_key }))),
      pool.query(
        `SELECT id, status, created_at FROM releases WHERE id::text ILIKE $1 OR status::text ILIKE $1 ORDER BY created_at DESC LIMIT $2`,
        [pattern, limit],
      ).then((r) => r.rows.map((row: Record<string, unknown>) => ({ object_type: "release", id: row.id, status: row.status, environment: null, created_at: row.created_at, title: null, intent_type: null }))),
    ]);

    const combined = [
      ...initiatives,
      ...runs,
      ...jobRuns,
      ...artifacts,
      ...toolCalls,
      ...releases,
    ].sort((a, b) => new Date((b as { created_at: string }).created_at).getTime() - new Date((a as { created_at: string }).created_at).getTime()).slice(0, limit);
    res.json({ items: combined, limit: combined.length });
  } catch (e) {
    if (handleDbMissingTable(e, res)) return;
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function systemState(req: Request, res: Response): Promise<void> {
  try {
    if (process.env.SYSTEM_PAUSED === "1" || process.env.SYSTEM_PAUSED === "true") {
      res.json({ state: "Paused", canary_percent: 0, stale_leases: 0, workers_alive: 0 });
      return;
    }
    const env = (req.query.environment as string) ?? "staging";
    const [staleLeases, drift, workers] = await Promise.all([
      pool.query(`SELECT count(*)::int AS c FROM job_claims WHERE released_at IS NULL AND heartbeat_at < now() - interval '2 minutes'`).then((r) => r.rows[0]?.c ?? 0),
      computeDrift(pool, env as "sandbox" | "staging" | "prod", 60).catch(() => ({ shouldRollback: false })),
      pool.query(`SELECT count(*)::int AS c FROM worker_registry WHERE last_heartbeat_at > now() - interval '5 minutes'`).then((r) => r.rows[0]?.c ?? 0),
    ]);
    const driftFail = (drift as { shouldRollback?: boolean }).shouldRollback === true;
    const noWorkers = (workers as number) === 0;
    const state =
      driftFail || (staleLeases as number) > 0
        ? "Degraded"
        : env === "prod" && noWorkers
          ? "Degraded"
          : "Healthy";
    const canaryPercent = await pool.query(
      `SELECT COALESCE(rel.percent_rollout, 0)::int AS pct FROM release_routes rr JOIN releases rel ON rel.id = rr.release_id WHERE rr.environment = $1 AND rr.cohort = 'canary' AND (rr.active_to IS NULL OR rr.active_to > now()) ORDER BY rr.active_from DESC NULLS LAST LIMIT 1`,
      [env],
    ).then((r) => r.rows[0]?.pct ?? 0);
    res.json({ state, canary_percent: canaryPercent, stale_leases: staleLeases, workers_alive: workers });
  } catch (e) {
    if (handleDbMissingTable(e, res)) return;
    res.status(500).json({ state: "Degraded", canary_percent: 0, error: String((e as Error).message) });
  }
}

export async function dashboardDrift(req: Request, res: Response): Promise<void> {
  try {
    const environment = (req.query.environment as string) ?? "staging";
    const windowMinutes = Math.min(Math.max(Number(req.query.window_minutes) || 60, 5), 10080);
    const drift = await computeDrift(pool, environment as "sandbox" | "staging" | "prod", windowMinutes);
    res.json({
      environment,
      window_minutes: windowMinutes,
      canary_success_rate: drift.canarySuccessRate,
      control_success_rate: drift.controlSuccessRate,
      success_rate_delta: drift.successRateDelta,
      canary_new_signatures: drift.canaryNewSignatures,
      should_rollback: drift.shouldRollback,
      drift_pass: !drift.shouldRollback,
    });
  } catch (e) {
    if (handleDbMissingTable(e, res)) return;
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function renderStatus(_req: Request, res: Response): Promise<void> {
  try {
    const apiKey = process.env.RENDER_API_KEY;
    if (!apiKey) {
      res.json({ services: [], message: "RENDER_API_KEY not set." });
      return;
    }
    const {
      getStagingServiceIds,
      getRenderService,
      listRenderDeploysWithMeta,
    } = await import("../../render-worker-remediate.js");
    const stagingIds = await getStagingServiceIds();
    const prodId = process.env.RENDER_PROD_API_SERVICE_ID?.trim();
    const serviceIds = [...new Set([...stagingIds, ...(prodId ? [prodId] : [])])].filter(Boolean);
    const services: {
      id: string;
      name: string;
      slug?: string;
      dashboardUrl: string;
      environment: "staging" | "prod";
      latestDeploy: { id: string; status: string; commit?: string; updatedAt?: string } | null;
    }[] = [];
    for (const id of serviceIds) {
      const svc = await getRenderService(apiKey, id).catch(() => null);
      const name = svc?.name ?? id;
      const slug = svc?.slug;
      const dashboardUrl = `https://dashboard.render.com/web/${id}`;
      const environment = prodId && id === prodId ? "prod" : "staging";
      let latestDeploy: { id: string; status: string; commit?: string; updatedAt?: string } | null = null;
      try {
        const deploys = await listRenderDeploysWithMeta(apiKey, id, 1);
        if (deploys[0]) {
          latestDeploy = {
            id: deploys[0].id,
            status: deploys[0].status,
            commit: deploys[0].commit,
            updatedAt: deploys[0].updatedAt,
          };
        }
      } catch {
        // leave latestDeploy null on error
      }
      services.push({ id, name, slug, dashboardUrl, environment, latestDeploy });
    }
    res.json({ services });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function analytics(req: Request, res: Response): Promise<void> {
  try {
    const from =
      (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const HOURS = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];

    const [heatmapRows, byJobType, byModel, artifactRows] = await Promise.all([
      pool
        .query(
          `SELECT extract(dow from started_at)::int AS dow, extract(hour from started_at)::int AS hour, count(*)::int AS c
         FROM runs WHERE started_at IS NOT NULL AND started_at BETWEEN $1 AND $2
         GROUP BY 1, 2 ORDER BY 1, 2`,
          [from, to]
        )
        .then((r) => r.rows as { dow: number; hour: number; c: number }[]),
      pool
        .query(
          `
        SELECT pn.job_type, lc.model_tier,
               count(*)::int AS calls,
               (coalesce(sum(lc.tokens_in), 0) + coalesce(sum(lc.tokens_out), 0))::bigint AS tokens
        FROM llm_calls lc
        JOIN job_runs jr ON jr.id = lc.job_run_id
        JOIN plan_nodes pn ON pn.id = jr.plan_node_id
        WHERE lc.created_at BETWEEN $1 AND $2
        GROUP BY pn.job_type, lc.model_tier ORDER BY calls DESC
      `,
          [from, to]
        )
        .then(
          (r) =>
            r.rows as {
              job_type: string;
              model_tier: string;
              calls: number;
              tokens: number;
            }[]
        ),
      pool
        .query(
          `
        SELECT model_tier, model_id, count(*)::int AS calls,
               (coalesce(sum(tokens_in), 0) + coalesce(sum(tokens_out), 0))::bigint AS tokens
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier, model_id ORDER BY calls DESC
      `,
          [from, to]
        )
        .then(
          (r) =>
            r.rows as {
              model_tier: string;
              model_id: string;
              calls: number;
              tokens: number;
            }[]
        ),
      pool
        .query(
          `SELECT artifact_type, count(*)::int AS c FROM artifacts WHERE created_at BETWEEN $1 AND $2 GROUP BY artifact_type ORDER BY c DESC`,
          [from, to]
        )
        .then((r) => r.rows as { artifact_type: string; c: number }[]),
    ]);

    const heatmapByKey: Record<string, Record<number, number>> = {};
    DAYS.forEach((d) => {
      heatmapByKey[d] = {};
      for (let h = 0; h < 24; h += 2) heatmapByKey[d][h] = 0;
    });
    for (const row of heatmapRows) {
      const day = DAYS[row.dow];
      const hourBucket = row.hour - (row.hour % 2);
      if (day != null && hourBucket >= 0 && hourBucket < 24) {
        (heatmapByKey[day] ??= {})[hourBucket] =
          (heatmapByKey[day][hourBucket] ?? 0) + row.c;
      }
    }
    const run_activity_heatmap = DAYS.map((day) => ({
      id: day,
      data: HOURS.map((h, i) => ({ x: h, y: heatmapByKey[day]?.[i * 2] ?? 0 })),
    }));

    const tierToJob: Record<string, Record<string, number>> = {};
    for (const row of byJobType) {
      const tier = row.model_tier || "default";
      if (!tierToJob[tier]) tierToJob[tier] = {};
      tierToJob[tier][row.job_type] =
        (tierToJob[tier][row.job_type] || 0) + Number(row.tokens);
    }
    const cost_treemap = {
      name: "Costs",
      children: Object.entries(tierToJob)
        .map(([tier, jobs]) => ({
          name: tier,
          children: Object.entries(jobs).map(([job, value]) => ({
            name: job,
            value: Math.max(1, Number(value)),
          })),
        }))
        .filter((t) => t.children.length > 0),
    };
    if (cost_treemap.children.length === 0) {
      cost_treemap.children = [
        { name: "No LLM usage", children: [{ name: "—", value: 1 }] },
      ];
    }

    const artifact_breakdown = {
      name: "Artifacts",
      children: artifactRows.length
        ? artifactRows.map((row) => ({
            name: row.artifact_type || "unknown",
            value: row.c,
          }))
        : [{ name: "No artifacts", value: 1 }],
    };

    res.json({
      run_activity_heatmap,
      cost_treemap,
      artifact_breakdown,
      from,
      to,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
