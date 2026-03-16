#!/usr/bin/env node
/**
 * Trigger a Vercel redeploy for the Console (or VERCEL_PROJECT_IDS).
 * Usage: node --env-file=.env scripts/vercel-redeploy.mjs
 */
import "dotenv/config";

const token = process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
const projectId = process.env.VERCEL_PROJECT_IDS?.trim()?.split(",")[0] || process.env.VERCEL_PROJECT_ID?.trim() || "ai-factory-console";
const teamId = process.env.VERCEL_TEAM_ID?.trim() || undefined;

if (!token) {
  console.error("VERCEL_TOKEN or VERCEL_API_TOKEN required");
  process.exit(1);
}

async function main() {
  const listUrl = new URL("https://api.vercel.com/v6/deployments");
  listUrl.searchParams.set("projectId", projectId);
  listUrl.searchParams.set("limit", "1");
  if (teamId) listUrl.searchParams.set("teamId", teamId);

  const listRes = await fetch(listUrl.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    console.error("Vercel list deployments failed:", listRes.status, await listRes.text());
    process.exit(1);
  }
  const listData = await listRes.json();
  const deployments = listData.deployments ?? [];
  const latest = deployments[0];
  if (!latest?.uid) {
    console.error("No deployment found for project", projectId);
    process.exit(1);
  }

  const deployUrl = new URL("https://api.vercel.com/v13/deployments");
  if (teamId) deployUrl.searchParams.set("teamId", teamId);
  const redeployRes = await fetch(deployUrl.toString(), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      deploymentId: latest.uid,
      name: projectId,
    }),
  });
  if (!redeployRes.ok) {
    console.error("Vercel redeploy failed:", redeployRes.status, await redeployRes.text());
    process.exit(1);
  }
  const data = await redeployRes.json();
  console.log("Vercel redeploy triggered:", data.id ?? data.uid ?? data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
