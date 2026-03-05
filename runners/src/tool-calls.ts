import { createHash } from "node:crypto";
import { v4 as uuid } from "uuid";
import type pg from "pg";
import type { Adapter } from "../../adapters/src/adapter-interface.js";

/**
 * Tool-call framework (Sections 5.8, 5A, 6, 12C.10).
 *
 * Enforces:
 * - Stable idempotency keys (no attempt in key)
 * - request_hash safety (same key must match hash or reject)
 * - Dedupe on (adapter_id, idempotency_key) unique constraint
 * - Capability/policy gating before execution
 */

export interface ToolCallParams {
  jobRunId: string;
  runId: string;
  planNodeId: string;
  adapterId: string;
  adapterName: string;
  capability: string;
  operationKey: string;
  request: Record<string, unknown>;
}

export function computeIdempotencyKey(
  runId: string,
  planNodeId: string,
  adapterName: string,
  capability: string,
  operationKey: string,
): string {
  const input = `${runId}:${planNodeId}:${adapterName}:${capability}:${operationKey}`;
  return createHash("sha256").update(input).digest("hex");
}

export function computeRequestHash(request: Record<string, unknown>): string {
  const sorted = JSON.stringify(request, Object.keys(request).sort());
  return createHash("sha256").update(sorted).digest("hex");
}

/**
 * Check capability_grants before executing a tool call.
 */
async function checkCapabilityGrant(
  client: pg.PoolClient,
  environment: string,
  releaseId: string,
  adapterId: string,
  capability: string,
): Promise<{ allowed: boolean; requiresApproval: boolean }> {
  const result = await client.query<{ requires_approval: boolean }>(
    `SELECT requires_approval FROM capability_grants
     WHERE environment = $1
       AND adapter_id = $2
       AND capability = $3
       AND (release_id IS NULL OR release_id = $4)
     LIMIT 1`,
    [environment, adapterId, capability, releaseId],
  );

  if (result.rows.length === 0) {
    return { allowed: false, requiresApproval: false };
  }

  return { allowed: true, requiresApproval: result.rows[0].requires_approval };
}

/**
 * Execute a tool call with full idempotency + dedupe.
 * Returns the tool_call id.
 */
export async function executeToolCall(
  client: pg.PoolClient,
  params: ToolCallParams,
  adapter: Adapter,
  environment: string,
  releaseId: string,
): Promise<string> {
  const idempotencyKey = computeIdempotencyKey(
    params.runId, params.planNodeId,
    params.adapterName, params.capability, params.operationKey,
  );
  const requestHash = computeRequestHash(params.request);

  // Capability gate
  const grant = await checkCapabilityGrant(
    client, environment, releaseId, params.adapterId, params.capability,
  );

  if (!grant.allowed) {
    const toolCallId = uuid();
    await client.query(
      `INSERT INTO tool_calls (id, job_run_id, adapter_id, capability, operation_key,
         idempotency_key, request_hash, status, started_at, ended_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'failed',now(),now())`,
      [toolCallId, params.jobRunId, params.adapterId, params.capability,
       params.operationKey, idempotencyKey, requestHash],
    );
    throw new Error(`Capability not granted: ${params.capability} on adapter ${params.adapterName}`);
  }

  // Idempotent insert — dedupe on (adapter_id, idempotency_key)
  const toolCallId = uuid();
  try {
    await client.query(
      `INSERT INTO tool_calls (id, job_run_id, adapter_id, capability, operation_key,
         idempotency_key, request_hash, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')`,
      [toolCallId, params.jobRunId, params.adapterId, params.capability,
       params.operationKey, idempotencyKey, requestHash],
    );
  } catch (err: unknown) {
    if ((err as { code?: string }).code === "23505") {
      // Unique violation — check existing row
      const existing = await client.query<{
        id: string;
        request_hash: string | null;
        status: string;
        response_artifact_id: string | null;
      }>(
        `SELECT id, request_hash, status, response_artifact_id FROM tool_calls
         WHERE adapter_id = $1 AND idempotency_key = $2`,
        [params.adapterId, idempotencyKey],
      );

      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        if (row.request_hash && row.request_hash !== requestHash) {
          throw new Error(
            `Request hash mismatch for idempotency_key ${idempotencyKey}: ` +
            `existing=${row.request_hash}, new=${requestHash}`,
          );
        }
        if (row.status === "succeeded") {
          return row.id; // Reuse existing successful call
        }
      }
    }
    throw err;
  }

  // Execute via adapter
  await client.query(
    `UPDATE tool_calls SET status = 'running', started_at = now() WHERE id = $1`,
    [toolCallId],
  );

  try {
    const validationResult = await adapter.validate(params.request);
    if (!validationResult.valid) {
      throw new Error(`Validation failed: ${validationResult.errors?.join(", ")}`);
    }

    const response = await adapter.execute(params.request);

    const verifyResult = await adapter.verify(response);
    if (!verifyResult.verified) {
      throw new Error(`Verification failed: ${verifyResult.reason}`);
    }

    // Store response artifact. Use minimal columns (no producer_plan_node_id) so INSERT never aborts the transaction.
    const artifactId = uuid();
    await client.query(
      `INSERT INTO artifacts (id, run_id, job_run_id, artifact_type, artifact_class, uri, sha256, metadata_json)
       VALUES ($1, $2, $3, $4, 'external_object_refs', $5, $6, $7)`,
      [artifactId, params.runId, params.jobRunId, `${params.adapterName}_response`,
       response.uri ?? `mem://${toolCallId}`, response.sha256 ?? null, JSON.stringify(response.data)],
    );

    await client.query(
      `UPDATE tool_calls SET status = 'succeeded', response_artifact_id = $2, ended_at = now()
       WHERE id = $1`,
      [toolCallId, artifactId],
    );

    // Create rollback target if side-effectful
    if (response.rollbackPointer) {
      await client.query(
        `INSERT INTO rollback_targets (id, artifact_id, run_id, rollback_strategy, rollback_pointer)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [artifactId, params.runId, response.rollbackStrategy ?? "revert",
         JSON.stringify(response.rollbackPointer)],
      );
    }

    return toolCallId;
  } catch (err) {
    await client.query(
      `UPDATE tool_calls SET status = 'failed', ended_at = now() WHERE id = $1`,
      [toolCallId],
    );
    throw err;
  }
}
