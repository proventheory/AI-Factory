#!/usr/bin/env node
/**
 * Set self-heal env vars on the Control Plane via Render API.
 * Run from repo root with .env loaded so RENDER_API_KEY, VERCEL_TOKEN (if present) are pushed.
 *
 *   node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs
 *
 * Pushes to three services so staging always self-heals even when fully down:
 *   - staging API + staging runner: when one is up, it can trigger redeploys for the other.
 *   - api-prod (backup healer): when BOTH api-staging and runner-staging are down, prod's
 *     5-min scan triggers staging redeploys. No --prod flag needed; we always push to prod.
 *
 * Sets on each: ENABLE_SELF_HEAL=true, RENDER_API_KEY, RENDER_STAGING_SERVICE_IDS (staging IDs), DATABASE_URL (staging services), VERCEL_* (optional).
 * When ALLOW_SELF_HEAL_PUSH and GITHUB_* are in .env: Control Plane gets ALLOW_SELF_HEAL_PUSH; Runner gets GITHUB_TOKEN + GITHUB_REPOSITORY for push_fix.
 * CRITICAL: Staging API and runner must have DATABASE_URL pointing at the same DB where migrations run, or runtime fails with "relation runs/job_claims does not exist".
 */
import "dotenv/config";

/** Same token as Terraform (VERCEL_API_TOKEN); Control Plane expects VERCEL_TOKEN. */
function getVercelToken() {
  return process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
}

const RENDER_API_BASE = "https://api.render.com/v1";
const CONTROL_PLANE_STAGING_SERVICE_ID = "srv-d6ka7mhaae7s73csv3fg"; // ai-factory-api-staging
const CONTROL_PLANE_PROD_SERVICE_ID = "srv-d6ka7mhaae7s73csv3h0";   // ai-factory-api-prod (backup healer)
const RUNNER_STAGING_SERVICE_ID = "srv-d6oig7450q8c73ca40q0";       // ai-factory-runner-staging (web; runs 5-min scan)
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

function maskSecret(key, value) {
  if (["VERCEL_TOKEN", "RENDER_API_KEY", "DATABASE_URL", "GITHUB_TOKEN"].includes(key)) return "***";
  return value;
}

async function pushToService(apiKey, serviceId, updates, label) {
  for (const { key, value } of updates) {
    await setEnvVar(apiKey, serviceId, key, value);
    console.log(`[${label}] Set`, key, "=", maskSecret(key, value));
  }
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is not set. Run with: node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs");
    process.exit(1);
  }

  const stagingIds = process.env.RENDER_STAGING_SERVICE_IDS?.trim() || STAGING_IDS;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const databaseUrlProd = process.env.DATABASE_URL_PROD?.trim();

  const updatesStaging = [
    { key: "ENABLE_SELF_HEAL", value: "true" },
    { key: "RENDER_API_KEY", value: apiKey },
    { key: "RENDER_STAGING_SERVICE_IDS", value: stagingIds },
    { key: "VERCEL_PROJECT_IDS", value: process.env.VERCEL_PROJECT_IDS?.trim() || "ai-factory-console" },
  ];
  if (databaseUrl) {
    updatesStaging.push({ key: "DATABASE_URL", value: databaseUrl });
  } else {
    console.warn("DATABASE_URL not set in .env. Staging services need it or runtime fails with 'relation runs/job_claims does not exist'.");
  }
  const token = getVercelToken();
  if (token) {
    updatesStaging.push({ key: "VERCEL_TOKEN", value: token });
  } else {
    console.warn("VERCEL_TOKEN / VERCEL_API_TOKEN not set. Vercel redeploy self-heal will not run until set on Render.");
  }
  if (process.env.ALLOW_SELF_HEAL_PUSH === "true") {
    updatesStaging.push({ key: "ALLOW_SELF_HEAL_PUSH", value: "true" });
  }
  const githubToken = process.env.GITHUB_TOKEN?.trim();
  const githubRepo = process.env.GITHUB_REPOSITORY?.trim();
  if (githubToken) updatesStaging.push({ key: "GITHUB_TOKEN", value: githubToken });
  if (githubRepo) updatesStaging.push({ key: "GITHUB_REPOSITORY", value: githubRepo });

  // Staging Control Plane: so staging can self-heal when staging is up; DATABASE_URL = same DB as migrations
  await pushToService(apiKey, CONTROL_PLANE_STAGING_SERVICE_ID, updatesStaging, "staging-api");
  // Staging Runner: when api-staging is down, runner's 5-min scan can still trigger redeploys; same DATABASE_URL
  await pushToService(apiKey, RUNNER_STAGING_SERVICE_ID, updatesStaging, "staging-runner");
  console.log("Staging: done. API and runner both run 5-min deploy-failure scan and use DATABASE_URL for migrations/runtime.");

  // Backup healer (ai-factory-api-prod): ALWAYS push so when BOTH api-staging and runner-staging are down, prod triggers staging redeploys. Use prod DB.
  const backupServiceId = process.env.RENDER_PROD_API_SERVICE_ID?.trim() || CONTROL_PLANE_PROD_SERVICE_ID;
  const updatesProd = [
    { key: "ENABLE_SELF_HEAL", value: "true" },
    { key: "RENDER_API_KEY", value: apiKey },
    { key: "RENDER_STAGING_SERVICE_IDS", value: stagingIds },
    { key: "VERCEL_PROJECT_IDS", value: process.env.VERCEL_PROJECT_IDS?.trim() || "ai-factory-console" },
  ];
  if (databaseUrlProd) {
    updatesProd.push({ key: "DATABASE_URL", value: databaseUrlProd });
  }
  if (token) updatesProd.push({ key: "VERCEL_TOKEN", value: token });
  if (process.env.ALLOW_SELF_HEAL_PUSH === "true") {
    updatesProd.push({ key: "ALLOW_SELF_HEAL_PUSH", value: "true" });
  }
  await pushToService(apiKey, backupServiceId, updatesProd, "backup (api-prod)");
  console.log("Backup healer: done. When both api-staging and runner are down, api-prod's 5-min scan will trigger staging redeploys.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
