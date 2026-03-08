#!/usr/bin/env node
/**
 * Generate one email for Sticky Green using the "Stitch (1 image, 2 products)" template.
 * Creates campaign → plan → start run → polls until done → prints artifact.
 *
 * Prerequisites:
 * - Control Plane running (default http://localhost:3001)
 * - Runner running and polling the Control Plane (or use staging API + Render runner)
 * - Sticky Green brand exists (node scripts/seed-brand-sticky-green.mjs)
 * - Stitch template exists (node scripts/seed-email-templates.mjs)
 *
 * Usage:
 *   CONTROL_PLANE_URL=http://localhost:3001 node scripts/test-stitch-email-sticky-green.mjs
 *   # or against staging:
 *   CONTROL_PLANE_URL=https://ai-factory-api-staging.onrender.com node scripts/test-stitch-email-sticky-green.mjs
 */

import "dotenv/config";

const API = (process.env.CONTROL_PLANE_URL ?? process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001").replace(
  /\/$/,
  ""
);
const POLL_MS = 5000;
const TIMEOUT_MS = 180 * 1000; // 3 min

async function request(method, path, body = null) {
  const url = `${API}${path}`;
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    throw new Error(data?.error ?? data?.raw ?? `HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return data;
}

async function main() {
  console.log("Control Plane:", API);
  console.log("");

  // 1. Resolve Sticky Green brand
  const brandsRes = await request("GET", "/v1/brand_profiles?search=sticky-green&limit=5");
  const brands = brandsRes.items ?? [];
  const stickyGreen = brands.find((b) => (b.slug ?? "").toLowerCase().includes("sticky-green") || (b.name ?? "").toLowerCase().includes("sticky green"));
  if (!stickyGreen?.id) {
    throw new Error(
      "Sticky Green brand not found. Create it with: node scripts/seed-brand-sticky-green.mjs " + API
    );
  }
  const brandProfileId = stickyGreen.id;
  console.log("Brand: Sticky Green", brandProfileId);

  // 2. Resolve Stitch template
  const templatesRes = await request("GET", "/v1/email_templates?limit=100");
  const templates = templatesRes.items ?? [];
  const stitch = templates.find(
    (t) => (t.name ?? "").toLowerCase().includes("stitch") && (t.name ?? "").includes("2 products")
  );
  if (!stitch?.id) {
    throw new Error(
      'Template "Stitch (1 image, 2 products)" not found. Seed with: node scripts/seed-email-templates.mjs ' + API
    );
  }
  const templateId = stitch.id;
  console.log("Template:", stitch.name, templateId);
  console.log("");

  // 3. Create campaign (initiative)
  const campaign = await request("POST", "/v1/email_campaigns", {
    brand_profile_id: brandProfileId,
    template_id: templateId,
    title: "Test: Stitch + Sticky Green",
    metadata_json: { campaign_prompt: "proof run" },
  });
  const initiativeId = campaign.id;
  if (!initiativeId) throw new Error("No campaign id: " + JSON.stringify(campaign));
  console.log("Campaign created:", initiativeId);

  // 4. Compile plan
  const planRes = await request("POST", `/v1/initiatives/${initiativeId}/plan`, {});
  const planId = planRes.id;
  if (!planId) throw new Error("No plan id: " + JSON.stringify(planRes));
  console.log("Plan:", planId);

  // 5. Start run
  const startRes = await request("POST", `/v1/plans/${planId}/start`, { environment: "sandbox" });
  const runId = startRes.id;
  if (!runId) throw new Error("No run id: " + JSON.stringify(startRes));
  console.log("Run started:", runId);
  console.log("Polling run status (interval %ds, timeout %ds)...", POLL_MS / 1000, TIMEOUT_MS / 1000);

  // 6. Poll run status
  const deadline = Date.now() + TIMEOUT_MS;
  let statusRes;
  for (;;) {
    if (Date.now() >= deadline) {
      throw new Error("Run did not complete within " + TIMEOUT_MS / 1000 + "s. Check runner and logs.");
    }
    statusRes = await request("GET", `/v1/runs/${runId}/status`);
    const status = statusRes.status ?? statusRes;
    if (status === "succeeded" || status === "failed" || status === "cancelled") {
      console.log("Run status:", status);
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }

  if ((statusRes.status ?? statusRes) === "failed") {
    console.error("Run failed. Check run logs: GET", `${API}/v1/runs/${runId}/log_entries`);
    process.exit(1);
  }

  // 7. Fetch artifacts
  const artifactsRes = await request("GET", `/v1/runs/${runId}/artifacts`);
  const artifacts = artifactsRes.artifacts ?? artifactsRes.items ?? [];
  const emailArtifact = artifacts.find(
    (a) => (a.artifact_type ?? a.type ?? "").toLowerCase().includes("email") || (a.name ?? "").toLowerCase().includes("email")
  ) ?? artifacts[0];

  if (!emailArtifact) {
    console.log("No artifacts in run. Artifacts response:", JSON.stringify(artifactsRes, null, 2).slice(0, 500));
    process.exit(1);
  }

  const signedUrl = emailArtifact.signed_url ?? emailArtifact.url ?? emailArtifact.uri;
  console.log("");
  console.log("Email artifact:", emailArtifact.id ?? emailArtifact.name ?? "email_template");
  if (signedUrl) {
    console.log("Preview URL:", signedUrl);
  }
  console.log("");
  console.log("Done. Run ID:", runId, "— open in Console (Pipeline Runs or Template Proofing) to view the generated email.");
}

main().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});
