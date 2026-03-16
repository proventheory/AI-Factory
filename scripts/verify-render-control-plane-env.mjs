#!/usr/bin/env node
/**
 * Verify Control Plane (ai-factory-api-staging) env vars on Render via API.
 * Run from repo root: node --env-file=.env scripts/verify-render-control-plane-env.mjs
 *
 * GET /v1/services/{serviceId}/env-vars — lists keys (values may be masked by Render).
 */
import "dotenv/config";

const RENDER_API_BASE = "https://api.render.com/v1";
const CONTROL_PLANE_STAGING_SERVICE_ID = "srv-d6ka7mhaae7s73csv3fg"; // ai-factory-api-staging

const REQUIRED_KEYS = [
  "ENABLE_SELF_HEAL",
  "RENDER_API_KEY",
  "RENDER_STAGING_SERVICE_IDS",
  "VERCEL_PROJECT_IDS",
];
const OPTIONAL_KEYS = ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "RENDER_WORKER_SERVICE_ID"];

async function main() {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is not set. Run with: node --env-file=.env scripts/verify-render-control-plane-env.mjs");
    process.exit(1);
  }

  const res = await fetch(
    `${RENDER_API_BASE}/services/${CONTROL_PLANE_STAGING_SERVICE_ID}/env-vars`,
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );

  if (!res.ok) {
    console.error("Render API error:", res.status, await res.text());
    process.exit(1);
  }

  const data = await res.json();
  const envVars = Array.isArray(data) ? data : data.envVars || data.items || [];
  const keys = envVars.map((e) => {
    if (typeof e === "string") return e;
    const envVar = e.envVar || e;
    return envVar.key ?? envVar.envVarKey;
  }).filter(Boolean);

  console.log("Control Plane (ai-factory-api-staging) env vars on Render:");
  console.log("  Total keys present:", keys.length);
  console.log("");

  const missing = REQUIRED_KEYS.filter((k) => !keys.includes(k));
  const presentRequired = REQUIRED_KEYS.filter((k) => keys.includes(k));
  const presentOptional = OPTIONAL_KEYS.filter((k) => keys.includes(k));

  for (const k of presentRequired) {
    console.log("  [OK]  ", k);
  }
  for (const k of presentOptional) {
    console.log("  [opt] ", k);
  }
  for (const k of missing) {
    console.log("  [MISS]", k);
  }

  if (missing.length > 0) {
    console.log("");
    console.error("Missing required keys for self-heal. Run: node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs");
    process.exit(1);
  }

  console.log("");
  console.log("All required self-heal vars are set.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
