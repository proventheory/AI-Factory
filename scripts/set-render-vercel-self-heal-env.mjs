#!/usr/bin/env node
/**
 * Set self-heal env vars on the Control Plane (ai-factory-api-staging) via Render API.
 * Run from repo root with .env loaded so RENDER_API_KEY, VERCEL_TOKEN (if present) are pushed.
 *
 *   node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs
 *   # or: node -r dotenv/config scripts/set-render-vercel-self-heal-env.mjs
 *
 * Sets on Render (Control Plane):
 *   ENABLE_SELF_HEAL = true
 *   RENDER_API_KEY = (from env) — REQUIRED for deploy-failure self-heal (api/gateway/runner)
 *   RENDER_STAGING_SERVICE_IDS = api,gateway,runner IDs — so all three are monitored every 5 min
 *   VERCEL_PROJECT_IDS = ai-factory-console
 *   VERCEL_TOKEN = (from env, if set)
 */
import "dotenv/config";

const RENDER_API_BASE = "https://api.render.com/v1";
const CONTROL_PLANE_STAGING_SERVICE_ID = "srv-d6ka7mhaae7s73csv3fg"; // ai-factory-api-staging
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

async function main() {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is not set. Run with: node --env-file=.env scripts/set-render-vercel-self-heal-env.mjs");
    process.exit(1);
  }

  const updates = [
    { key: "ENABLE_SELF_HEAL", value: "true" },
    { key: "RENDER_API_KEY", value: apiKey },
    { key: "RENDER_STAGING_SERVICE_IDS", value: process.env.RENDER_STAGING_SERVICE_IDS?.trim() || STAGING_IDS },
    { key: "VERCEL_PROJECT_IDS", value: process.env.VERCEL_PROJECT_IDS?.trim() || "ai-factory-console" },
  ];
  const token = process.env.VERCEL_TOKEN?.trim();
  if (token) {
    updates.push({ key: "VERCEL_TOKEN", value: token });
  } else {
    console.warn("VERCEL_TOKEN not set in env. Vercel redeploy self-heal will not run until you set it on Render (or in .env and re-run this script).");
  }

  for (const { key, value } of updates) {
    await setEnvVar(apiKey, CONTROL_PLANE_STAGING_SERVICE_ID, key, value);
    console.log("Set", key, "=", key === "VERCEL_TOKEN" || key === "RENDER_API_KEY" ? "***" : value);
  }

  console.log("Done. Control Plane will redeploy on Render. Next 5-min scan will:");
  console.log("  - Deploy-failure: check api + gateway + runner and trigger redeploy if failed/canceled.");
  console.log("  - Vercel: check Console project and trigger redeploy if ERROR/CANCELED (when VERCEL_TOKEN is set).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
