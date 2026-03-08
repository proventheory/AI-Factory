# Log mirror + template proofing — implementation summary

Reference for what was implemented (see `.cursor/plans/log_mirror_and_template_proofing_*.plan.md` for the full plan). Use this **before redeploying** so migrations and env are in place.

---

## Phase 1.1 – DB + API for run log entries

- **Migration:** `supabase/migrations/20250312000000_run_log_entries.sql`  
  Table `run_log_entries` (`run_id`, `job_run_id`, `source`, `level`, `message`, `logged_at`, `dedupe_hash`) with indexes and unique constraint for dedupe.
- **GET /v1/runs/:id/log_entries** — Paginated list (limit, offset, source, order). Returns 503 if table missing.
- **POST /v1/runs/:id/ingest_logs** — One-off ingest for that run’s time window. Returns 503 if table missing.

## Phase 1.2 – Render log ingest

- **control-plane/src/render-log-ingest.ts** — Resolves worker service (same logic as render-worker-remediate), fetches Render `GET /v1/logs`, parses `run_id` from messages, inserts into `run_log_entries` with dedupe. Exports `ingestRunLogsOneOff` and `runScheduledLogIngest`.
- **Scheduled job:** When `ENABLE_RENDER_LOG_INGEST=true`, `control-plane/src/index.ts` starts a 2‑minute interval that calls `runScheduledLogIngest`.

## Phase 1.3 – Console Logs tab

- **console/app/runs/[id]/page.tsx** — New **Logs** tab: fetches `GET /v1/runs/:id/log_entries?limit=200`; **Refresh logs** button calls `POST /v1/runs/:id/ingest_logs` then refetches; scrollable list (time + message).

## Phase 2.1 – Log → validations

- **control-plane/src/log-validations.ts** — `parseLogValidation(message)` for patterns (e.g. `hasLogo: false`, `campaign copy not found`, `pre-write check failed`, `template_placeholders: []`) → `runner_log_check:logo_missing`, etc. `insertLogValidations(pool, runId, validations)` inserts into `validations` (one per run + validator_type, skip if exists).
- **Wired into ingest:** One-off and scheduled ingest both call `parseLogValidation` on each message and `insertLogValidations` after inserting log rows.

## Phase 2.2 – Self-heal visibility

- **docs/SECURITY_AND_RUNBOOKS.md** — New runbook **“Log-based validations (Validations tab)”**: log-based validations are visibility only; no automatic fix; fix brand/template manually and re-run.

## Phase 3.1 – Proof run loop

- **Migration:** `supabase/migrations/20250312000001_template_proof.sql` — `template_proof_batches` (id, brand_profile_id, status, started_at, end_at, …), `template_proof_runs` (batch_id, template_id, run_id, brand_profile_id, status, artifact_count, …).
- **control-plane/src/template-proof-job.ts** — `runProofLoop({ batchId, brandProfileId, durationMinutes, templateIds })`: fetches templates (or uses `templateIds`), for each: POST email_campaigns → POST initiatives/:id/plan → POST plans/:id/start (sandbox) → poll run status (3 min timeout) → update `template_proof_runs`.
- **POST /v1/template_proof/start** — Creates batch, runs `runProofLoop` in setImmediate, returns 202 with `batch_id`.
- **GET /v1/template_proof** — Optional `batch_id`, `template_id`, `latest_per_template=1` (DISTINCT ON template_id).
- **GET /v1/template_proof/:batchId** — Batch row + summary (passed/failed/remaining) + items.

## Phase 3.2 – Console template proofing page

- **console/app/template-proofing/page.tsx** — Brand dropdown (useBrandProfiles), duration (default 30 min), **Start proof run** (POST /v1/template_proof/start). Table of templates (useEmailTemplates) with latest proof run (GET /v1/template_proof?latest_per_template=1): Template, Last status, Last run (link to /runs/:id), Last run at, Artifacts. Refresh button to refetch proof runs.

## Other

- **scripts/run-migrate.mjs** — `run_log_entries` and `template_proof` migrations added to the list so `npm run db:migrate` runs them.

---

## Before redeploy (checklist)

1. **Run migrations** (Control Plane and Runner use the same DB):
   ```bash
   DATABASE_URL="<your-connection-string>" npm run db:migrate
   ```
   Or apply only the new two: `20250312000000_run_log_entries.sql`, `20250312000001_template_proof.sql`.

2. **Log mirror (optional):**
   - Set **ENABLE_RENDER_LOG_INGEST** = `true` on the Control Plane (e.g. Render env) when you want the 2‑min scheduled ingest.
   - **RENDER_API_KEY** and **RENDER_WORKER_SERVICE_NAME** (or **RENDER_WORKER_SERVICE_ID**) must already be set for self-heal; same keys are used for log ingest.

3. **Template proofing:** No extra env. After migrations, use **Console → /template-proofing** (or add a nav link). Start proof run with a brand; runs are created in the background.

4. **Deploy:** Control Plane (for new API routes and ingest), Console (for Logs tab and template-proofing page), Runner unchanged for this feature.
