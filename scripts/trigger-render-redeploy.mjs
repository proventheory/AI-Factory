#!/usr/bin/env node
/**
 * Trigger a redeploy (with cache clear) for one or all staging Render services.
 * Use when a deploy failed and self-heal hasn't run yet, or to force a fresh deploy.
 *
 *   node --env-file=.env scripts/trigger-render-redeploy.mjs                    # redeploy staging API only
 *   node --env-file=.env scripts/trigger-render-redeploy.mjs --all             # redeploy api + gateway + runner
 *   node --env-file=.env scripts/trigger-render-redeploy.mjs --service srv-xxx # redeploy one service by ID
 */
import "dotenv/config";

const RENDER_API_BASE = "https://api.render.com/v1";
const STAGING_API_SERVICE_ID = "srv-d6ka7mhaae7s73csv3fg";   // ai-factory-api-staging
const STAGING_GATEWAY_SERVICE_ID = "srv-d6l25d1aae7s73ftpvlg"; // ai-factory-gateway-staging
const STAGING_RUNNER_SERVICE_ID = "srv-d6oig7450q8c73ca40q0"; // ai-factory-runner-staging
const STAGING_IDS = [STAGING_API_SERVICE_ID, STAGING_GATEWAY_SERVICE_ID, STAGING_RUNNER_SERVICE_ID];

async function triggerDeploy(apiKey, serviceId, clearCache = true) {
  const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ clearCache: clearCache ? "clear" : "do_not_clear" }),
  });
  if (!res.ok) throw new Error(`Render API trigger deploy failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const apiKey = process.env.RENDER_API_KEY?.trim();
  if (!apiKey) {
    console.error("RENDER_API_KEY is not set. Run with: node --env-file=.env scripts/trigger-render-redeploy.mjs");
    process.exit(1);
  }

  const all = process.argv.includes("--all");
  const serviceArg = process.argv.find((a) => a.startsWith("--service="));
  const serviceId = serviceArg ? serviceArg.split("=")[1] : null;

  const ids = serviceId ? [serviceId] : all ? STAGING_IDS : [STAGING_API_SERVICE_ID];

  for (const id of ids) {
    try {
      const data = await triggerDeploy(apiKey, id, true);
      console.log("Triggered redeploy (clear cache) for", id, "→ deploy id:", data.id ?? data.deploy?.id ?? "—");
    } catch (err) {
      console.error("Failed to trigger redeploy for", id, ":", err.message);
      process.exitCode = 1;
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
