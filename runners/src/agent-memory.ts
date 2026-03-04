/**
 * Agent memory read/write lifecycle for runners.
 * Reads memory at job start (by initiative/scope), writes after completion.
 * See docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md and STACK_AND_DECISIONS.md.
 */

import type pg from "pg";

export interface AgentMemoryEntry {
  id: string;
  initiative_id: string | null;
  run_id: string | null;
  scope: string;
  key: string;
  value: string;
}

export async function readAgentMemory(
  client: pg.PoolClient,
  initiativeId: string | null,
  scope: string,
): Promise<AgentMemoryEntry[]> {
  if (!initiativeId) return [];
  try {
    const r = await client.query<AgentMemoryEntry>(
      `SELECT id, initiative_id, run_id, scope, key, value
       FROM agent_memory
       WHERE initiative_id = $1 AND scope = $2
       ORDER BY created_at DESC`,
      [initiativeId, scope]
    );
    return r.rows;
  } catch {
    return [];
  }
}

export async function writeAgentMemory(
  client: pg.PoolClient,
  params: {
    initiativeId: string | null;
    runId: string | null;
    scope: string;
    key: string;
    value: string;
  },
): Promise<string | null> {
  try {
    const r = await client.query<{ id: string }>(
      `INSERT INTO agent_memory (initiative_id, run_id, scope, key, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [params.initiativeId, params.runId, params.scope, params.key, params.value]
    );
    return r.rows[0]?.id ?? null;
  } catch {
    return null;
  }
}

export async function readMemoryForContext(
  client: pg.PoolClient,
  initiativeId: string | null,
  jobType: string,
): Promise<Record<string, string>> {
  const entries = await readAgentMemory(client, initiativeId, jobType);
  const memory: Record<string, string> = {};
  for (const entry of entries) {
    memory[entry.key] = entry.value;
  }
  return memory;
}

export async function writeMemoryFromResult(
  client: pg.PoolClient,
  initiativeId: string | null,
  runId: string,
  jobType: string,
  key: string,
  value: string,
): Promise<void> {
  await writeAgentMemory(client, {
    initiativeId,
    runId,
    scope: jobType,
    key,
    value,
  });
}
