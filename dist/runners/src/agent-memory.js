/**
 * Agent memory read/write lifecycle for runners.
 * Reads memory at job start (by initiative/scope), writes after completion.
 * See docs/FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md and STACK_AND_DECISIONS.md.
 */
export async function readAgentMemory(client, initiativeId, scope) {
    if (!initiativeId)
        return [];
    try {
        const r = await client.query(`SELECT id, initiative_id, run_id, scope, key, value
       FROM agent_memory
       WHERE initiative_id = $1 AND scope = $2
       ORDER BY created_at DESC`, [initiativeId, scope]);
        return r.rows;
    }
    catch {
        return [];
    }
}
export async function writeAgentMemory(client, params) {
    try {
        const r = await client.query(`INSERT INTO agent_memory (initiative_id, run_id, scope, key, value)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`, [params.initiativeId, params.runId, params.scope, params.key, params.value]);
        return r.rows[0]?.id ?? null;
    }
    catch {
        return null;
    }
}
export async function readMemoryForContext(client, initiativeId, jobType) {
    const entries = await readAgentMemory(client, initiativeId, jobType);
    const memory = {};
    for (const entry of entries) {
        memory[entry.key] = entry.value;
    }
    return memory;
}
export async function writeMemoryFromResult(client, initiativeId, runId, jobType, key, value) {
    await writeAgentMemory(client, {
        initiativeId,
        runId,
        scope: jobType,
        key,
        value,
    });
}
//# sourceMappingURL=agent-memory.js.map