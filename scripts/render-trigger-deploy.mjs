#!/usr/bin/env node
/**
 * Trigger a deploy for Render service(s) via API.
 * Usage:
 *   RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs [serviceId]
 *   RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --clear [serviceId]
 *   RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --staging   # api + gateway + runner (web)
 *   RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs --staging --clear
 * Default serviceId: srv-d6l0ba7gi27c738vbqog (ai-factory-runner-staging)
 */
import "dotenv/config";

const STAGING_IDS = [
  "srv-d6ka7mhaae7s73csv3fg", // ai-factory-api-staging
  "srv-d6l25d1aae7s73ftpvlg", // ai-factory-gateway-staging
  "srv-d6oig7450q8c73ca40q0", // ai-factory-runner-staging (web)
];

const argv = process.argv.slice(2);
const clearCache = argv.includes("--clear");
const staging = argv.includes("--staging");
const serviceIds = staging
  ? STAGING_IDS
  : [argv.find((a) => !a.startsWith("--")) || process.env.RENDER_RUNNER_SERVICE_ID || "srv-d6l0ba7gi27c738vbqog"];

const apiKey = process.env.RENDER_API_KEY;
if (!apiKey?.trim()) {
  console.error("RENDER_API_KEY is not set");
  process.exit(1);
}

const body = { clearCache: clearCache ? "clear" : "do_not_clear" };

for (const serviceId of serviceIds) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(serviceId, "Render API error:", res.status, text);
    continue;
  }
  let data = {};
  try {
    if (text && text.trim()) data = JSON.parse(text);
  } catch (_) {
    // empty or non-JSON response
  }
  console.log(serviceId, "Deploy triggered:", data.id || res.status, data.status || "");
}
