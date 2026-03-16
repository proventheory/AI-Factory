/**
 * Self-heal: Vercel deploy-failure remediation (no human in the loop).
 *
 * When any configured Vercel project has its latest deployment in ERROR or CANCELED state,
 * trigger a redeploy so transient build failures are retried.
 * If the same commit has already been remediated 2+ times for that project (code bug),
 * create an initiative instead of redeploying again.
 *
 * Trigger: background scan every 5 minutes (same interval as Render deploy-failure).
 * Requires: ENABLE_SELF_HEAL=true, VERCEL_TOKEN or VERCEL_API_TOKEN set (same token as Terraform).
 * Project list: from env (VERCEL_PROJECT_IDS or VERCEL_PROJECT_ID) and from DB table
 *               vercel_self_heal_projects (projects registered via POST /v1/vercel/register).
 * Optional: VERCEL_TEAM_ID for team-scoped projects (env-only; DB rows have their own team_id).
 *
 * Works with Console (Operator UI) and any AI Factory–launched Vercel project (new sites, domains).
 */

import type { Pool } from "pg";
import { pool, withTransaction } from "./db.js";

/**
 * Vercel deployment states we treat as failed and remediate (trigger redeploy).
 * Must match Vercel API; if a failed deploy isn't self-healing, check the deployment's state and add it here.
 * See docs/SELF_HEAL_PROVIDER_STATUS_REFERENCE.md.
 */
const FAILED_STATES = ["ERROR", "CANCELED"] as const;
const MAX_REDEPLOYS_PER_COMMIT = 2;
const VERCEL_WEBHOOK_EVENTS = ["deployment.error", "deployment.canceled", "deployment.ready"] as const;

/** Deploy IDs we already triggered a redeploy for (avoid loop). Cleared on process restart. */
export const vercelRemediatedDeployIds = new Set<string>();
/** Per project+commit count of remediations. Key: `${projectId}:${commit}`. */
export const vercelRemediationCountByCommit = new Map<string, number>();

/** Project IDs from env (VERCEL_PROJECT_IDS or VERCEL_PROJECT_ID) with optional global VERCEL_TEAM_ID. */
function getVercelProjectIdsFromEnv(): { projectId: string; teamId?: string }[] {
  const ids = process.env.VERCEL_PROJECT_IDS ?? process.env.VERCEL_PROJECT_ID;
  if (!ids?.trim()) return [];
  const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;
  return ids.split(",").map((s) => s.trim()).filter(Boolean).map((projectId) => ({ projectId, teamId }));
}

/** Vercel API token: VERCEL_TOKEN (Control Plane) or VERCEL_API_TOKEN (same as Terraform infra). */
function getVercelToken(): string | undefined {
  return process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
}

/** All projects to monitor: env + DB (vercel_self_heal_projects). Used by scan and by register (to avoid duplicate webhook). */
export async function getVercelProjectIdsAndTeams(p: Pool): Promise<{ projectId: string; teamId?: string }[]> {
  const fromEnv = getVercelProjectIdsFromEnv();
  let fromDb: { project_id: string; team_id: string | null }[] = [];
  try {
    const r = await p.query("SELECT project_id, team_id FROM vercel_self_heal_projects");
    fromDb = r.rows as { project_id: string; team_id: string | null }[];
  } catch {
    // table may not exist yet
  }
  const seen = new Set<string>();
  const out: { projectId: string; teamId?: string }[] = [];
  for (const { projectId, teamId } of fromEnv) {
    if (!seen.has(projectId)) {
      seen.add(projectId);
      out.push({ projectId, teamId });
    }
  }
  for (const row of fromDb) {
    if (!seen.has(row.project_id)) {
      seen.add(row.project_id);
      out.push({ projectId: row.project_id, teamId: row.team_id ?? undefined });
    }
  }
  return out;
}

/** Register a Vercel project for self-heal (DB + webhook). Call when launching a new project or connecting a domain. Idempotent. */
export async function registerVercelProjectForSelfHeal(projectId: string, teamId?: string): Promise<{ registered: boolean; webhookCreated: boolean }> {
  const p = pool;
  const projectIdTrim = projectId?.trim();
  if (!projectIdTrim) throw new Error("projectId required");

  let registered = false;
  try {
    await p.query(
      "INSERT INTO vercel_self_heal_projects (project_id, team_id) VALUES ($1, $2) ON CONFLICT (project_id) DO NOTHING",
      [projectIdTrim, teamId?.trim() || null]
    );
    registered = true;
  } catch (err) {
    if ((err as { code?: string }).code === "42P01") throw new Error("vercel_self_heal_projects table not present. Run migration 20250320200000_vercel_self_heal_projects.sql.");
    throw err;
  }

  let webhookCreated = false;
  const token = getVercelToken();
  const baseUrl = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "");
  const webhookUrl = `${baseUrl}/v1/webhooks/vercel`;
  if (token && baseUrl && !baseUrl.startsWith("http://localhost")) {
    try {
      await createVercelWebhook(token, webhookUrl, projectIdTrim, teamId?.trim() || undefined);
      webhookCreated = true;
    } catch (e) {
      console.warn("[vercel-register] Webhook creation failed (project already has webhook?):", (e as Error).message);
    }
  }
  return { registered: true, webhookCreated };
}

