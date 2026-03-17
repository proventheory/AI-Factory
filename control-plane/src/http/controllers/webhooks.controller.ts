import type { Request, Response } from "express";
import { pool, withTransaction } from "../../db.js";
import { createDeployEventFromPayload } from "../../deploy-events.js";

export async function webhookOutboxList(req: Request, res: Response): Promise<void> {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const conditions = status ? ["status = $1"] : ["1=1"];
    const params: unknown[] = status ? [status, limit, offset] : [limit, offset];
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;
    const r = await pool.query(
      `SELECT * FROM webhook_outbox WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );
    res.json({ items: r.rows, limit, offset });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function webhookOutboxPatch(req: Request, res: Response): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const body = req.body as {
      status?: string;
      attempt_count?: number;
      last_error?: string;
      next_retry_at?: string | null;
      sent_at?: string | null;
    };
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (body.status !== undefined) {
      sets.push(`status = $${i++}`);
      params.push(body.status);
    }
    if (body.attempt_count !== undefined) {
      sets.push(`attempt_count = $${i++}`);
      params.push(body.attempt_count);
    }
    if (body.last_error !== undefined) {
      sets.push(`last_error = $${i++}`);
      params.push(body.last_error);
    }
    if (body.next_retry_at !== undefined) {
      sets.push(`next_retry_at = $${i++}`);
      params.push(body.next_retry_at);
    }
    if (body.sent_at !== undefined) {
      sets.push(`sent_at = $${i++}`);
      params.push(body.sent_at);
    }
    sets.push("updated_at = now()");
    params.push(id);
    const r = await pool.query(
      `UPDATE webhook_outbox SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      params
    );
    if (r.rows.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function webhooksGithub(req: Request, res: Response): Promise<void> {
  try {
    const payload = req.body as {
      action?: string;
      issue?: { html_url?: string; number?: number; title?: string; body?: string; labels?: { name: string }[] };
      pull_request?: { html_url?: string; number?: number; title?: string };
      label?: { name: string };
      repository?: { full_name?: string };
    };
    const event = req.headers["x-github-event"] as string | undefined;
    if (event === "ping") {
      res.status(200).json({ ok: true });
      return;
    }

    const repo = payload.repository?.full_name ?? "unknown";
    const issue = payload.issue;
    const pr = payload.pull_request;

    if (payload.action === "labeled" && payload.label?.name === "fix-me" && (issue || pr)) {
      const selfHealEnabled = process.env.ENABLE_SELF_HEAL === "true";
      if (!selfHealEnabled) {
        res.json({
          received: true,
          self_heal: "disabled",
          message: "Set ENABLE_SELF_HEAL=true to enable self-healing",
        });
        return;
      }
      const sourceUrl = issue?.html_url ?? pr?.html_url;
      const title = `Self-heal: ${issue?.title ?? pr?.title ?? "fix-me"}`;
      let ir: { rows: { id: string }[] };
      try {
        ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state, template_id)
           VALUES ('issue_fix', $1, 'med', $2, 'draft', 'issue_fix') RETURNING id`,
          [title, sourceUrl]
        );
      } catch {
        ir = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level) VALUES ('issue_fix', $1, 'med') RETURNING id`,
          [title]
        );
      }
      const initId = ir.rows[0]?.id;
      if (initId) {
        try {
          const { compilePlan } = await import("../../plan-compiler.js");
          await withTransaction((client) => compilePlan(client, initId, { force: true }));
        } catch {
          /* plan compilation is best-effort on webhook */
        }
      }
      res.status(201).json({ initiative_id: initId, self_heal: true, repo, source_ref: sourceUrl });
      return;
    }

    if (!issue?.html_url) {
      res.status(200).json({ received: true });
      return;
    }
    const intent_type = issue.labels?.some((l: { name: string }) => l.name === "bug") ? "issue_fix" : "software";
    const title = issue.title ?? `Issue #${issue.number}`;
    let r: { rows: { id: string }[] };
    try {
      r = await pool.query(
        `INSERT INTO initiatives (intent_type, title, risk_level, source_ref, goal_state)
         VALUES ($1, $2, 'low', $3, 'draft') RETURNING id`,
        [intent_type, title, issue.html_url]
      );
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "42703") {
        r = await pool.query(
          `INSERT INTO initiatives (intent_type, title, risk_level) VALUES ($1, $2, 'low') RETURNING id`,
          [intent_type, title]
        );
      } else throw e;
    }
    const initiativeId = r.rows[0]?.id;
    if (!initiativeId) {
      res.status(500).json({ error: "Failed to create initiative" });
      return;
    }
    res.status(201).json({ initiative_id: initiativeId, repo, source_ref: issue.html_url });
  } catch (e) {
    res.status(500).json({ error: String((e as Error).message) });
  }
}

export async function webhooksVercel(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      type?: string;
      payload?: {
        deployment?: {
          id?: string;
          url?: string;
          name?: string;
          meta?: { githubCommitSha?: string };
          state?: string;
        };
        project?: { id?: string; name?: string };
        team?: { id?: string };
      };
    };
    const eventType = body.type ?? "";
    const deployment = body.payload?.deployment;
    const project = body.payload?.project;
    if (!deployment?.id) {
      res.status(200).json({ received: true, skipped: true, reason: "no deployment id" });
      return;
    }
    const statusMap: Record<string, string> = {
      READY: "ready",
      ERROR: "failed",
      CANCELED: "canceled",
      BUILDING: "building",
      INITIALIZING: "building",
    };
    const status =
      statusMap[deployment.state ?? ""] ??
      (eventType === "deployment.error" ? "failed" : eventType === "deployment.ready" ? "ready" : "unknown");
    const serviceId = project?.name ?? project?.id ?? "vercel";
    const commitSha = deployment.meta?.githubCommitSha ?? null;
    const result = await createDeployEventFromPayload(pool, {
      status,
      service_id: serviceId,
      commit_sha: commitSha ?? undefined,
      external_deploy_id: deployment.id,
    });
    res.status(201).json({ received: true, deploy_id: result.deploy_id, status: result.status });
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
