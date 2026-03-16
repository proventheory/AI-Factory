/**
 * Incident watcher: poll service status, detect failed deploys/crash loops, open or update incidents.
 * Updates release_recovery_state (failure_streak, retry_suppressed).
 * Schedule: every 1–2 minutes (call from control-plane index or cron).
 */

import type { FailurePhase } from "./types.js";
import { pool } from "../db.js";
import { getStagingServiceIds, listRenderDeploys } from "../render-worker-remediate.js";

const FAILED_STATUSES = ["failed", "canceled", "build_failed", "update_failed"] as const;

function isFailedStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase().trim();
  return FAILED_STATUSES.some((f) => s === f || s.replace(/_/g, " ").includes(f.replace(/_/g, " ")));
}

/** Map Render service ID to a logical service_name and environment for incidents. */
function serviceIdToNameEnv(serviceId: string): { service_name: string; environment: string } {
  return { service_name: `render:${serviceId}`, environment: "staging" };
}

/**
 * Run one watcher cycle: for each monitored service, check latest deploy; if failed, open or update incident and release_recovery_state.
 */
export async function runIncidentWatcherCycle(): Promise<{ opened: number; updated: number }> {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) return { opened: 0, updated: 0 };

  const serviceIds = await getStagingServiceIds();
  if (serviceIds.length === 0) return { opened: 0, updated: 0 };

  let opened = 0;
  let updated = 0;

  for (const serviceId of serviceIds) {
    let deploys: { id: string; status: string; commit?: string }[];
    try {
      deploys = await listRenderDeploys(apiKey, serviceId, 1);
    } catch (err) {
      if (process.env.DEBUG_SELF_HEAL === "1") {
        console.warn("[incident-watcher] list deploys error", serviceId, (err as Error).message);
      }
      continue;
    }

    const latest = deploys[0];
    if (!latest?.id) continue;
    if (!isFailedStatus(latest.status)) {
      await markHealthyIfNeeded(serviceId);
      continue;
    }

    const { service_name, environment } = serviceIdToNameEnv(serviceId);

    const existing = await pool.query(
      `SELECT id, status, retry_count FROM incidents
       WHERE service_name = $1 AND environment = $2 AND status NOT IN ('closed', 'recovered', 'rolled_back', 'quarantined', 'escalated')
       ORDER BY opened_at DESC LIMIT 1`,
      [service_name, environment]
    );

    if (existing.rows.length > 0) {
      const inc = existing.rows[0] as { id: string; status: string; retry_count: number };
      await pool.query(
        `UPDATE incidents SET last_failure_at = now(), retry_count = $1, updated_at = now(), deploy_id = $2
         WHERE id = $3`,
        [inc.retry_count + 1, latest.id, inc.id]
      );
      await upsertRecoveryState(service_name, environment, { failureStreak: inc.retry_count + 1, deployId: latest.id, incidentId: inc.id });
      updated++;
    } else {
      const phase: FailurePhase = latest.status === "build_failed" ? "build" : "boot";
      const ir = await pool.query(
        `INSERT INTO incidents (service_name, environment, deploy_id, status, failure_phase, first_failure_at, last_failure_at, retry_count)
         VALUES ($1, $2, $3, 'detected', $4, now(), now(), 1) RETURNING id`,
        [service_name, environment, latest.id, phase]
      );
      const incidentId = ir.rows[0]?.id as string;
      if (incidentId) {
        await upsertRecoveryState(service_name, environment, { failureStreak: 1, deployId: latest.id, incidentId });
        opened++;
      }
    }
  }

  return { opened, updated };
}

async function markHealthyIfNeeded(serviceId: string): Promise<void> {
  const { service_name, environment } = serviceIdToNameEnv(serviceId);
  await pool.query(
    `UPDATE release_recovery_state SET failure_streak = 0, retry_suppressed = false, suppression_reason = null, current_incident_id = null, updated_at = now()
     WHERE service_name = $1 AND environment = $2`,
    [service_name, environment]
  );
}

async function upsertRecoveryState(
  serviceName: string,
  environment: string,
  opts: { failureStreak: number; deployId: string; incidentId: string }
): Promise<void> {
  await pool.query(
    `INSERT INTO release_recovery_state (service_name, environment, last_failed_release_id, current_incident_id, failure_streak, updated_at)
     VALUES ($1, $2, NULL, $3, $4, now())
     ON CONFLICT (service_name, environment) DO UPDATE SET
       current_incident_id = $3,
       failure_streak = $4,
       last_failed_release_id = COALESCE(release_recovery_state.last_failed_release_id),
       updated_at = now()`,
    [serviceName, environment, opts.incidentId, opts.failureStreak]
  );
}
