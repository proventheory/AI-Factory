import type { Request, Response } from "express";
import { pool } from "../../db.js";
import { createDeployEventFromPayload } from "../../deploy-events.js";
import { lookupBySignature as incidentLookup } from "../../incident-memory.js";
import { registerVercelProjectForSelfHeal, scanAndRemediateVercelDeployFailure } from "../../vercel-redeploy-self-heal.js";
import { scanAndRemediateDeployFailure } from "../../deploy-failure-self-heal.js";

export async function createDeployEvent(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      status?: string;
      service_id?: string;
      commit_sha?: string;
      build_log_text?: string;
      external_deploy_id?: string;
    };
    if (!body?.status) {
      res.status(400).json({ error: "status required" });
      return;
    }
    const result = await createDeployEventFromPayload(pool, body);
    res.status(201).json(result);
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(503).json({
        error: "deploy_events table not present. Run migration 20250315000000_graph_self_heal_tables.sql.",
      });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function getRepairPlan(req: Request, res: Response): Promise<void> {
  try {
    const deployId = String(req.params.id ?? "");
    const deployRow = await pool.query(
      "SELECT deploy_id, service_id, commit_sha, status, failure_class, error_signature, change_event_id FROM deploy_events WHERE deploy_id = $1",
      [deployId]
    );
    if (deployRow.rows.length === 0) {
      res.status(404).json({ error: "deploy event not found" });
      return;
    }
    const deploy = deployRow.rows[0] as {
      deploy_id: string;
      service_id: string;
      commit_sha: string | null;
      status: string;
      failure_class: string | null;
      error_signature: string | null;
      change_event_id: string | null;
    };
    let suggested_actions: {
      action_id: string;
      action_key: string;
      label: string;
      description: string | null;
      risk_level: string;
      requires_approval: boolean;
    }[] = [];
    try {
      const ar = await pool.query(
        "SELECT action_id, action_key, label, description, risk_level, requires_approval FROM build_repair_actions ORDER BY action_key"
      );
      suggested_actions = ar.rows as typeof suggested_actions;
    } catch {
      // table may not exist
    }
    let similar_incidents: unknown[] = [];
    if (deploy.error_signature || deploy.failure_class) {
      similar_incidents = await incidentLookup(pool, deploy.error_signature ?? "", deploy.failure_class, 10);
    }
    res.json({
      deploy_id: deploy.deploy_id,
      service_id: deploy.service_id,
      commit_sha: deploy.commit_sha,
      status: deploy.status,
      failure_class: deploy.failure_class,
      error_signature: deploy.error_signature,
      change_event_id: deploy.change_event_id,
      suggested_actions,
      similar_incidents,
      build_config_snapshot: null,
      suggested_file_actions: { suggested_files: [], unresolved_path: null },
    });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.status(404).json({ error: "deploy_events not available" });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function listDeployEvents(req: Request, res: Response): Promise<void> {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const serviceId = (req.query.service_id as string) || null;
    const status = (req.query.status as string) || null;
    let q =
      "SELECT deploy_id, change_event_id, service_id, commit_sha, status, failure_class, error_signature, external_deploy_id, created_at FROM deploy_events WHERE 1=1";
    const params: unknown[] = [];
    let i = 1;
    if (serviceId) {
      q += ` AND service_id = $${i++}`;
      params.push(serviceId);
    }
    if (status) {
      q += ` AND status = $${i++}`;
      params.push(status);
    }
    q += ` ORDER BY created_at DESC LIMIT $${i}`;
    params.push(limit);
    const r = await pool.query(q, params);
    res.json({ items: r.rows, limit });
  } catch (e) {
    const err = e as { code?: string };
    if (err.code === "42P01") {
      res.json({ items: [], limit: 50 });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function syncDeployEvents(_req: Request, res: Response): Promise<void> {
  try {
    const apiKey = process.env.RENDER_API_KEY?.trim();
    if (!apiKey) {
      res.json({
        synced: 0,
        message:
          "Configure RENDER_API_KEY and RENDER_STAGING_SERVICE_IDS (or RENDER_WORKER_SERVICE_ID) to enable sync.",
      });
      return;
    }
    const { getStagingServiceIds, listRenderDeploys } = await import("../../render-worker-remediate.js");
    const serviceIds = await getStagingServiceIds();
    if (serviceIds.length === 0) {
      res.json({
        synced: 0,
        message: "No Render service IDs configured (RENDER_STAGING_SERVICE_IDS or RENDER_WORKER_SERVICE_ID).",
      });
      return;
    }
    let synced = 0;
    for (const serviceId of serviceIds) {
      let deploys: { id: string; status: string; commit?: string }[];
      try {
        deploys = await listRenderDeploys(apiKey, serviceId, 20);
      } catch {
        continue;
      }
      for (const d of deploys) {
        const existing = await pool.query("SELECT 1 FROM deploy_events WHERE external_deploy_id = $1 LIMIT 1", [d.id]);
        if (existing.rows.length > 0) continue;
        await createDeployEventFromPayload(pool, {
          status: d.status,
          service_id: serviceId,
          commit_sha: d.commit ?? undefined,
          external_deploy_id: d.id,
        });
        synced++;
      }
    }
    res.json({
      synced,
      message: synced ? `Synced ${synced} deploy(s) from Render.` : "No new deploys to sync.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function syncDeployEventsGithub(_req: Request, res: Response): Promise<void> {
  try {
    const token = process.env.GITHUB_TOKEN?.trim();
    const repos = process.env.GITHUB_REPOS?.trim()?.split(",").map((s) => s.trim()).filter(Boolean);
    if (!token || !repos?.length) {
      res.json({
        synced: 0,
        message: "Configure GITHUB_TOKEN and GITHUB_REPOS (owner/repo, comma-separated) to enable sync.",
      });
      return;
    }
    let synced = 0;
    for (const repo of repos) {
      const [owner, repoName] = repo.split("/");
      if (!owner || !repoName) continue;
      const resGh = await fetch(
        `https://api.github.com/repos/${owner}/${repoName}/actions/runs?per_page=20&status=completed`,
        { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}` } }
      );
      if (!resGh.ok) continue;
      const data = (await resGh.json()) as {
        workflow_runs?: { id: number; status: string; conclusion: string; head_sha?: string }[];
      };
      const runs = data.workflow_runs ?? [];
      for (const run of runs) {
        const externalId = `github:${owner}/${repoName}:${run.id}`;
        const existing = await pool.query("SELECT 1 FROM deploy_events WHERE external_deploy_id = $1 LIMIT 1", [
          externalId,
        ]);
        if (existing.rows.length > 0) continue;
        const status =
          run.conclusion === "success" ? "success" : run.conclusion === "failure" ? "failed" : run.status;
        await createDeployEventFromPayload(pool, {
          status,
          service_id: `github:${repo}`,
          commit_sha: run.head_sha ?? undefined,
          external_deploy_id: externalId,
        });
        synced++;
      }
    }
    res.json({
      synced,
      message: synced ? `Synced ${synced} workflow run(s) from GitHub.` : "No new runs to sync.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function vercelRegister(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as { projectId?: string; teamId?: string };
    const projectId = body?.projectId?.trim();
    if (!projectId) {
      res.status(400).json({ error: "projectId required" });
      return;
    }
    const result = await registerVercelProjectForSelfHeal(projectId, body?.teamId?.trim());
    res.status(201).json({ projectId, ...result });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    if (err.message?.includes("vercel_self_heal_projects table not present")) {
      res.status(503).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function deployFailureScan(_req: Request, res: Response): Promise<void> {
  try {
    await scanAndRemediateDeployFailure();
    await scanAndRemediateVercelDeployFailure();
    res.json({
      ok: true,
      message:
        "Deploy-failure scan completed. Check Control Plane logs and Render/Vercel deploy history.",
    });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}
