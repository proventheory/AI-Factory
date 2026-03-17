import type { Request, Response } from "express";
import { pool } from "../../db.js";

export async function schemaDriftGet(_req: Request, res: Response): Promise<void> {
  try {
    const { computeSchemaDrift } = await import("../../schema-drift.js");
    const result = await computeSchemaDrift(pool);
    res.json(result);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({
        current_schema: null,
        stored_snapshot: null,
        stored_id: null,
        diff: null,
        has_drift: false,
        message:
          "schema_snapshots table not found; run migration 20250331000013_schema_snapshots.sql.",
      });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function schemaDriftCapture(req: Request, res: Response): Promise<void> {
  try {
    const { captureSchemaSnapshot } = await import("../../schema-drift.js");
    const label = (req.body as { label?: string })?.label ?? "manual";
    const { id } = await captureSchemaSnapshot(pool, label);
    res.status(201).json({ id, message: "Schema snapshot captured." });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(501).json({
        error: "Run migration 20250331000013_schema_snapshots.sql first.",
      });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function contractBreakageScan(req: Request, res: Response): Promise<void> {
  try {
    const scopeKey = (req.query.scope_key as string) || null;
    let q = `SELECT pn.id AS plan_node_id, pn.plan_id, pn.node_key, pn.job_type, pn.input_schema_ref, pn.output_schema_ref
       FROM plan_nodes pn WHERE (pn.input_schema_ref IS NOT NULL OR pn.output_schema_ref IS NOT NULL)`;
    const params: unknown[] = [];
    if (scopeKey) {
      q +=
        " AND pn.plan_id IN (SELECT id FROM plans WHERE initiative_id IN (SELECT id FROM initiatives WHERE intent_type = $1))";
      params.push(scopeKey);
    }
    q += " ORDER BY pn.plan_id, pn.node_key";
    const r = await pool.query(q, params);
    res.json({
      scope_key: scopeKey,
      contracts: r.rows,
      message: "Plan nodes with schema refs; review after schema changes.",
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({
        scope_key: null,
        contracts: [],
        message: "Plan nodes table not present.",
      });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function schemaContractsGet(_req: Request, res: Response): Promise<void> {
  try {
    let artifact_types: { key: string }[] = [];
    let operators: { key: string; priority: number | null }[] = [];
    try {
      const at = await pool.query("SELECT key FROM artifact_types ORDER BY key");
      artifact_types = at.rows as { key: string }[];
      const op = await pool.query(
        "SELECT key, priority FROM operators ORDER BY priority NULLS LAST, key"
      );
      operators = op.rows as { key: string; priority: number | null }[];
    } catch {
      // capability graph tables may not exist
    }
    res.json({
      artifact_types: artifact_types.map((r) => r.key),
      operators: operators.map((r) => ({ key: r.key, priority: r.priority })),
      message:
        artifact_types.length || operators.length
          ? "From capability graph (artifact_types, operators)."
          : "Capability graph not seeded; run migration 20250331000011_capability_graph.sql.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function migrationGuardPost(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { sql?: string; migration_ref?: string };
    const sql = (body?.sql ?? body?.migration_ref ?? "") as string;
    const tablesTouched: string[] = [];
    const risks: { kind: string; detail: string }[] = [];
    const createMatch = sql.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.")?(\w+)(?:"\s*)?\s*\(/gi
    );
    for (const m of createMatch) tablesTouched.push(m[1]);
    const alterMatch = sql.matchAll(/ALTER\s+TABLE\s+(?:[\w.]+\.")?(\w+)(?:"\s*)?\s+/gi);
    for (const m of alterMatch) tablesTouched.push(m[1]);
    const dropMatch = sql.matchAll(
      /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:[\w.]+\.")?(\w+)/gi
    );
    for (const m of dropMatch) {
      tablesTouched.push(m[1]);
      risks.push({ kind: "drop_table", detail: `DROP TABLE ${m[1]}` });
    }
    if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(sql)) {
      risks.push({
        kind: "drop_without_if_exists",
        detail: "DROP TABLE without IF EXISTS",
      });
    }
    const uniqueTables = [...new Set(tablesTouched)];
    res.json({
      tables_touched: uniqueTables,
      columns: [],
      risks,
      checkpoint_suggestion:
        uniqueTables.length > 0 ? "Create a checkpoint before applying." : null,
      raw: sql.slice(0, 2000),
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
