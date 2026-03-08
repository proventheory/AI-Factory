/**
 * Template proof run loop: for each email template, create campaign → plan → start run → poll → record.
 * See .cursor/plans/log_mirror_and_template_proofing_*.plan.md Phase 3.1.
 */

import { pool } from "./db.js";

const POLL_INTERVAL_MS = 5000;
const RUN_TIMEOUT_MS = 3 * 60 * 1000; // 3 min per run

function getBaseUrl(): string {
  return process.env.CONTROL_PLANE_URL?.trim() || `http://localhost:${process.env.PORT || "3001"}`;
}

export interface ProofLoopOptions {
  batchId: string;
  brandProfileId: string;
  durationMinutes: number;
  templateIds?: string[];
}

/**
 * Run the proof loop: for each template (or all from API), create campaign, plan, start run, poll until done, insert template_proof_runs.
 * Stops when endAt is reached or all templates done or batch status is paused/cancelled.
 */
export async function runProofLoop(options: ProofLoopOptions): Promise<void> {
  const { batchId, brandProfileId, durationMinutes, templateIds: explicitTemplateIds } = options;
  const baseUrl = getBaseUrl();
  const endAt = new Date(Date.now() + durationMinutes * 60 * 1000);

  let templateIds = explicitTemplateIds;
  if (!templateIds || templateIds.length === 0) {
    const res = await fetch(`${baseUrl}/v1/email_templates?limit=100`);
    if (!res.ok) throw new Error(`Failed to list templates: ${res.status}`);
    const data = (await res.json()) as { items?: { id: string }[] };
    templateIds = (data.items ?? []).map((t) => t.id);
  }

  for (const templateId of templateIds) {
    if (new Date() >= endAt) break;

    const batchRow = await pool.query("SELECT status FROM template_proof_batches WHERE id = $1", [batchId]);
    if (batchRow.rows.length === 0 || (batchRow.rows[0] as { status: string }).status !== "running") break;

    const insertRun = await pool.query(
      `INSERT INTO template_proof_runs (batch_id, template_id, brand_profile_id, status) VALUES ($1, $2, $3, 'running') RETURNING id`,
      [batchId, templateId, brandProfileId]
    );
    const proofRunId = (insertRun.rows[0] as { id: string }).id;

    try {
      const campaignRes = await fetch(`${baseUrl}/v1/email_designs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brand_profile_id: brandProfileId,
          template_id: templateId,
          title: `Proof: ${templateId}`,
          metadata_json: { campaign_prompt: "proof run" },
        }),
      });
      if (!campaignRes.ok) {
        const err = await campaignRes.text();
        await pool.query(
          "UPDATE template_proof_runs SET status = 'failed', completed_at = now() WHERE id = $1",
          [proofRunId]
        );
        continue;
      }
      const campaign = (await campaignRes.json()) as { id: string };
      const initiativeId = campaign.id;

      const planRes = await fetch(`${baseUrl}/v1/initiatives/${initiativeId}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!planRes.ok) {
        await pool.query(
          "UPDATE template_proof_runs SET status = 'failed', completed_at = now() WHERE id = $1",
          [proofRunId]
        );
        continue;
      }
      const plan = (await planRes.json()) as { id: string };
      const planId = plan.id;

      const startRes = await fetch(`${baseUrl}/v1/plans/${planId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "sandbox" }),
      });
      if (!startRes.ok) {
        await pool.query(
          "UPDATE template_proof_runs SET status = 'failed', completed_at = now() WHERE id = $1",
          [proofRunId]
        );
        continue;
      }
      const runPayload = (await startRes.json()) as { id: string };
      const runId = runPayload.id;

      await pool.query(
        "UPDATE template_proof_runs SET run_id = $2 WHERE id = $1",
        [proofRunId, runId]
      );

      const deadline = Date.now() + RUN_TIMEOUT_MS;
      let status: string = "running";
      while (Date.now() < deadline) {
        const statusRes = await fetch(`${baseUrl}/v1/runs/${runId}/status`);
        if (statusRes.ok) {
          const s = (await statusRes.json()) as { status: string };
          status = s.status;
          if (status === "succeeded" || status === "failed") break;
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
      if (status !== "succeeded" && status !== "failed") status = "timed_out";

      let artifactCount = 0;
      let proofStatus = status;
      if (status === "succeeded") {
        const runRes = await fetch(`${baseUrl}/v1/runs/${runId}`);
        if (runRes.ok) {
          const runData = (await runRes.json()) as { artifacts?: { id: string; artifact_type?: string; artifact_class?: string }[] };
          const artifacts = runData.artifacts ?? [];
          artifactCount = artifacts.length;
          // Analyze email artifact to verify template loaded properly (self-heal)
          const emailArtifact = artifacts.find(
            (a) => a.artifact_type === "email_template" || a.artifact_class === "email_template"
          ) ?? (artifacts.length === 1 ? artifacts[0] : null);
          if (emailArtifact?.id) {
            try {
              const analyzeRes = await fetch(`${baseUrl}/v1/artifacts/${emailArtifact.id}/analyze`);
              if (analyzeRes.ok) {
                const analysis = (await analyzeRes.json()) as { passed: boolean; issues?: unknown[]; summary?: string };
                if (!analysis.passed) {
                  proofStatus = "failed";
                  if (process.env.NODE_ENV !== "test") {
                    console.warn("[template-proof] Artifact analysis failed:", analysis.summary ?? analysis.issues);
                  }
                }
              }
            } catch (e) {
              if (process.env.NODE_ENV !== "test") console.warn("[template-proof] Analyze request failed:", (e as Error).message);
            }
          }
        }
        // Ingest Render logs for this run so Validations tab and log-based checks are populated
        try {
          const runRow = await pool.query("SELECT created_at, updated_at FROM runs WHERE id = $1", [runId]);
          if (runRow.rows.length > 0) {
            const { ingestRunLogsOneOff } = await import("./render-log-ingest.js");
            await ingestRunLogsOneOff(runId, runRow.rows[0] as { created_at: Date; updated_at: Date });
          }
        } catch {
          // Log ingest optional (e.g. RENDER_API_KEY not set)
        }
      }

      await pool.query(
        `UPDATE template_proof_runs SET status = $2, artifact_count = $3, completed_at = now() WHERE id = $1`,
        [proofRunId, proofStatus, artifactCount]
      );
    } catch (e) {
      await pool.query(
        `UPDATE template_proof_runs SET status = 'failed', completed_at = now() WHERE id = $1`,
        [proofRunId]
      );
    }
  }

  await pool.query(
    `UPDATE template_proof_batches SET status = 'completed', completed_at = now() WHERE id = $1`,
    [batchId]
  );
}
