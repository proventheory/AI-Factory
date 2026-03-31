#!/usr/bin/env node
/**
 * Trigger a deployment for the real ai-factory-console Vercel project (monorepo-aware).
 * Use when GitHub → Vercel did not queue a build after push (webhook gap) or you need main refreshed.
 *
 * Usage (from repo root):
 *   node --env-file=.env scripts/vercel-trigger-console-deploy.mjs
 *   node --env-file=.env scripts/vercel-trigger-console-deploy.mjs --sha <full_or_abbrev_sha>
 *
 * Requires VERCEL_API_TOKEN or VERCEL_TOKEN (same as Terraform / self-heal).
 * Optional: VERCEL_TEAM_ID (default: team linked to proventheorys-projects console),
 *            VERCEL_CONSOLE_PROJECT_ID (default: prj_zCNlTcqEF8NACsQEFclXk1nd3L2F).
 *
 * Do NOT run `vercel deploy` only inside `console/` without linking the monorepo project —
 * that uploads a partial tree and breaks `file:../packages/ui`.
 */
import "dotenv/config";

const DEFAULT_TEAM = process.env.VERCEL_TEAM_ID?.trim() || "team_nlopgmQV0uhSyXiSO0Ql6Gl3";
const DEFAULT_PROJECT = process.env.VERCEL_CONSOLE_PROJECT_ID?.trim() || "prj_zCNlTcqEF8NACsQEFclXk1nd3L2F";
const REPO_ID = 1172900787; // proventheory/AI-Factory

const token = process.env.VERCEL_API_TOKEN?.trim() || process.env.VERCEL_TOKEN?.trim();
if (!token) {
  console.error("VERCEL_API_TOKEN or VERCEL_TOKEN is not set");
  process.exit(1);
}

const argv = process.argv.slice(2);
const shaIdx = argv.indexOf("--sha");
const ref = shaIdx >= 0 && argv[shaIdx + 1] ? argv[shaIdx + 1].trim() : "main";

const body = {
  name: "ai-factory-console",
  project: DEFAULT_PROJECT,
  gitSource: {
    type: "github",
    ref,
    repoId: REPO_ID,
  },
};

const url = `https://api.vercel.com/v13/deployments?teamId=${encodeURIComponent(DEFAULT_TEAM)}`;
const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error("Vercel API error:", res.status, text);
  process.exit(1);
}
const data = JSON.parse(text);
console.log("Deploy triggered:", data.id);
console.log("URL:", data.url);
if (Array.isArray(data.alias) && data.alias[0]) console.log("Primary alias:", data.alias[0]);
