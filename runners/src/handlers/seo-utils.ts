/**
 * Shared helpers for SEO handlers: load artifact metadata, resolve node keys.
 */
import type pg from "pg";

export async function loadArtifactMetadata(
  client: pg.PoolClient,
  artifactId: string,
): Promise<Record<string, unknown> | null> {
  const r = await client.query<{ metadata_json: unknown }>(
    "SELECT metadata_json FROM artifacts WHERE id = $1",
    [artifactId],
  );
  const row = r.rows[0];
  const meta = row?.metadata_json;
  if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return null;
}

export async function loadArtifactMetadataBatch(
  client: pg.PoolClient,
  artifactIds: string[],
): Promise<Map<string, Record<string, unknown>>> {
  if (artifactIds.length === 0) return new Map();
  const r = await client.query<{ id: string; metadata_json: unknown }>(
    "SELECT id, metadata_json FROM artifacts WHERE id = ANY($1::uuid[])",
    [artifactIds],
  );
  const map = new Map<string, Record<string, unknown>>();
  for (const row of r.rows) {
    const meta = row.metadata_json;
    if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
      map.set(row.id, meta as Record<string, unknown>);
    }
  }
  return map;
}

export async function getNodeKeysForPlanNodes(
  client: pg.PoolClient,
  planNodeIds: string[],
): Promise<Map<string, string>> {
  if (planNodeIds.length === 0) return new Map();
  const r = await client.query<{ id: string; node_key: string }>(
    "SELECT id::text, node_key FROM plan_nodes WHERE id = ANY($1::uuid[])",
    [planNodeIds],
  );
  const map = new Map<string, string>();
  for (const row of r.rows) {
    map.set(row.id, row.node_key);
  }
  return map;
}

/** Find a record in inventory by normalized_url or path. */
export function findRecordByUrl(
  records: Array<{ normalized_url?: string; url?: string; path?: string }>,
  url: string,
  path?: string | null,
): typeof records[0] | undefined {
  const norm = (u: string) => u.replace(/\/$/, "");
  for (const r of records) {
    if (r.normalized_url && norm(r.normalized_url) === norm(url)) return r;
    if (r.url && norm(r.url) === norm(url)) return r;
    if (path && r.path && (r.path === path || norm(r.path) === norm(path))) return r;
  }
  return undefined;
}
