#!/usr/bin/env node
/**
 * One-off: query runs + job_runs for a given run_id (uses DATABASE_URL from .env).
 * Usage: node scripts/check-run.mjs [run_id] [--fix]
 *   --fix: mark run and its queued job_runs as failed (never_claimed) so the UI shows a result.
 */
import "dotenv/config";
import pg from "pg";
const { Client } = pg;

const args = process.argv.slice(2).filter((a) => a !== "--fix");
const doFix = process.argv.includes("--fix");
const runId = args[0] || "5fae6b00-b084-46ea-99ff-c098524319cc";
const conn = process.env.DATABASE_URL;
if (!conn) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new Client({ connectionString: conn });
await client.connect();

try {
  const run = await client.query(
    "SELECT id, status, plan_id, routed_at, started_at, ended_at, environment FROM runs WHERE id = $1",
    [runId]
  );
  if (run.rows.length === 0) {
    console.log("Run not found:", runId);
    process.exit(0);
  }
  console.log("Run:", JSON.stringify(run.rows[0], null, 2));

  const jobs = await client.query(
    "SELECT id, run_id, plan_node_id, status, attempt, started_at, ended_at FROM job_runs WHERE run_id = $1 ORDER BY plan_node_id, attempt",
    [runId]
  );
  console.log("Job runs count:", jobs.rows.length);
  if (jobs.rows.length > 0) {
    console.log("Job runs:", JSON.stringify(jobs.rows, null, 2));
  }

  if (doFix && run.rows[0].status === "running" && jobs.rows.some((j) => j.status === "queued")) {
    // DB allows only queued->running, running->failed; so set running then failed
    await client.query(
      "UPDATE job_runs SET status = 'running', started_at = now() WHERE run_id = $1 AND status = 'queued'",
      [runId]
    );
    await client.query(
      "UPDATE job_runs SET status = 'failed', ended_at = now(), error_signature = COALESCE(error_signature, 'never_claimed') WHERE run_id = $1 AND status = 'running' AND started_at IS NOT NULL AND ended_at IS NULL",
      [runId]
    );
    await client.query(
      "UPDATE runs SET status = 'failed', ended_at = now() WHERE id = $1 AND status = 'running'",
      [runId]
    );
    await client.query("INSERT INTO run_events (run_id, event_type) VALUES ($1, 'failed')", [runId]).catch(() => {});
    console.log("Fixed: run and queued job(s) marked failed.");
  }
} finally {
  await client.end();
}
