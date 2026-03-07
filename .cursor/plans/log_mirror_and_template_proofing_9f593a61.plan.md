# Log Mirror and Template Proofing — Plan

**Related spec:** [Template QA Loop (Revised)](../.cursor/plans/template_qa_loop_full_plan.md) — log mirror, proofing, and closed-loop validation.

---

## Self-healing: No-artifacts remediation (current issue)

### What the logs show

- **Tag:** `[cplxj] [self-heal]`
- **Message:** `No-artifacts remediation: sync failed: Worker service 'ai-factory-runner-staging' not found in Render`
- **Pattern:** Repeats every ~3 minutes (periodic scan in Control Plane).
- **Context:** The **API** (`ai-factory-api-staging`) is up and serving (e.g. `GET /v1/artifacts/...` → 304). Remediation fails because the Control Plane cannot find the **worker** service in Render when it tries to sync env and restart it.

### How no-artifacts self-heal works

1. **Trigger:** Every 3 minutes, `scanAndRemediateNoArtifactsRuns()` in `control-plane/src/no-artifacts-self-heal.ts` finds terminal runs that had job_runs but **zero artifacts**.
2. **Remediation:** For each such run it calls `syncWorkerEnvFromControlPlane()` in `control-plane/src/render-worker-remediate.ts`, which:
   - Lists services via `GET https://api.render.com/v1/services` using `RENDER_API_KEY`
   - Looks for a service whose **name** or **slug** equals `RENDER_WORKER_SERVICE_NAME` (default: `ai-factory-runner-staging`)
   - If found: sets env vars (DATABASE_URL, CONTROL_PLANE_URL, LLM_GATEWAY_URL) on that service and restarts it, then creates a new run.
   - If **not found:** returns `Worker service 'ai-factory-runner-staging' not found in Render` → self-heal logs the message and does not remediate (no new run).

So the failure is **before** any env sync or restart: the Render API response does not contain a service matching the expected worker name/slug.

### Root cause (likely)

One or more of:

1. **Worker service missing in Render** — The worker `ai-factory-runner-staging` was never created, or was deleted. `render.yaml` defines it; the Blueprint must be applied/synced so the service exists.
2. **Name/slug mismatch** — The service exists in the Render dashboard under a different **name** or **slug** (e.g. typo, renamed). The code matches case-insensitively on `name` and `slug`.
3. **Wrong Render account** — `RENDER_API_KEY` on the Control Plane is for a different Render account/team than the one that owns `ai-factory-api-staging` and the worker. The API only returns services for the key’s account.
4. **API response shape** — Less likely: the code handles both array and `{ services: [...] }` responses; if Render changed the response format, the lookup could fail.

### What to do (runbook)

| Priority | Action |
|----------|--------|
| 1 | **Render Dashboard:** Confirm a **Background Worker** service exists for this project. If not, create/sync from `render.yaml` (e.g. service name `ai-factory-runner-staging`). |
| 2 | **Control Plane env (Render):** Set `RENDER_WORKER_SERVICE_NAME` to the **exact** service name or slug shown in the Render dashboard (default is `ai-factory-runner-staging`). See [STAGING_RENDER_CHECKLIST.md](../../docs/STAGING_RENDER_CHECKLIST.md) § ai-factory-runner-staging. |
| 3 | **Same account:** Ensure `RENDER_API_KEY` is from the same Render account that owns the API and worker services. |
| 4 | **Optional — reduce log noise:** If you intentionally do not want no-artifacts remediation (e.g. no worker in this env), set `ENABLE_SELF_HEAL=false` or leave `RENDER_API_KEY` unset so the scan no-op and no "not found" warnings. |

### Code references

- Scan loop: `control-plane/src/index.ts` → `startNoArtifactsScanLoop()` (interval `NO_ARTIFACTS_SCAN_INTERVAL_MS` = 3 min).
- Remediation: `control-plane/src/no-artifacts-self-heal.ts` → `runNoArtifactsRemediation()` → `syncWorkerEnvFromControlPlane()`.
- Render lookup: `control-plane/src/render-worker-remediate.ts` → `listRenderServices()`, then `services.find(...)` on `name`/`slug` vs `WORKER_SERVICE_NAME`.

---

## Plan updates (log mirror + template proofing)

- **Self-heal and evidence:** Once log mirror and observability events exist (per template_qa_loop spec), self-heal can use **normalized events** and validation results instead of only “zero artifacts.” The plan should avoid relying solely on artifact count; use scorecard/validation state where available.
- **No-artifacts vs bad-artifacts:** The same “worker not found” path affects both no-artifacts and bad-artifacts remediation (they share `syncWorkerEnvFromControlPlane()`). Fixing the Render worker lookup resolves both.
- **Operational note:** Until the worker is findable in Render (or self-heal is disabled), the 3-minute “not found” log line will continue; it is expected until the runbook above is applied.

---

## Next steps

1. **Immediate:** Follow runbook (confirm worker exists, set `RENDER_WORKER_SERVICE_NAME` if needed, confirm API key account).
2. **After worker is fixed:** Confirm one no-artifacts run remediates (env sync + new run created) and logs show success.
3. **Later (log mirror):** Implement log mirror and observability events per template_qa_loop spec so self-heal and proofing use structured evidence.
