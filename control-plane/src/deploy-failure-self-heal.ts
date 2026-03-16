/**
 * Self-heal: deploy-failure remediation (no human in the loop).
 *
 * When any staging service (api, gateway, runner) has latest deploy failed, build_failed, or canceled,
 * trigger a new deploy with cache clear so Render retries the build.
 * If the same commit has already been remediated 2+ times for that service (code bug), create
 * an initiative with deploy logs in goal_metadata, compile the issue_fix plan, and auto-start a run
 * so the LLM (analyze_repo → write_patch → …) can propose a fix.
 *
 * Trigger: background scan every 5 minutes (see control-plane index).
 * Requires: ENABLE_SELF_HEAL=true, RENDER_API_KEY set.
 * Optional: RENDER_STAGING_SERVICE_IDS=id1,id2,id3 (comma-separated) to monitor api + gateway + runner.
 * If unset, only the worker (RENDER_WORKER_SERVICE_ID or resolved runner) is monitored.
 */

import { v4 as uuid } from "uuid";
import { pool, withTransaction } from "./db.js";
import {
  getStagingServiceIds,
  listRenderDeploys,
  listRenderLogs,
  triggerRenderDeploy,
} from "./render-worker-remediate.js";

/** Deploy IDs we already triggered a redeploy for (avoid loop). Cleared on process restart. */
export const deployFailureRemediatedDeployIds = new Set<string>();

/** Per service+commit count of remediations. Key: `${serviceId}:${commit}`. */
export const deployFailureRemediationCountByCommit = new Map<string, number>();

/** Commit keys we already created an issue_fix initiative for (avoid duplicate initiatives). Cleared on process restart. */
const deployFailureInitiativeCreatedForCommit = new Set<string>();

/**
 * Render deploy statuses we treat as failed and remediate (trigger redeploy).
 * Check is case-insensitive. Render API returns e.g. "update_failed" for failed deploys.
 * See docs/SELF_HEAL_PROVIDER_STATUS_REFERENCE.md.
 */
const FAILED_STATUSES = ["failed", "canceled", "build_failed", "update_failed"] as const;

function isFailedStatus(status: string | undefined): boolean {
  const s = (status ?? "").toLowerCase().trim();
  return FAILED_STATUSES.some((f) => s === f || s.replace(/_/g, " ").includes(f.replace(/_/g, " ")));
}
const MAX_REDEPLOYS_PER_COMMIT = 2;

/**
 * Check each staging service's latest deploy; if failed/canceled, trigger a new deploy with cache clear
 * unless we've already remediated this deploy or this service+commit 2+ times (then create initiative).
 */
