/**
 * Evolution Loop V1 API: /v1/evolution/*
 */

import { Router } from "express";
import { pool } from "../db.js";
import { listEvolutionTargets } from "./target-registry.js";
import {
  createMutationProposal,
  getMutationProposal,
  listMutationProposals,
  updateMutationProposalStatus,
} from "./mutation-manager.js";
import {
  createExperimentRun,
  getExperimentRun,
  listExperimentRuns,
} from "./experiment-orchestrator.js";
import {
  evaluateAndRecordPromotion,
  recordPromotionDecision,
} from "./promotion-gate.js";
import type { PromotionDecision } from "./types.js";

const router = Router();

/** GET /v1/evolution/targets — list active evolution targets (optional ?domain=) */
router.get("/targets", async (req, res) => {
  try {
    const domain = (req.query.domain as string) || undefined;
    const targets = await listEvolutionTargets(pool, domain);
    res.json({ targets });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/evolution/mutations — create mutation proposal */
router.post("/mutations", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const proposal = await createMutationProposal(pool, {
      domain: body.domain as string,
      target_type: body.target_type as string,
      target_id: body.target_id as string,
      mutation_kind: body.mutation_kind as string,
      patch: (body.patch as Record<string, unknown>) ?? {},
      baseline_snapshot: body.baseline_snapshot as Record<string, unknown> | undefined,
      hypothesis: (body.hypothesis as string) ?? null,
      proposed_by: (body.proposed_by as string) || "api",
      source_run_id: (body.source_run_id as string) ?? null,
      source_job_run_id: (body.source_job_run_id as string) ?? null,
      source_event_id: body.source_event_id != null ? Number(body.source_event_id) : null,
      dedupe_key: (body.dedupe_key as string) ?? null,
      rationale: (body.rationale as Record<string, unknown>) ?? undefined,
      tags: Array.isArray(body.tags) ? body.tags : undefined,
    });
    res.status(201).json(proposal);
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/evolution/mutations — list mutation proposals */
router.get("/mutations", async (req, res) => {
  try {
    const domain = req.query.domain as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const list = await listMutationProposals(pool, {
      domain,
      status: status as import("./types.js").MutationProposalStatus | undefined,
      limit,
      offset,
    });
    res.json({ mutations: list });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/evolution/mutations/:id */
router.get("/mutations/:id", async (req, res) => {
  try {
    const proposal = await getMutationProposal(pool, req.params.id);
    if (!proposal) {
      res.status(404).json({ error: "Mutation proposal not found" });
      return;
    }
    res.json(proposal);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** PATCH /v1/evolution/mutations/:id — update status (e.g. approved_for_test) */
router.patch("/mutations/:id", async (req, res) => {
  try {
    const body = req.body as { status?: string };
    const status = body.status as import("./types.js").MutationProposalStatus | undefined;
    if (!status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const ok = await updateMutationProposalStatus(pool, req.params.id, status);
    if (!ok) {
      res.status(404).json({ error: "Mutation proposal not found" });
      return;
    }
    const proposal = await getMutationProposal(pool, req.params.id);
    res.json(proposal);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/evolution/experiments — create experiment run (queued for runner) */
router.post("/experiments", async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>;
    const exp = await createExperimentRun(pool, {
      mutation_proposal_id: body.mutation_proposal_id as string,
      domain: body.domain as string,
      baseline_ref: (body.baseline_ref as Record<string, unknown>) ?? {},
      candidate_ref: (body.candidate_ref as Record<string, unknown>) ?? {},
      traffic_strategy: (body.traffic_strategy as import("./types.js").TrafficStrategy) || "replay",
      traffic_percent: body.traffic_percent != null ? Number(body.traffic_percent) : null,
      sample_size: body.sample_size != null ? Number(body.sample_size) : null,
      cohort_key: (body.cohort_key as string) ?? null,
      cohort_filters: (body.cohort_filters as Record<string, unknown>) ?? undefined,
    });
    res.status(201).json(exp);
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/evolution/experiments */
router.get("/experiments", async (req, res) => {
  try {
    const mutation_proposal_id = req.query.mutation_proposal_id as string | undefined;
    const domain = req.query.domain as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const offset = req.query.offset != null ? Number(req.query.offset) : undefined;
    const list = await listExperimentRuns(pool, {
      mutation_proposal_id,
      domain,
      status,
      limit,
      offset,
    });
    res.json({ experiments: list });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/evolution/experiments/:id */
router.get("/experiments/:id", async (req, res) => {
  try {
    const exp = await getExperimentRun(pool, req.params.id);
    if (!exp) {
      res.status(404).json({ error: "Experiment run not found" });
      return;
    }
    res.json(exp);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

/** POST /v1/evolution/experiments/:id/decide — record promotion decision (auto-evaluate or override) */
router.post("/experiments/:id/decide", async (req, res) => {
  try {
    const body = req.body as {
      decided_by?: string;
      decision?: PromotionDecision;
      reason?: Record<string, unknown>;
      score_delta?: number;
      baseline_regression?: boolean;
      metric_summary?: Record<string, number>;
    };
    const decidedBy = (body.decided_by as string) || "api";
    const exp = await getExperimentRun(pool, req.params.id);
    if (!exp) {
      res.status(404).json({ error: "Experiment run not found" });
      return;
    }
    let decisionRow;
    if (body.decision != null) {
      decisionRow = await recordPromotionDecision(pool, {
        mutation_proposal_id: exp.mutation_proposal_id,
        experiment_run_id: exp.id,
        decision: body.decision,
        decided_by: decidedBy,
        reason: body.reason,
        promoted_ref: body.decision === "promote" ? (body.metric_summary ?? null) : null,
      });
    } else {
      decisionRow = await evaluateAndRecordPromotion(pool, req.params.id, decidedBy, {
        mutation_proposal_id: exp.mutation_proposal_id,
        experiment_run_id: exp.id,
        score_delta: body.score_delta ?? 0,
        baseline_regression: body.baseline_regression ?? false,
        metric_summary: body.metric_summary ?? {},
      });
    }
    res.status(201).json(decisionRow);
  } catch (e) {
    res.status(400).json({ error: String((e as Error).message) });
  }
});

/** GET /v1/evolution/scoreboard — experiment score summary (view v_experiment_score_summary) */
router.get("/scoreboard", async (req, res) => {
  try {
    const domain = req.query.domain as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const conditions = domain ? "WHERE e.domain = $1" : "";
    const params = domain ? [domain, limit] : [limit];
    const r = await pool.query(
      `SELECT e.id AS experiment_run_id, e.mutation_proposal_id, e.domain, e.cohort_key,
              e.status, e.outcome, e.created_at, e.started_at, e.ended_at,
              count(fs.id)::int AS metric_count,
              coalesce(sum(
                CASE
                  WHEN fs.metric_direction = 'higher_is_better' THEN fs.metric_value * fs.weight
                  WHEN fs.metric_direction = 'lower_is_better' THEN (-1 * fs.metric_value) * fs.weight
                  ELSE 0
                END
              ), 0)::numeric AS weighted_score_proxy
       FROM experiment_runs e
       LEFT JOIN fitness_scores fs ON fs.experiment_run_id = e.id
       ${conditions}
       GROUP BY e.id, e.mutation_proposal_id, e.domain, e.cohort_key, e.status, e.outcome, e.created_at, e.started_at, e.ended_at
       ORDER BY e.created_at DESC
       LIMIT $${domain ? 2 : 1}`,
      params
    );
    res.json({ scoreboard: r.rows });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
});

export default router;