/** Create a Vercel webhook for a project so deployment events POST to our Control Plane. */
export async function createVercelWebhook(
  token: string,
  webhookUrl: string,
  projectId: string,
  teamId?: string
): Promise<{ id: string }> {
  const url = new URL("https://api.vercel.com/v1/webhooks");
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      events: [...VERCEL_WEBHOOK_EVENTS],
      projectIds: [projectId],
    }),
  });
  if (!res.ok) throw new Error(`Vercel webhook API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string };
  return { id: data.id };
}

async function listVercelDeployments(
  token: string,
  projectId: string,
  teamId?: string
): Promise<{ uid: string; state: string; meta?: { githubCommitSha?: string }; commit?: string }[]> {
  const url = new URL("https://api.vercel.com/v6/deployments");
  url.searchParams.set("projectId", projectId);
  url.searchParams.set("limit", "1");
  if (teamId) url.searchParams.set("teamId", teamId);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { deployments?: { uid: string; state: string; meta?: { githubCommitSha?: string }; commit?: string }[] };
  const list = data.deployments ?? [];
  return list.map((d) => ({
    uid: d.uid,
    state: d.state,
    meta: d.meta,
    commit: d.meta?.githubCommitSha ?? (d as { commit?: string }).commit,
  }));
}

async function triggerVercelRedeploy(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<void> {
  const url = new URL("https://api.vercel.com/v13/deployments");
  if (teamId) url.searchParams.set("teamId", teamId);
  const body: { deploymentId: string; forceNew?: boolean } = { deploymentId, forceNew: true };
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Vercel redeploy API ${res.status}: ${text}`);
  }
}

/**
 * For each configured Vercel project, check latest deployment; if ERROR/CANCELED,
 * trigger redeploy (up to MAX_REDEPLOYS_PER_COMMIT per project+commit), else create initiative.
 */
export async function scanAndRemediateVercelDeployFailure(): Promise<void> {
  const selfHeal = process.env.ENABLE_SELF_HEAL === "true";
  const token = getVercelToken();
  if (!selfHeal || !token) return;

  const projects = await getVercelProjectIdsAndTeams(pool);
  if (projects.length === 0) return;

  for (const { projectId, teamId } of projects) {
    let deployments: { uid: string; state: string; commit?: string }[];
    try {
      deployments = await listVercelDeployments(token, projectId, teamId);
    } catch (err) {
      console.warn("[self-heal] Vercel deploy-failure scan: list deployments error for", projectId, (err as Error).message);
      continue;
    }

    const latest = deployments[0];
    if (!latest?.uid) continue;
    if (!FAILED_STATES.includes(latest.state as (typeof FAILED_STATES)[number])) continue;
    if (vercelRemediatedDeployIds.has(latest.uid)) continue;

    const commit = latest.commit?.trim() || latest.uid;
    const commitKey = `${projectId}:${commit}`;
    const count = (vercelRemediationCountByCommit.get(commitKey) ?? 0) + 1;
    vercelRemediationCountByCommit.set(commitKey, count);

    if (count > MAX_REDEPLOYS_PER_COMMIT) {
      vercelRemediatedDeployIds.add(latest.uid);
      try {
        const ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'med', $2, 'draft', 'issue_fix') RETURNING id`,
          [
            `Self-heal: Vercel deploy repeatedly failing (project ${projectId}, commit ${commit})`,
            `vercel:${latest.uid}`,
          ]
        );
        const initId = ir.rows[0]?.id;
        if (initId) {
          const { compilePlan } = await import("./plan-compiler.js");
          await withTransaction((client) => compilePlan(client, initId, { force: true }));
          console.log("[self-heal] Vercel deploy-failure: created initiative for repeated failures (no more redeploys):", projectId, initId);
        }
      } catch (e) {
        console.warn("[self-heal] Vercel deploy-failure: failed to create initiative:", (e as Error).message);
      }
      continue;
    }

    try {
      await triggerVercelRedeploy(token, latest.uid, teamId);
      vercelRemediatedDeployIds.add(latest.uid);
      console.log("[self-heal] Vercel deploy-failure remediation: triggered redeploy for", projectId, "deployment", latest.uid);
    } catch (err) {
      vercelRemediationCountByCommit.set(commitKey, count - 1);
      console.warn("[self-heal] Vercel deploy-failure remediation: redeploy error for", projectId, (err as Error).message);
    }
  }
}
