#!/usr/bin/env node
/**
 * Set self-heal env vars on the Control Plane via Render API.
 * Run from repo root with .env loaded so RENDER_API_KEY, VERCEL_TOKEN (if present) are pushed.
 *
 *   node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs           # staging only
 *   node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs --prod    # staging + prod
 *
 * If RENDER_PROD_API_SERVICE_ID is set: also sets the same vars on the backup Control Plane
 * (Render service ai-factory-api-prod). That service's 5-min scan then monitors staging;
 * when both api-staging and runner-staging are down, the backup triggers staging redeploys.
 * Everything is staging today; the backup is just the healer instance.
 *
 * Sets on Render (Control Plane):
 *   ENABLE_SELF_HEAL = true
 *   RENDER_API_KEY = (from env)
 *   RENDER_STAGING_SERVICE_IDS = api,gateway,runner IDs (staging) — monitored every 5 min
 *   VERCEL_PROJECT_IDS, VERCEL_TOKEN (optional)
 */
import "dotenv/config";

/** Same token as Terraform (VERCEL_API_TOKEN); Control Plane expects VERCEL_TOKEN. */
function getVercelToken() {
  return process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
}

const RENDER_API_BASE = "https://api.render.com/v1";
const CONTROL_PLANE_STAGING_SERVICE_ID = "srv-d6ka7mhaae7s73csv3fg"; // ai-factory-api-staging
const RUNNER_STAGING_SERVICE_ID = "srv-d6oig7450q8c73ca40q0"; // ai-factory-runner-staging (web)
const STAGING_IDS = "srv-d6ka7mhaae7s73csv3fg,srv-d6l25d1aae7s73ftpvlg,srv-d6oig7450q8c73ca40q0"; // api, gateway, runner

async function setEnvVar(apiKey, serviceId, key, value) {
  const res = await fetch(
    `${RENDER_API_BASE}/services/${serviceId}/env-vars/${encodeURIComponent(key)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ value }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Render API set ${key}: ${res.status} ${text}`);
  }
}

async function pushToService(apiKey, serviceId, updates, label) {
  for (const { key, value } of updates) {
    await setEnvVar(apiKey, serviceId, key, value);
    console.log(`[${label}] Set`, key, "=", key === "VERCEL_TOKEN" || key === "RENDER_API_KEY" ? "***" : value);
  }
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is not set. Run with: node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs");
    process.exit(1);
  }

  const stagingIds = process.env.RENDER_STAGING_SERVICE_IDS?.trim() || STAGING_IDS;
  const updates = [
    { key: "ENABLE_SELF_HEAL", value: "true" },
    { key: "RENDER_API_KEY", value: apiKey },
    { key: "RENDER_STAGING_SERVICE_IDS", value: stagingIds },
    { key: "VERCEL_PROJECT_IDS", value: process.env.VERCEL_PROJECT_IDS?.trim() || "ai-factory-console" },
  ];
  const token = getVercelToken();
  if (token) {
    updates.push({ key: "VERCEL_TOKEN", value: token });
  } else {
    console.warn("VERCEL_TOKEN / VERCEL_API_TOKEN not set. Vercel redeploy self-heal will not run until set on Render.");
  }

  // Staging Control Plane: so staging can self-heal when staging is up
  await pushToService(apiKey, CONTROL_PLANE_STAGING_SERVICE_ID, updates, "staging-api");
  // Staging Runner: when api-staging is down, runner's 5-min scan can still trigger redeploys for api/gateway/runner
  await pushToService(apiKey, RUNNER_STAGING_SERVICE_ID, updates, "staging-runner");
  console.log("Staging: done. API and runner both run 5-min deploy-failure scan; when API is down, runner heals.");

  // Backup Control Plane (ai-factory-api-prod): when BOTH api-staging and runner-staging are down, only this service can trigger staging redeploys.
  const backupServiceId = process.env.RENDER_PROD_API_SERVICE_ID?.trim();
  const wantBackup = process.argv.includes("--prod") || !!backupServiceId;
  if (wantBackup && backupServiceId) {
    await pushToService(apiKey, backupServiceId, updates, "backup (api-prod)");
    console.log("Backup Control Plane: done. When both api-staging and runner are down, its 5-min scan will trigger staging redeploys.");
  } else if (!backupServiceId) {
    console.log("");
    console.log("Optional: when BOTH api-staging and runner are down, set backup healer and re-run:");
    console.log("  RENDER_PROD_API_SERVICE_ID=<ai-factory-api-prod service id from Render Dashboard>");
    console.log("  node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
