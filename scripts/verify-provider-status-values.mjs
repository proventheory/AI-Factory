#!/usr/bin/env node
/**
 * Verify what Render and Vercel APIs actually return for deploy status/state.
 * Run from repo root with .env loaded so we use real responses — no guessing.
 *
 *   node --env-file=.env scripts/verify-provider-status-values.mjs
 *
 * Prints the raw status (Render) and state (Vercel) values from the latest deploy(s).
 * Compare with FAILED_STATUSES (Render) and FAILED_STATES (Vercel) in the control-plane
 * self-heal code and with docs/SELF_HEAL_PROVIDER_STATUS_REFERENCE.md.
 */
import "dotenv/config";

const RENDER_API_BASE = "https://api.render.com/v1";
const STAGING_IDS = [
  "srv-d6ka7mhaae7s73csv3fg", // api
  "srv-d6l25d1aae7s73ftpvlg", // gateway
  "srv-d6oig7450q8c73ca40q0", // runner
];

function getVercelToken() {
  return process.env.VERCEL_TOKEN?.trim() || process.env.VERCEL_API_TOKEN?.trim();
}

async function main() {
  console.log("=== Provider status verification (what each system actually returns) ===\n");

  // ---- Render ----
  const renderKey = process.env.RENDER_API_KEY?.trim();
  if (!renderKey) {
    console.log("Render: RENDER_API_KEY not set, skipping.");
  } else {
    console.log("Render (GET /v1/services/{id}/deploys?limit=2)");
    console.log("Official reference: https://api-docs.render.com/reference/list-deploys");
    for (const serviceId of STAGING_IDS) {
      try {
        const res = await fetch(`${RENDER_API_BASE}/services/${serviceId}/deploys?limit=2`, {
          headers: { Accept: "application/json", Authorization: `Bearer ${renderKey}` },
        });
        const raw = await res.json();
        const arr = Array.isArray(raw) ? raw : raw?.deploys ?? [];
        const statuses = arr.map((item) => {
          const d = item.deploy ?? item;
          return { id: d.id, status: d.status, commit: d.commit?.id ?? d.commit };
        });
        console.log(`  ${serviceId}: status values =`, statuses.map((s) => s.status).join(", ") || "(none)");
        const known = ["live", "deactivated", "build_in_progress", "update_in_progress", "queued", "failed", "canceled", "build_failed"];
        if (statuses.length && statuses.some((s) => !known.includes(s.status))) {
          console.log("  ^^^ Unknown status — add to FAILED_STATUSES in deploy-failure-self-heal.ts if it indicates failure, and to docs.");
        }
      } catch (e) {
        console.log(`  ${serviceId}: error`, e.message);
      }
    }
    console.log("  Our FAILED_STATUSES (control-plane): failed, canceled, build_failed\n");
  }

  // ---- Vercel ----
  const vercelToken = getVercelToken();
  const projectId = process.env.VERCEL_PROJECT_IDS?.trim()?.split(",")[0] || "ai-factory-console";
  if (!vercelToken) {
    console.log("Vercel: VERCEL_TOKEN / VERCEL_API_TOKEN not set, skipping.");
  } else {
    console.log("Vercel (GET /v6/deployments?projectId=...&limit=2)");
    console.log("Official reference: https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments");
    console.log("  state enum per Vercel API: BUILDING, ERROR, INITIALIZING, QUEUED, READY, CANCELED, DELETED");
    try {
      const url = new URL("https://api.vercel.com/v6/deployments");
      url.searchParams.set("projectId", projectId);
      url.searchParams.set("limit", "2");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${vercelToken}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      const list = data.deployments ?? [];
      const states = list.map((d) => ({ uid: d.uid, state: d.state }));
      console.log(`  projectId=${projectId}: state values =`, states.map((s) => s.state).join(", ") || "(none)");
      if (states.length && states.some((s) => !["BUILDING", "ERROR", "INITIALIZING", "QUEUED", "READY", "CANCELED", "DELETED"].includes(s.state))) {
        console.log("  ^^^ Unknown state — add to FAILED_STATES if it indicates failure.");
      }
    } catch (e) {
      console.log("  error", e.message);
    }
    console.log("  Our FAILED_STATES (control-plane): ERROR, CANCELED\n");
  }

  console.log("See docs/SELF_HEAL_PROVIDER_STATUS_REFERENCE.md for canonical list and verification notes.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