export async function scanAndRemediateDeployFailure(): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const hasKey = !!process.env.RENDER_API_KEY?.trim();
  if (!selfHeal || !hasKey) return;

  const serviceIds = await getStagingServiceIds();
  if (serviceIds.length === 0) {
    if (process.env.DEBUG_SELF_HEAL === "1") {
      console.warn("[self-heal] Deploy-failure scan: no service IDs (set RENDER_STAGING_SERVICE_IDS or RENDER_WORKER_SERVICE_ID)");
    }
    return;
  }
  if (process.env.DEBUG_SELF_HEAL === "1") {
    console.log("[self-heal] Deploy-failure scan: monitoring", serviceIds.length, "service(s)");
  }

  for (const serviceId of serviceIds) {
    let deploys: { id: string; status: string; commit?: string }[];
    try {
      deploys = await listRenderDeploys(process.env.RENDER_API_KEY!, serviceId, 1);
    } catch (err) {
      console.warn("[self-heal] Deploy-failure scan: list deploys error for", serviceId, (err as Error).message);
      continue;
    }

    const latest = deploys[0];
    if (!latest?.id) continue;
    if (!isFailedStatus(latest.status)) continue;
    if (deployFailureRemediatedDeployIds.has(latest.id)) continue;

    const commitKey = `${serviceId}:${latest.commit?.trim() || latest.id}`;
    const count = (deployFailureRemediationCountByCommit.get(commitKey) ?? 0) + 1;
    deployFailureRemediationCountByCommit.set(commitKey, count);

    if (count > MAX_REDEPLOYS_PER_COMMIT) {
      const alreadyCreatedInitiative = deployFailureInitiativeCreatedForCommit.has(commitKey);
      if (!alreadyCreatedInitiative) {
        deployFailureInitiativeCreatedForCommit.add(commitKey);
      }
      try {
        if (!alreadyCreatedInitiative) {
          let logsText = "";
        try {
          const logs = await listRenderLogs(process.env.RENDER_API_KEY!, serviceId, { limit: 100, direction: "backward" });
          logsText = logs
            .map((l) => (l.timestamp ? `[${l.timestamp}] ` : "") + (l.message ?? ""))
            .join("\n")
            .slice(0, 15000);
        } catch (logErr) {
          if (process.env.DEBUG_SELF_HEAL === "1") {
            console.warn("[self-heal] Deploy-failure: could not fetch logs for", serviceId, (logErr as Error).message);
          }
        }
        const goalMetadata = {
          deploy_failure: {
            service_id: serviceId,
            deploy_id: latest.id,
            commit: latest.commit ?? null,
            logs: logsText,
          },
        };

        /** When ALLOW_SELF_HEAL_PUSH=true, use deploy_fix template so the runner will apply the patch and push to main. */
        const templateId = process.env.ALLOW_SELF_HEAL_PUSH === "true" ? "deploy_fix" : "issue_fix";

        const runId = await withTransaction(async (client) => {
          let initId: string;
          try {
            const ir = await client.query(
              `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id, goal_metadata)
               VALUES ('issue_fix', $1, 'med', $2, 'draft', $3, $4) RETURNING id`,
              [
                `Self-heal: Deploy repeatedly failing (service ${serviceId}, commit ${latest.commit ?? "unknown"})`,
                `deploy:${latest.id}`,
                templateId,
                JSON.stringify(goalMetadata),
              ]
            );
            initId = ir.rows[0]?.id as string;
          } catch (insertErr: unknown) {
            if ((insertErr as { code?: string }).code === "42703") {
              const ir = await client.query(
                `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
                 VALUES ('issue_fix', $1, 'med', $2, 'draft', $3) RETURNING id`,
                [
                  `Self-heal: Deploy repeatedly failing (service ${serviceId}, commit ${latest.commit ?? "unknown"})`,
                  `deploy:${latest.id}`,
                  templateId,
                ]
              );
              initId = ir.rows[0]?.id as string;
            } else {
              throw insertErr;
            }
          }
          if (!initId) return null;

          const { compilePlan } = await import("./plan-compiler.js");
          const { planId } = await compilePlan(client, initId, { force: true });

          let releaseId: string;
          const rel = await client.query("SELECT id FROM releases WHERE status = $1 ORDER BY created_at DESC LIMIT 1", ["promoted"]);
          if (rel.rows.length > 0) {
            releaseId = rel.rows[0].id as string;
          } else {
            const ins = await client.query(
              "INSERT INTO releases (id, status, percent_rollout, policy_version) VALUES ($1, $2, 100, $3) RETURNING id",
              [uuid(), "promoted", "latest"]
            );
            releaseId = ins.rows[0].id as string;
          }

          const { createRun } = await import("./scheduler.js");
          return createRun(client, {
            planId,
            releaseId,
            policyVersion: "latest",
            environment: "staging",
            cohort: "control",
            rootIdempotencyKey: `self_heal_deploy_fix:${latest.id}:${Date.now()}`,
            llmSource: "gateway",
          });
        });

          if (runId) {
            console.log("[self-heal] Deploy-failure: created issue_fix initiative and started LLM run", runId, "for service", serviceId);
          } else {
            console.log("[self-heal] Deploy-failure: created initiative for repeated failures (run not started):", serviceId);
          }
        }
      } catch (e) {
        if (!alreadyCreatedInitiative) {
          console.warn("[self-heal] Deploy-failure: failed to create initiative or start run:", (e as Error).message);
        }
      }
      // Keep triggering redeploys so when the fix is in (new commit or fixed code), next deploy can succeed. Do not stop healing.
      try {
        await triggerRenderDeploy(process.env.RENDER_API_KEY!, serviceId, true);
        console.log("[self-heal] Deploy-failure: triggered redeploy (clear cache) for", serviceId, "after initiative (keep trying)");
      } catch (err) {
        console.warn("[self-heal] Deploy-failure: trigger after initiative failed for", serviceId, (err as Error).message);
      }
      continue;
    }

    try {
      await triggerRenderDeploy(process.env.RENDER_API_KEY!, serviceId, true);
      deployFailureRemediatedDeployIds.add(latest.id);
      console.log("[self-heal] Deploy-failure remediation: triggered new deploy (clear cache) for", serviceId, "failed deploy", latest.id);
    } catch (err) {
      deployFailureRemediationCountByCommit.set(commitKey, count - 1);
      console.warn("[self-heal] Deploy-failure remediation: trigger deploy error for", serviceId, (err as Error).message);
    }
  }
}
