import type { Request, Response } from "express";
import { pool } from "../../db.js";

export async function changeEventsList(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const r = await pool.query(
      "SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at FROM change_events ORDER BY created_at DESC LIMIT $1 OFFSET $2",
      [limit, offset]
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ items: [], limit: 50, offset: 0 });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function changeEventsCreate(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      source_type?: string;
      source_ref?: string;
      change_class?: string;
      summary?: string;
      diff_artifact_id?: string;
    };
    if (!body?.source_type || !body?.change_class) {
      res.status(400).json({ error: "source_type and change_class required" });
      return;
    }
    const r = await pool.query(
      "INSERT INTO change_events (source_type, source_ref, change_class, summary, diff_artifact_id) VALUES ($1, $2, $3, $4, $5) RETURNING change_event_id",
      [
        body.source_type,
        body.source_ref ?? null,
        body.change_class,
        body.summary ?? null,
        body.diff_artifact_id ?? null,
      ]
    );
    res.status(201).json({ change_event_id: r.rows[0].change_event_id });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function changeEventsGetById(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "SELECT change_event_id, source_type, source_ref, change_class, summary, diff_artifact_id, created_at FROM change_events WHERE change_event_id = $1",
      [id]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Change event not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function changeEventsImpacts(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const r = await pool.query(
      "SELECT impact_id, change_event_id, run_id, plan_id, plan_node_id, artifact_id, impact_type, reason, created_at FROM graph_impacts WHERE change_event_id = $1 ORDER BY impact_type, plan_node_id",
      [id]
    );
    res.json({ items: r.rows });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ items: [] });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function changeEventsImpactPost(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    res.json({ change_event_id: id, impacts: [] });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function changeEventsBackfillPlan(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const ev = await pool.query(
      "SELECT change_event_id, source_type, change_class, summary FROM change_events WHERE change_event_id = $1",
      [id]
    );
    if (ev.rows.length === 0) {
      res.status(404).json({ error: "Change event not found" });
      return;
    }
    const event = ev.rows[0] as { source_type: string; change_class: string; summary: string | null };
    const steps: { action: string; detail: string }[] = [];
    if (event.source_type === "migration" || event.change_class === "schema") {
      steps.push({
        action: "review_schema",
        detail: "Run GET /v1/migration_audit and compare to pre-migration snapshot.",
      });
      steps.push({
        action: "backfill_if_not_null",
        detail:
          "If migration added NOT NULL columns without default, backfill existing rows before deploy.",
      });
    }
    let impacts: { rows: unknown[] } = { rows: [] };
    try {
      impacts = await pool.query(
        "SELECT plan_id, plan_node_id, impact_type, reason FROM graph_impacts WHERE change_event_id = $1 LIMIT 50",
        [id]
      );
    } catch {
      // ignore
    }
    if (impacts.rows.length > 0) {
      steps.push({
        action: "revalidate_affected",
        detail: `Re-run or validate ${impacts.rows.length} affected plan node(s) after backfill.`,
      });
    }
    res.json({ change_event_id: id, steps, summary: event.summary });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(404).json({ error: "Change event not found" });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function importGraphGet(req: Request, res: Response): Promise<void> {
  try {
    const serviceId = req.query.service_id as string;
    if (!serviceId) {
      res.status(400).json({ error: "service_id required" });
      return;
    }
    const r = await pool.query(
      "SELECT snapshot_id, service_id, snapshot_json, created_at FROM import_graph_snapshots WHERE service_id = $1 ORDER BY created_at DESC LIMIT 1",
      [serviceId]
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "No import graph for this service" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(404).json({ error: "Import graph not available" });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function importGraphPost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { service_id?: string; snapshot_json?: unknown };
    if (!body?.service_id || body?.snapshot_json === undefined) {
      res.status(400).json({ error: "service_id and snapshot_json required" });
      return;
    }
    const r = await pool.query(
      "INSERT INTO import_graph_snapshots (service_id, snapshot_json) VALUES ($1, $2) RETURNING snapshot_id, service_id, created_at",
      [body.service_id, JSON.stringify(body.snapshot_json)]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(501).json({
        error: "Run migration 20250315000000_graph_self_heal_tables.sql first",
      });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}
