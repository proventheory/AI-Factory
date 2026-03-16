/**
 * Capability resolver: answer "which operator can produce artifact type X?"
 * Ranking (deterministic): (1) exact produces match, (2) conjunctive consumes match if provided,
 * (3) operator priority ascending (lower int = higher priority; null = lowest), (4) lexical tie-break on operator key.
 * See plan: Graphs, Artifact Hygiene, Capability Graph, and Self-Heal Loop.
 */

import type { PoolClient } from "pg";

export interface ResolveOptions {
  produces: string;
  consumes?: string[];
}

export interface ResolveResult {
  operators: string[];
}

/**
 * Resolve operators that produce the given artifact type and optionally consume all of the given types.
 * Returns operator keys in deterministic order per ranking policy.
 */
export async function resolveOperators(
  client: PoolClient,
  options: ResolveOptions
): Promise<ResolveResult> {
  const { produces, consumes = [] } = options;
  const atKeys = [produces, ...consumes].filter(Boolean);
  if (atKeys.length === 0) {
    return { operators: [] };
  }

  // Find artifact_type ids for produces and consumes
  const atRows = await client.query(
    "SELECT id, key FROM artifact_types WHERE key = ANY($1::text[])",
    [atKeys]
  );
  const atByKey = new Map(atRows.rows.map((r: { id: string; key: string }) => [r.key, r.id]));
  const producesAtId = atByKey.get(produces);
  if (!producesAtId) {
    return { operators: [] };
  }

  // Operators that produce this artifact type
  const producesRows = await client.query(
    `SELECT o.id, o.key, o.priority
     FROM operators o
     JOIN operator_produces_artifact_type opat ON opat.operator_id = o.id
     WHERE opat.artifact_type_id = $1`,
    [producesAtId]
  );

  if (producesRows.rows.length === 0) {
    return { operators: [] };
  }

  let candidateKeys: { key: string; priority: number | null }[] = producesRows.rows.map(
    (r: { id: string; key: string; priority: number | null }) => ({
      key: r.key,
      priority: r.priority,
    })
  );

  if (consumes.length > 0) {
    const consumeAtIds = consumes.map((k) => atByKey.get(k)).filter(Boolean) as string[];
    if (consumeAtIds.length !== consumes.length) {
      return { operators: [] };
    }
    const mustConsumeAllRows = await client.query(
      `SELECT operator_id
       FROM operator_consumes_artifact_type
       WHERE artifact_type_id = ANY($1::uuid[])
       GROUP BY operator_id
       HAVING COUNT(*) = $2`,
      [consumeAtIds, consumeAtIds.length]
    );
    const operatorIdsThatConsumeAll = new Set(
      mustConsumeAllRows.rows.map((r: { operator_id: string }) => r.operator_id)
    );
    candidateKeys = candidateKeys.filter((c) => {
      const opId = producesRows.rows.find((r: { key: string }) => r.key === c.key)?.id;
      return opId && operatorIdsThatConsumeAll.has(opId);
    });
  }

  // Deterministic sort: (1) priority ASC (null last), (2) key ASC
  candidateKeys.sort((a, b) => {
    const pa = a.priority ?? 999_999;
    const pb = b.priority ?? 999_999;
    if (pa !== pb) return pa - pb;
    return a.key.localeCompare(b.key);
  });

  return {
    operators: candidateKeys.map((c) => c.key),
  };
}
