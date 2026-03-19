#!/usr/bin/env node
/**
 * Run the entire repo, Supabase, and Render setup through the Anthropic API
 * and produce a report of things to update (deps, config, security, migrations, best practices).
 *
 * Usage: node --env-file=.env scripts/anthropic-repo-supabase-render-report.mjs
 *
 * Requires: ANTHROPIC_API_KEY in env. Output: docs/ANTHROPIC_UPDATE_RECOMMENDATIONS_<YYYY-MM-DD>.md
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function loadEnv() {
  const envPath = join(root, ".env");
  if (!existsSync(envPath)) return {};
  const text = readFileSync(envPath, "utf-8");
  const out = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function safeRead(path, maxLines = 0) {
  const full = join(root, path);
  if (!existsSync(full)) return null;
  const text = readFileSync(full, "utf-8");
  if (maxLines > 0) return text.split("\n").slice(0, maxLines).join("\n");
  return text;
}

function dirTree(dir, prefix = "", maxDepth = 2, depth = 0) {
  if (depth > maxDepth) return "";
  const full = join(root, dir);
  if (!existsSync(full)) return "";
  const entries = readdirSync(full, { withFileTypes: true });
  const lines = [];
  for (const e of entries.slice(0, 80)) {
    if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      lines.push(`${prefix}${e.name}/`);
      lines.push(dirTree(path, prefix + "  ", maxDepth, depth + 1));
    } else {
      lines.push(`${prefix}${e.name}`);
    }
  }
  return lines.join("\n");
}

function buildPayload() {
  const migrationsDir = join(root, "supabase/migrations");
  const migrations = existsSync(migrationsDir)
    ? readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()
    : [];

  const runMigratePath = join(root, "scripts/run-migrate.mjs");
  let runMigrateNames = [];
  if (existsSync(runMigratePath)) {
    const content = readFileSync(runMigratePath, "utf-8");
    const names = content.match(/name:\s*["']([^"']+)["']/g) || [];
    runMigrateNames = names.map((n) => n.replace(/name:\s*["']|["']/g, ""));
  }

  const renderYaml = safeRead("render.yaml");
  const packageJson = safeRead("package.json");
  const readme = safeRead("README.md", 120);
  const operationsRunbook = safeRead("docs/OPERATIONS_RUNBOOK.md", 100);
  const contributing = safeRead("CONTRIBUTING.md", 60);
  const docsList = existsSync(join(root, "docs"))
    ? readdirSync(join(root, "docs")).filter((f) => f.endsWith(".md")).sort()
    : [];

  const topLevelDirs = readdirSync(root, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "node_modules")
    .map((d) => d.name);

  const controlPlanePkg = safeRead("control-plane/package.json");
  const runnersPkg = safeRead("runners/package.json");
  const consolePkg = safeRead("console/package.json");

  return {
    repoStructure: {
      topLevelDirs,
      treeSample: dirTree("control-plane/src", "", 1) + "\n" + dirTree("runners/src", "", 1),
    },
    render: renderYaml || "(render.yaml not found)",
    supabase: {
      migrationsCount: migrations.length,
      migrationFiles: migrations,
      runMigrateRegisteredCount: runMigrateNames.length,
      runMigrateNames: runMigrateNames.slice(-20),
    },
    rootPackageJson: packageJson ? JSON.parse(packageJson) : null,
    controlPlanePackageJson: controlPlanePkg ? JSON.parse(controlPlanePkg) : null,
    runnersPackageJson: runnersPkg ? JSON.parse(runnersPkg) : null,
    consolePackageJson: consolePkg ? JSON.parse(consolePkg) : null,
    readmeExcerpt: readme,
    operationsRunbookExcerpt: operationsRunbook,
    contributingExcerpt: contributing,
    docsList,
  };
}

async function callAnthropic(apiKey, payload) {
  const system = `You are an expert engineer reviewing a full-stack repo (AI Factory): Control Plane (Express), Console (Next.js), runners, Supabase migrations, and Render deployment. Your job is to:
1. Analyze the provided payload (repo structure, Render config, Supabase migrations, package.json files, docs excerpts).
2. Report back with specific things we should UPDATE: dependencies (outdated or security), configuration (Render, Supabase, env), migration order or gaps, security and best practices, codebase health, documentation gaps, and any inconsistencies between run-migrate.mjs and supabase/migrations.
3. Prioritize: correctness and safety first, then maintainability and performance.
4. Output a single markdown document with clear sections: Summary, Repo & Dependencies, Supabase & Migrations, Render & Deployment, Security & Env, Documentation, Recommended Actions (numbered). Be concise and actionable. When referring to files, use paths like scripts/run-migrate.mjs or docs/OPERATIONS_RUNBOOK.md. Do not suggest changing secret names or env keys; focus on structural and config improvements.`;

  const userContent = `Payload (JSON):\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nProduce the update recommendations report in markdown.`;

  const body = {
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system,
    messages: [{ role: "user", content: userContent }],
  };

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API ${res.status}: ${err.slice(0, 500)}`);
  }

  const data = await res.json();
  const block = data.content?.find((c) => c.type === "text");
  return block ? block.text : "";
}

async function main() {
  const env = loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY not set. Set it in .env or env and run again.");
    process.exit(1);
  }

  console.log("Building payload (repo, Supabase, Render)...");
  const payload = buildPayload();
  console.log(`Migrations: ${payload.supabase.migrationsCount}, Registered: ${payload.supabase.runMigrateRegisteredCount}, Docs: ${payload.docsList.length}`);

  console.log("Calling Anthropic API...");
  let report = "";
  try {
    report = await callAnthropic(apiKey, payload);
  } catch (e) {
    report = `## API error\n\n\`\`\`\n${e.message}\n\`\`\``;
  }

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(root, "docs", `ANTHROPIC_UPDATE_RECOMMENDATIONS_${date}.md`);
  const fullReport = `# Anthropic update recommendations — ${date}

Generated by \`scripts/anthropic-repo-supabase-render-report.mjs\` (repo + Supabase + Render passed to Anthropic API).
Read this document for actionable updates.

---

${report}

---

*End of report. Re-run the script to regenerate.*
`;

  writeFileSync(reportPath, fullReport, "utf-8");
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
