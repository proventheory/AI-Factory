/**
 * Evidence collector: for incidents in status 'detected', fetch logs and context, store in incident_evidence, move to 'collecting_evidence' then 'classified' (or classifier does that).
 * Triggered when incident is in detected or collecting_evidence.
 */

import { pool } from "../db.js";
import { listRenderLogs } from "../render-worker-remediate.js";

const RENDER_SERVICE_ID_PREFIX = "render:";

function parseServiceId(serviceName: string): string | null {
  if (serviceName.startsWith(RENDER_SERVICE_ID_PREFIX)) return serviceName.slice(RENDER_SERVICE_ID_PREFIX.length);
  return null;
}

/**
 * Collect evidence for one incident: fetch Render deploy logs, store in incident_evidence, set status to collecting_evidence.
 */
export async function collectEvidenceForIncident(incidentId: string): Promise<{ evidenceCount: number }> {
  const inc = await pool.query(
    "SELECT id, service_name, environment, deploy_id, status FROM incidents WHERE id = $1",
    [incidentId]
  );
  if (inc.rows.length === 0) return { evidenceCount: 0 };
  const row = inc.rows[0] as { service_name: string; deploy_id: string | null; status: string };

  if (row.status !== "detected" && row.status !== "collecting_evidence") {
    return { evidenceCount: 0 };
  }

  await pool.query(
    "UPDATE incidents SET status = 'collecting_evidence', updated_at = now() WHERE id = $1",
    [incidentId]
  );

  let evidenceCount = 0;
  const apiKey = process.env.RENDER_API_KEY?.trim();
  const serviceId = parseServiceId(row.service_name);

  if (apiKey && serviceId) {
    try {
      const logs = await listRenderLogs(apiKey, serviceId, { limit: 100, direction: "backward" });
      const contentText = logs
        .map((l) => (l.timestamp ? `[${l.timestamp}] ` : "") + (l.message ?? ""))
        .join("\n")
        .slice(0, 50000);
      await pool.query(
        `INSERT INTO incident_evidence (incident_id, evidence_type, source, content_text) VALUES ($1, 'deploy_log', 'render', $2)`,
        [incidentId, contentText]
      );
      evidenceCount++;
    } catch (err) {
      if (process.env.DEBUG_SELF_HEAL === "1") {
        console.warn("[evidence-collector] fetch logs error", incidentId, (err as Error).message);
      }
    }
  }

  return { evidenceCount };
}

/**
 * Process all incidents in 'detected': collect evidence for each.
 */
export async function collectEvidenceForAllDetected(): Promise<{ processed: number }> {
  const open = await pool.query(
    "SELECT id FROM incidents WHERE status = 'detected' ORDER BY opened_at ASC"
  );
  let processed = 0;
  for (const r of open.rows) {
    await collectEvidenceForIncident((r as { id: string }).id);
    processed++;
  }
  return { processed };
}
