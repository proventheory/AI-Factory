#!/usr/bin/env node
/**
 * One-off: insert a single landing_page artifact for a run so the UI can show it.
 * Usage: node scripts/seed-one-artifact.mjs [run_id]
 * Default run_id: df5908af-3364-42a4-babd-90ede30a7ada (first landing run we opened in browser)
 */
import "dotenv/config";
import pg from "pg";

const runId = process.argv[2] ?? "df5908af-3364-42a4-babd-90ede30a7ada";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const sampleHtml = `<!DOCTYPE html><html><head><title>Test Landing</title></head><body><h1>Hello from seeded artifact</h1><p>If you see this, the Artifacts tab is loading correctly.</p></body></html>`;

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `INSERT INTO artifacts (id, run_id, job_run_id, artifact_type, artifact_class, uri, metadata_json)
       VALUES (gen_random_uuid(), $1, NULL, 'landing_page', 'docs', $2, $3::jsonb)
       RETURNING id, run_id, artifact_type`,
      [runId, `mem://landing_page/${runId}/seed`, JSON.stringify({ content: sampleHtml })]
    );
    console.log("Inserted artifact:", r.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
