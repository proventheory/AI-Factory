#!/usr/bin/env node
/**
 * Commit all changes and push to the current branch (e.g. main).
 * Used by agents and automation to ship changes without manual git steps.
 *
 * Usage:
 *   node scripts/git-commit-and-push.mjs [commit-message]
 *   GIT_COMMIT_MESSAGE="chore: deploy fixes" node scripts/git-commit-and-push.mjs
 *
 * Requires: git configured; push uses GITHUB_TOKEN (HTTPS) or SSH. From repo root.
 */
import { execSync } from "child_process";
import { existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const message = process.env.GIT_COMMIT_MESSAGE?.trim() || process.argv[2]?.trim() || "chore: update (autonomous deploy)";

function run(cmd, opts = {}) {
  execSync(cmd, { cwd: root, stdio: "inherit", ...opts });
}

if (!existsSync(resolve(root, ".git"))) {
  console.error("Not a git repo");
  process.exit(1);
}

try {
  run("git status --short");
  run("git add -A");
  execSync("git", ["commit", "-m", message], { cwd: root, stdio: "inherit" });
  run("git push");
  console.log("Committed and pushed.");
} catch (e) {
  const out = (e.output || []).filter(Boolean).map((b) => b.toString()).join("");
  if (out.includes("nothing to commit") || out.includes("no changes added")) {
    console.log("Nothing to commit, working tree clean.");
    process.exit(0);
  }
  if (out.includes("could not read Username") || out.includes("Authentication failed") || out.includes("Permission denied")) {
    console.error("Push failed: set GITHUB_TOKEN (HTTPS) or use SSH. See docs/OPERATIONS_RUNBOOK.md.");
  }
  process.exit(e.status ?? 1);
}
