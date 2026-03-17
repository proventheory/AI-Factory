import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { llmCostUsd, llmProvider } from "../lib/llm-pricing.js";
import { DEFAULT_LIMIT, MAX_LIMIT } from "../lib/pagination.js";

export async function usage(req: Request, res: Response): Promise<void> {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const [byTier, byModelRows, totals, percentiles] = await Promise.all([
      pool.query(`
        SELECT model_tier, count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
               coalesce(avg(latency_ms), 0)::int AS avg_latency_ms
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier ORDER BY calls DESC
      `, [from, to]).then((r) => r.rows),
      pool.query(`
        SELECT model_tier, model_id,
               count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
        GROUP BY model_tier, model_id ORDER BY calls DESC
      `, [from, to]).then((r) => r.rows as { model_tier: string; model_id: string; calls: number; tokens_in: string; tokens_out: string }[]),
      pool.query(`
        SELECT count(*)::int AS calls,
               coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
               coalesce(sum(tokens_out), 0)::bigint AS tokens_out
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2
      `, [from, to]).then((r) => r.rows[0] ?? { calls: 0, tokens_in: 0, tokens_out: 0 }),
      pool.query(`
        SELECT
          coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p50_latency_ms,
          coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms), 0)::int AS p95_latency_ms
        FROM llm_calls WHERE created_at BETWEEN $1 AND $2 AND latency_ms IS NOT NULL
      `, [from, to]).then((r) => r.rows[0] ?? { p50_latency_ms: 0, p95_latency_ms: 0 }).catch(() => ({ p50_latency_ms: 0, p95_latency_ms: 0 })),
    ]);
    const errorCount = await pool.query(`
      SELECT count(*)::int AS c FROM job_runs
      WHERE status = 'failed' AND started_at BETWEEN $1 AND $2
    `, [from, to]).then((r) => r.rows[0]?.c ?? 0).catch(() => 0);

    let estimated_cost_usd = 0;
    const byProviderMap: Record<string, { calls: number; tokens_in: number; tokens_out: number; estimated_cost_usd: number }> = {};
    for (const row of byModelRows) {
      const tokensIn = Number(row.tokens_in) || 0;
      const tokensOut = Number(row.tokens_out) || 0;
      const cost = llmCostUsd(row.model_id, tokensIn, tokensOut);
      estimated_cost_usd += cost;
      const provider = llmProvider(row.model_id);
      if (!byProviderMap[provider]) {
        byProviderMap[provider] = { calls: 0, tokens_in: 0, tokens_out: 0, estimated_cost_usd: 0 };
      }
      byProviderMap[provider].calls += row.calls;
      byProviderMap[provider].tokens_in += tokensIn;
      byProviderMap[provider].tokens_out += tokensOut;
      byProviderMap[provider].estimated_cost_usd += cost;
    }
    const by_provider = Object.entries(byProviderMap).map(([provider, agg]) => ({
      provider,
      ...agg,
      estimated_cost_usd: Math.round(agg.estimated_cost_usd * 100) / 100,
    })).sort((a, b) => b.estimated_cost_usd - a.estimated_cost_usd);

    const by_model = byModelRows.map((row) => {
      const tokensIn = Number(row.tokens_in) || 0;
      const tokensOut = Number(row.tokens_out) || 0;
      const cost = llmCostUsd(row.model_id, tokensIn, tokensOut);
      return {
        model_tier: row.model_tier,
        model_id: row.model_id,
        provider: llmProvider(row.model_id),
        calls: row.calls,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        estimated_cost_usd: Math.round(cost * 100) / 100,
      };
    });

    const totalsWithCost = {
      ...totals,
      estimated_cost_usd: Math.round(estimated_cost_usd * 100) / 100,
    };
    res.json({
      by_tier: byTier,
      by_provider,
      by_model,
      totals: totalsWithCost,
      percentiles,
      error_count: errorCount,
      from,
      to,
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function usageByJobType(req: Request, res: Response): Promise<void> {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const r = await pool.query(`
      SELECT pn.job_type,
             count(*)::int AS calls,
             coalesce(sum(lc.tokens_in), 0)::bigint AS tokens_in,
             coalesce(sum(lc.tokens_out), 0)::bigint AS tokens_out,
             coalesce(avg(lc.latency_ms), 0)::int AS avg_latency_ms
      FROM llm_calls lc
      JOIN job_runs jr ON jr.id = lc.job_run_id
      JOIN plan_nodes pn ON pn.id = jr.plan_node_id
      WHERE lc.created_at BETWEEN $1 AND $2
      GROUP BY pn.job_type ORDER BY calls DESC
    `, [from, to]);
    res.json({ items: r.rows, from, to });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function usageByModel(req: Request, res: Response): Promise<void> {
  try {
    const from = (req.query.from as string) ?? new Date(Date.now() - 30 * 86_400_000).toISOString();
    const to = (req.query.to as string) ?? new Date().toISOString();
    const r = await pool.query(`
      SELECT model_id, model_tier,
             count(*)::int AS calls,
             coalesce(sum(tokens_in), 0)::bigint AS tokens_in,
             coalesce(sum(tokens_out), 0)::bigint AS tokens_out,
             coalesce(avg(latency_ms), 0)::int AS avg_latency_ms,
             count(*) FILTER (WHERE latency_ms > 5000)::int AS slow_calls
      FROM llm_calls WHERE created_at BETWEEN $1 AND $2
      GROUP BY model_id, model_tier ORDER BY calls DESC
    `, [from, to]);
    res.json({ items: r.rows, from, to });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function policies(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT version, created_at, rules_json FROM policies ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function adapters(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const name = req.query.name as string | undefined;
    let q = "SELECT * FROM adapters ORDER BY created_at DESC LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (name) {
      q = "SELECT * FROM adapters WHERE name = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3";
      params.unshift(name);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function capabilityGrants(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const environment = req.query.environment as string | undefined;
    const adapter_id = req.query.adapter_id as string | undefined;
    const conditions: string[] = ["1=1"];
    const params: unknown[] = [];
    let i = 1;
    if (environment) {
      conditions.push(`environment = $${i++}`);
      params.push(environment);
    }
    if (adapter_id) {
      conditions.push(`adapter_id = $${i++}`);
      params.push(adapter_id);
    }
    params.push(limit, offset);
    const q = `SELECT * FROM capability_grants WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function secretRefs(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const scope = req.query.scope as string | undefined;
    let q =
      "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs ORDER BY name LIMIT $1 OFFSET $2";
    const params: unknown[] = [limit, offset];
    if (scope) {
      q =
        "SELECT id, name, vault_path, scope, capabilities_allowed, rotated_at FROM secret_refs WHERE scope = $1 ORDER BY name LIMIT $2 OFFSET $3";
      params.unshift(scope);
    }
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function audit(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Number(req.query.offset) || 0;
    const run_id = req.query.run_id as string | undefined;
    const job_run_id = req.query.job_run_id as string | undefined;
    let items: unknown[];
    if (run_id) {
      const [re, je] = await Promise.all([
        pool.query(
          "SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events WHERE run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
          [run_id, limit, offset]
        ),
        pool.query(
          "SELECT 'job_event' AS source, je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id WHERE jr.run_id = $1 ORDER BY je.created_at DESC LIMIT $2 OFFSET $3",
          [run_id, limit, offset]
        ),
      ]);
      items = [...re.rows, ...je.rows]
        .sort((a, b) => new Date((b as { created_at: string }).created_at).getTime() - new Date((a as { created_at: string }).created_at).getTime())
        .slice(0, limit);
    } else if (job_run_id) {
      const r = await pool.query(
        "SELECT 'job_event' AS source, id::text, (SELECT run_id FROM job_runs WHERE id = $1) AS run_id, job_run_id, event_type::text, created_at, payload_json FROM job_events WHERE job_run_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
        [job_run_id, limit, offset]
      );
      items = r.rows;
    } else {
      const r = await pool.query(
        `(SELECT 'run_event' AS source, id::text, run_id, NULL::uuid AS job_run_id, event_type::text, created_at, NULL::jsonb AS payload_json FROM run_events)
         UNION ALL (SELECT 'job_event', je.id::text, jr.run_id, je.job_run_id, je.event_type::text, je.created_at, je.payload_json FROM job_events je JOIN job_runs jr ON jr.id = je.job_run_id)
         ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        [limit, offset]
      );
      items = r.rows;
    }
    res.json({ items, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
