/**
 * Schema drift: capture current DB schema (public tables/columns), compare to stored snapshot.
 * Used by GET /v1/schema_drift and automated drift alerts.
 */

import type { Pool } from "pg";

export interface TableColumn {
  table_schema: string;
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: string;
}

export interface SchemaSnapshot {
  captured_at: string;
  tables: { name: string; schema: string; columns: { name: string; data_type: string; is_nullable: string }[] }[];
}

export interface SchemaDriftResult {
  current_schema: SchemaSnapshot | null;
  stored_snapshot: SchemaSnapshot | null;
  stored_id: string | null;
  diff: {
    tables_added: string[];
    tables_removed: string[];
    columns_added: { table: string; column: string; data_type: string }[];
    columns_removed: { table: string; column: string }[];
  } | null;
  has_drift: boolean;
}

const PUBLIC = "public";

/** Fetch current schema (public tables + columns) from information_schema. */
export async function fetchCurrentSchema(pool: Pool): Promise<SchemaSnapshot> {
  const r = await pool.query<TableColumn>(
    `SELECT table_schema, table_name, column_name, data_type, is_nullable
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_catalog = current_database()
     ORDER BY table_schema, table_name, ordinal_position`,
    [PUBLIC]
  );
  const byTable = new Map<string, { schema: string; columns: { name: string; data_type: string; is_nullable: string }[] }>();
  for (const row of r.rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    if (!byTable.has(key)) {
      byTable.set(key, { schema: row.table_schema, columns: [] });
    }
    byTable.get(key)!.columns.push({
      name: row.column_name,
      data_type: row.data_type,
      is_nullable: row.is_nullable,
    });
  }
  const tables = Array.from(byTable.entries()).map(([key, v]) => {
    const [schema, name] = key.split(".");
    return { schema, name, columns: v.columns };
  });
  return {
    captured_at: new Date().toISOString(),
    tables,
  };
}

/** Get the latest stored snapshot (schema_snapshots table). Returns null if table missing or empty. */
export async function getStoredSnapshot(pool: Pool): Promise<{ id: string; snapshot: SchemaSnapshot } | null> {
  try {
    const r = await pool.query<{ id: string; snapshot: unknown }>(
      "SELECT id, snapshot FROM schema_snapshots ORDER BY created_at DESC LIMIT 1"
    );
    if (r.rows.length === 0) return null;
    return { id: r.rows[0].id, snapshot: r.rows[0].snapshot as SchemaSnapshot };
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") return null; // table does not exist
    throw e;
  }
}

/** Compare current schema to stored and return diff. */
export function diffSchema(current: SchemaSnapshot, stored: SchemaSnapshot): SchemaDriftResult["diff"] {
  const currentTables = new Set(current.tables.map((t) => `${t.schema}.${t.name}`));
  const storedTables = new Set(stored.tables.map((t) => `${t.schema}.${t.name}`));
  const tables_added = Array.from(currentTables).filter((t) => !storedTables.has(t)).sort();
  const tables_removed = Array.from(storedTables).filter((t) => !currentTables.has(t)).sort();

  const currentCols = new Map<string, Set<string>>();
  for (const t of current.tables) {
    const key = `${t.schema}.${t.name}`;
    currentCols.set(key, new Set(t.columns.map((c) => c.name)));
  }
  const storedCols = new Map<string, Map<string, { data_type: string }>>();
  for (const t of stored.tables) {
    const key = `${t.schema}.${t.name}`;
    const m = new Map<string, { data_type: string }>();
    for (const c of t.columns) m.set(c.name, { data_type: c.data_type });
    storedCols.set(key, m);
  }

  const columns_added: { table: string; column: string; data_type: string }[] = [];
  const columns_removed: { table: string; column: string }[] = [];

  for (const key of currentTables) {
    const curSet = currentCols.get(key) ?? new Set();
    const st = stored.tables.find((t) => `${t.schema}.${t.name}` === key);
    const stMap = st ? new Map(st.columns.map((c) => [c.name, c.data_type])) : new Map<string, string>();
    for (const col of curSet) {
      if (!stMap.has(col)) {
        const t = current.tables.find((x) => `${x.schema}.${x.name}` === key);
        const data_type = t?.columns.find((c) => c.name === col)?.data_type ?? "unknown";
        columns_added.push({ table: key, column: col, data_type });
      }
    }
  }
  for (const key of storedTables) {
    const st = stored.tables.find((t) => `${t.schema}.${t.name}` === key);
    if (!st) continue;
    const curSet = currentCols.get(key) ?? new Set();
    for (const c of st.columns) {
      if (!curSet.has(c.name)) columns_removed.push({ table: key, column: c.name });
    }
  }

  const hasDiff =
    tables_added.length > 0 ||
    tables_removed.length > 0 ||
    columns_added.length > 0 ||
    columns_removed.length > 0;
  if (!hasDiff) return null;

  return {
    tables_added,
    tables_removed,
    columns_added,
    columns_removed,
  };
}

/** Compute full drift result (current, stored, diff). */
export async function computeSchemaDrift(pool: Pool): Promise<SchemaDriftResult> {
  const [current, storedRow] = await Promise.all([fetchCurrentSchema(pool), getStoredSnapshot(pool)]);
  if (!storedRow) {
    return {
      current_schema: current,
      stored_snapshot: null,
      stored_id: null,
      diff: null,
      has_drift: false,
    };
  }
  const diff = diffSchema(current, storedRow.snapshot);
  return {
    current_schema: current,
    stored_snapshot: storedRow.snapshot,
    stored_id: storedRow.id,
    diff,
    has_drift: diff !== null,
  };
}

/** Store current schema as a new snapshot (e.g. after migrations or via capture endpoint). */
export async function captureSchemaSnapshot(pool: Pool, label = "baseline"): Promise<{ id: string }> {
  const snapshot = await fetchCurrentSchema(pool);
  const r = await pool.query(
    "INSERT INTO schema_snapshots (label, snapshot) VALUES ($1, $2) RETURNING id",
    [label, JSON.stringify(snapshot)]
  );
  return { id: r.rows[0].id };
}
