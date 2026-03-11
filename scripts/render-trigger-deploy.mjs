#!/usr/bin/env node
/**
 * Trigger a deploy for a Render service via API.
 * Usage: RENDER_API_KEY=xxx node scripts/render-trigger-deploy.mjs [serviceId]
 * Default serviceId: srv-d6l0ba7gi27c738vbqog (ai-factory-runner-staging)
 */
import "dotenv/config";

const serviceId = process.argv[2] || process.env.RENDER_RUNNER_SERVICE_ID || "srv-d6l0ba7gi27c738vbqog";
const apiKey = process.env.RENDER_API_KEY;
if (!apiKey?.trim()) {
  console.error("RENDER_API_KEY is not set");
  process.exit(1);
}

const res = await fetch(`https://api.render.com/v1/services/${serviceId}/deploys`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({ clearCache: "do_not_clear" }),
});

if (!res.ok) {
  const text = await res.text();
  console.error("Render API error:", res.status, text);
  process.exit(1);
}
const data = await res.json();
console.log("Deploy triggered:", data.id, data.status || "");
console.log("Dashboard:", data.service?.dashboardUrl || `https://dashboard.render.com/worker/${serviceId}`);
