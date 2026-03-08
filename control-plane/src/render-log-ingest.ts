/**
 * Log mirror: ingest Render runner (and optionally API) logs into run_log_entries.
 * Used by POST /v1/runs/:id/ingest_logs and by scheduled job when ENABLE_RENDER_LOG_INGEST=true.
 * See .cursor/plans/log_mirror_and_template_proofing_*.plan.md Phase 1.1–1.2.
 */

import { pool } from "./db.js";
import { listRenderServices } from "./render-worker-remediate.js";
import { parseLogValidation, insertLogValidations } from "./log-validations";

const RENDER_API_BASE = "https://api.render.com/v1";
const WORKER_SERVICE_ID = process.env.RENDER_WORKER_SERVICE_ID?.trim();
const WORKER_SERVICE_NAME = process.env.RENDER_WORKER_SERVICE_NAME?.trim() || "ai-factory-runner-staging";

function normalize(s: string): string {
  return s.toLowerCase().replace(/_/g, "-").replace(/\s+/g, "-");
}

/** Parse run_id from a log message (e.g. "run_id: 'abc-123'" or "run_id: abc-123" or JSON). */
export function parseRunIdFromMessage(message: string): string | null {
  if (!message || typeof message !== "string") return null;
  const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const runIdMatch = message.match(/run_id[\s:=]+['"]?([0-9a-f-]{36})['"]?/i) ?? message.match(/run_id[\s:=]+([0-9a-f-]{36})/i);
  if (runIdMatch) return runIdMatch[1].toLowerCase();
  const anyUuid = message.match(uuidRe);
  return anyUuid ? anyUuid[0].toLowerCase() : null;
}

/** Simple hash for dedupe: first 64 chars of message + timestamp. */
function dedupeHash(message: string, loggedAt: string): string {
  const s = (message || "").slice(0, 200) + "|" + loggedAt;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Resolve worker service ID for log fetch (same logic as render-worker-remediate). */
async function getWorkerServiceId(apiKey: string): Promise<string | null> {
  if (WORKER_SERVICE_ID) {
    const res = await fetch(`${RENDER_API_BASE}/services/${WORKER_SERVICE_ID}`, {
      method: "GET",
      headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return WORKER_SERVICE_ID;
    return null;
  }
  const services = await listRenderServices(apiKey);
  const want = normalize(WORKER_SERVICE_NAME);
  const baseName = want.replace(/-?(staging|prod)$/i, "").trim();
  const worker =
    services.find((s) => (s.name && normalize(s.name) === want) || (s.slug && normalize(s.slug) === want)) ??
    (baseName !== want
      ? services.find((s) => (s.name && normalize(s.name) === baseName) || (s.slug && normalize(s.slug) === baseName))
      : undefined) ??
    services.find((s) => {
      const n = normalize(s.slug ?? s.name ?? "");
      return n.includes("runner") && (n.includes("staging") || n.includes("ai-factory-runner"));
    });
  return worker?.id ?? null;
}

/** Fetch logs from Render API. Response shape: { items?: Array<{ timestamp, message, level? }>, hasMore?, nextStartTime?, nextEndTime? } or similar. */
async function fetchRenderLogs(
  apiKey: string,
  serviceId: string,
  startTime: string,
  endTime: string,
  limit: number
): Promise<{ timestamp: string; message: string; level?: string }[]> {
  const url = new URL(`${RENDER_API_BASE}/logs`);
  url.searchParams.set("resource", serviceId);
  url.searchParams.set("startTime", startTime);
  url.searchParams.set("endTime", endTime);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("direction", "forward");
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Render logs API failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as {
    items?: { timestamp?: string; message?: string; level?: string; log?: string }[];
    logs?: { timestamp?: string; message?: string; level?: string }[];
  };
  const raw = data.items ?? data.logs ?? [];
  return raw.map((entry: { timestamp?: string; message?: string; level?: string; log?: string }) => ({
    timestamp: entry.timestamp ?? "",
    message: typeof entry.message === "string" ? entry.message : (entry.log as string) ?? String(entry),
    level: entry.level,
  }));
}

export interface IngestResult {
  ingested: number;
  message: string;
}

/**
 * One-off ingest: fetch Render runner logs for the run's time window and insert lines that mention this run_id.
 */
export async function ingestRunLogsOneOff(
  runId: string,
  runRow: { created_at: Date; updated_at: Date }
): Promise<IngestResult> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) return { ingested: 0, message: "RENDER_API_KEY not set" };

  const workerId = await getWorkerServiceId(apiKey);
  if (!workerId) return { ingested: 0, message: "Runner service not found in Render" };

  const start = new Date(runRow.created_at);
  start.setSeconds(start.getSeconds() - 10);
  const end = new Date(runRow.updated_at);
  end.setSeconds(end.getSeconds() + 60);
  const startTime = start.toISOString();
  const endTime = end.toISOString();

  let lines: { timestamp: string; message: string; level?: string }[];
  try {
    lines = await fetchRenderLogs(apiKey, workerId, startTime, endTime, 200);
  } catch (e) {
    return { ingested: 0, message: `Render logs fetch failed: ${(e as Error).message}` };
  }

  const runIdLower = runId.toLowerCase();
  const toInsert: { run_id: string; source: string; level: string | null; message: string; logged_at: Date; dedupe_hash: string }[] = [];
  for (const line of lines) {
    const parsed = parseRunIdFromMessage(line.message);
    if (parsed !== runIdLower) continue;
    const loggedAt = line.timestamp ? new Date(line.timestamp) : new Date();
    const msg = line.message || "";
    const hash = dedupeHash(msg, loggedAt.toISOString());
    toInsert.push({
      run_id: runId,
      source: "render_runner",
      level: line.level || null,
      message: msg,
      logged_at: loggedAt,
      dedupe_hash: hash,
    });
  }

  if (toInsert.length === 0) return { ingested: 0, message: "No log lines matched this run_id" };

  let inserted = 0;
  for (const row of toInsert) {
    try {
      const rr = await pool.query(
        `INSERT INTO run_log_entries (run_id, source, level, message, logged_at, dedupe_hash)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (run_id, source, logged_at, dedupe_hash) DO NOTHING
         RETURNING id`,
        [row.run_id, row.source, row.level, row.message, row.logged_at, row.dedupe_hash]
      );
      if (rr.rowCount && rr.rowCount > 0) inserted += 1;
    } catch {
      // table missing or other error
    }
  }

  const logValidations: { validator_type: string; status: "fail" }[] = [];
  for (const row of toInsert) {
    const v = parseLogValidation(row.message);
    if (v) logValidations.push(v);
  }
  await insertLogValidations(pool, runId, logValidations);

  return { ingested: inserted, message: `Ingested ${inserted} log lines` };
}

/**
 * Scheduled ingest: fetch recent Render runner logs and insert by run_id.
 * Call every 1–2 min when ENABLE_RENDER_LOG_INGEST=true.
 */
export async function runScheduledLogIngest(): Promise<{ runsTouched: number; linesInserted: number }> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) return { runsTouched: 0, linesInserted: 0 };

  const workerId = await getWorkerServiceId(apiKey);
  if (!workerId) return { runsTouched: 0, linesInserted: 0 };

  const end = new Date();
  const start = new Date(end.getTime() - 10 * 60 * 1000);
  const startTime = start.toISOString();
  const endTime = end.toISOString();

  let lines: { timestamp: string; message: string; level?: string }[];
  try {
    lines = await fetchRenderLogs(apiKey, workerId, startTime, endTime, 100);
  } catch {
    return { runsTouched: 0, linesInserted: 0 };
  }

  const byRunId = new Map<string, { run_id: string; source: string; level: string | null; message: string; logged_at: Date; dedupe_hash: string }[]>();
  for (const line of lines) {
    const runId = parseRunIdFromMessage(line.message);
    if (!runId) continue;
    const loggedAt = line.timestamp ? new Date(line.timestamp) : new Date();
    const msg = line.message || "";
    const hash = dedupeHash(msg, loggedAt.toISOString());
    const row = {
      run_id: runId,
      source: "render_runner" as const,
      level: line.level || null,
      message: msg,
      logged_at: loggedAt,
      dedupe_hash: hash,
    };
    if (!byRunId.has(runId)) byRunId.set(runId, []);
    byRunId.get(runId)!.push(row);
  }

  let linesInserted = 0;
  for (const [runId, rows] of byRunId) {
    for (const row of rows) {
      try {
        const rr = await pool.query(
          `INSERT INTO run_log_entries (run_id, source, level, message, logged_at, dedupe_hash)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (run_id, source, logged_at, dedupe_hash) DO NOTHING
           RETURNING id`,
          [row.run_id, row.source, row.level, row.message, row.logged_at, row.dedupe_hash]
        );
        if (rr.rowCount && rr.rowCount > 0) linesInserted += 1;
      } catch {
        // skip
      }
    }
    const logValidations: { validator_type: string; status: "fail" }[] = [];
    for (const row of rows) {
      const v = parseLogValidation(row.message);
      if (v) logValidations.push(v);
    }
    await insertLogValidations(pool, runId, logValidations);
  }
  return { runsTouched: byRunId.size, linesInserted };
}
