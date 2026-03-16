#!/usr/bin/env node
/**
 * One-shot: trigger staging deploy (api + gateway + runner), wait for live, then run DB migrate.
 * Use for autonomous "deploy and migrate" so Supabase migrations and Render are in sync.
 *
 * Usage: node --env-file=.env scripts/deploy-staging-and-migrate.mjs [--no-wait] [--clear]
 *   --no-wait  Skip waiting for deploys; run migrate immediately after triggering.
 *   --clear    Clear build cache when deploying.
 */
import "dotenv/config";
import { execSync, spawnSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const STAGING_IDS = [
  "srv-d6ka7mhaae7s73csv3fg", // ai-factory-api-staging
  "srv-d6l25d1aae7s73ftpvlg", // ai-factory-gateway-staging
  "srv-d6oig7450q8c73ca40q0", // ai-factory-runner-staging
];

const argv = process.argv.slice(2);
const noWait = argv.includes("--no-wait");
const clear = argv.includes("--clear");
const apiKey = process.env.RENDER_API_KEY?.trim();
if (!apiKey) {
  console.error("RENDER_API_KEY is not set (use .env or --env-file=.env)");
  process.exit(1);
}

function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// 1) Trigger deploy
const deployArgs = ["scripts/render-trigger-deploy.mjs", "--staging"];
if (clear) deployArgs.push("--clear");
run("node", deployArgs);

if (noWait) {
  console.log("Skipping wait (--no-wait). Running migrate.");
} else {
  // 2) Wait for all three services to have latest deploy status 'live' (or timeout)
  const maxWaitMs = 10 * 60 * 1000;
  const pollMs = 30 * 1000;
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    let allLive = true;
    for (const serviceId of STAGING_IDS) {
      const res = await fetch(
        `https://api.render.com/v1/services/${serviceId}/deploys?limit=1`,
        { headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` } }
      );
      if (!res.ok) {
        allLive = false;
        break;
      }
      const data = await res.json();
      const status = data[0]?.status;
      if (status !== "live") allLive = false;
    }
    if (allLive) {
      console.log("All staging deploys are live.");
      break;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// 3) Run migrate (uses DATABASE_URL from env)
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set; skipping migrate. Set it in .env for full flow.");
  process.exit(0);
}
run("node", ["--env-file=.env", "scripts/run-migrate.mjs"]);
