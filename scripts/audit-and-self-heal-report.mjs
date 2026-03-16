#!/usr/bin/env node
/**
 * Full-repo audit using Anthropic (Claude): scan API, MCP, Supabase, codebase;
 * run doctor + optional self-heal loop; produce a report for later reading.
 *
 * Usage: node --env-file=.env scripts/audit-and-self-heal-report.mjs [--dry-run] [--no-llm]
 *
 * Requires: ANTHROPIC_API_KEY in env (or .env). Never logs or echoes secrets.
 * Output: docs/AUDIT_REPORT_<YYYY-MM-DD>.md
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const DRY_RUN = process.argv.includes("--dry-run");
const NO_LLM = process.argv.includes("--no-llm");

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

function collectApiRoutes() {
  const apiPath = join(root, "control-plane/src/api.ts");
  if (!existsSync(apiPath)) return [];
  const content = readFileSync(apiPath, "utf-8");
  const routes = [];
  const re = /app\.(get|post|patch|put|delete)\s*\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(content)) !== null) routes.push(`${m[1].toUpperCase()} ${m[2]}`);
  return routes;
}

function collectMcpServers() {
  // MCP descriptors often live in Cursor project folder (e.g. .cursor/.../mcps), not in repo
  const inRepo = join(root, ".cursor/projects");
  const list = [];
  try {
    if (existsSync(inRepo)) {
      const projects = readdirSync(inRepo, { withFileTypes: true });
      for (const p of projects) {
        if (!p.isDirectory()) continue;
        const name = p.name;
        const serverMeta = join(inRepo, name, "SERVER_METADATA.json");
        if (existsSync(serverMeta)) {
          try {
            const j = JSON.parse(readFileSync(serverMeta, "utf-8"));
            list.push({ name, ...j });
          } catch {
            list.push({ name });
          }
        } else {
          list.push({ name });
        }
      }
    }
  } catch (_) {}
  if (list.length === 0) {
    // Fallback: known MCPs from project (Neon, Render, cursor-ide-browser)
    list.push(
      { name: "user-Neon", note: "Neon DB tools (run_sql, list_branch_computes, etc.)" },
      { name: "user-render", note: "Render deploy/logs/env (list_services, list_deploys, etc.)" },
      { name: "cursor-ide-browser", note: "Browser automation (browser_navigate, browser_snapshot, etc.)" }
    );
  }
  return list;
}

function collectMigrations() {
  const migDir = join(root, "supabase/migrations");
  if (!existsSync(migDir)) return [];
  return readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort();
}

function runDoctor() {
  try {
    const out = execSync("bash scripts/doctor.sh --json", {
      encoding: "utf-8",
      cwd: root,
      timeout: 120_000,
    });
    return JSON.parse(out);
  } catch (e) {
    const out = (e.stdout || e.stderr || String(e)).slice(0, 10000);
    return { status: "fail", raw: out };
  }
}

function buildScanPayload() {
  const apiRoutes = collectApiRoutes();
  const mcp = collectMcpServers();
  const migrations = collectMigrations();
  const doctor = runDoctor();
  const runMigratePath = join(root, "scripts/run-migrate.mjs");
  let runMigrateList = [];
  if (existsSync(runMigratePath)) {
    const content = readFileSync(runMigratePath, "utf-8");
    const names = content.match(/name:\s*["']([^"']+)["']/g) || [];
    runMigrateList = names.map((n) => n.replace(/name:\s*["']|["']/g, ""));
  }
  return {
    apiRoutes: apiRoutes.slice(0, 120),
    apiRouteCount: apiRoutes.length,
    mcpServers: mcp,
    migrations,
    migrationsCount: migrations.length,
    runMigrateRegistered: runMigrateList.length,
    doctor: {
      status: doctor.status,
      failed_step: doctor.failed_step,
      total_errors: doctor.total_errors,
      results: (doctor.results || []).map((r) => ({
        step: r.step,
        workspace: r.workspace,
        success: r.success,
        duration_ms: r.duration_ms,
      })),
    },
    selfHealNote: "Local self-heal: npm run self-heal (uses OPENAI; doctor -> parse -> LLM -> patch). Platform: fix-me label + deploy-failure scan every 5 min.",
  };
}

async function callAnthropic(apiKey, payload) {
  const system = `You are an expert engineer auditing a monorepo (AI Factory): Control Plane API (Express), Console (Next.js), runners, Supabase migrations, and MCP. Your job is to:
1. Review the provided scan (API routes, MCP servers, migrations, doctor results).
2. Suggest specific optimizations and corrections: API consistency, security, MCP config, migration order/duplicates, schema drift, and codebase health.
3. Prioritize: correctness and safety first, then performance and maintainability.
4. Output a clear, structured report (markdown) with sections: Summary, API, MCP, Supabase/Migrations, Self-Heal & Ops, and Recommended Actions. Be concise but actionable. Do not suggest changing secrets or env var names; only suggest structural and code improvements.`;
  const userContent = `Scan payload (JSON):\n\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\`\n\nProduce the audit report in markdown.`;
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

function runSelfHealDry() {
  try {
    const out = execSync("npx tsx scripts/self-heal.ts --dry-run 2>&1", {
      encoding: "utf-8",
      cwd: root,
      timeout: 60_000,
    });
    return out.slice(0, 8000);
  } catch (e) {
    return (e.stdout || e.stderr || String(e)).slice(0, 8000);
  }
}

async function main() {
  const env = loadEnv();
  const apiKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apiKey && !NO_LLM) {
    console.error("ANTHROPIC_API_KEY not set. Use --no-llm to skip LLM and only run doctor + report.");
    process.exit(1);
  }

  console.log("Collecting scan payload...");
  const payload = buildScanPayload();
  console.log(`API routes: ${payload.apiRouteCount}, migrations: ${payload.migrationsCount}, doctor: ${payload.doctor.status}`);

  let llmReport = "";
  if (apiKey && !NO_LLM) {
    console.log("Calling Anthropic for audit suggestions...");
    try {
      llmReport = await callAnthropic(apiKey, payload);
    } catch (e) {
      llmReport = `## LLM audit failed\n\n\`\`\`\n${e.message}\n\`\`\``;
    }
  } else if (NO_LLM) {
    llmReport = "_Skipped (--no-llm). Run without --no-llm and set ANTHROPIC_API_KEY for Claude suggestions._";
  }

  let selfHealOutput = "";
  if (DRY_RUN) {
    console.log("Running self-heal dry-run...");
    selfHealOutput = runSelfHealDry();
  }

  const date = new Date().toISOString().slice(0, 10);
  const reportPath = join(root, "docs", `AUDIT_REPORT_${date}.md`);
  const report = `# Full-repo audit report — ${date}

Generated by \`scripts/audit-and-self-heal-report.mjs\` (Anthropic scan + doctor + optional self-heal).
For reading later; no approval step.

---

## Scan summary

| Area | Detail |
|------|--------|
| API routes (Control Plane) | ${payload.apiRouteCount} |
| Migrations (supabase/migrations) | ${payload.migrationsCount} |
| Registered in run-migrate.mjs | ${payload.runMigrateRegistered} |
| Doctor | ${payload.doctor.status} (failed_step: ${payload.doctor.failed_step ?? "none"}, total_errors: ${payload.doctor.total_errors ?? 0}) |
| MCP servers (from scan) | ${JSON.stringify(payload.mcpServers.map((s) => s.name || s.note))} |

### Doctor results (summary)

${payload.doctor.results?.map((r) => `- ${r.workspace}:${r.step} — ${r.success ? "PASS" : "FAIL"} (${r.duration_ms}ms)`).join("\n") ?? "N/A"}

---

## Claude audit (optimizations & corrections)

${llmReport}

---

## Self-heal (dry-run output)

${DRY_RUN ? "```\n" + selfHealOutput + "\n```" : "Skipped (run with --dry-run to include self-heal dry-run)."}

---

## Recommended next steps

1. Review the Claude audit section above and apply any desired changes.
2. Run \`npm run doctor\` and \`npm run self-heal\` locally as needed.
3. Ensure Control Plane has ENABLE_SELF_HEAL, RENDER_API_KEY, VERCEL_TOKEN, and project IDs for deploy-failure self-heal (see docs/OPERATIONS_RUNBOOK.md).
`;

  writeFileSync(reportPath, report, "utf-8");
  console.log(`Report written to ${reportPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
