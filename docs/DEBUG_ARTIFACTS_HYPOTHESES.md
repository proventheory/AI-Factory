# Debug: No landing_page artifacts — hypotheses

**Bug:** Every run returns no artifacts (items: []). Pipeline should produce a `landing_page` artifact so the frontend shows "Open preview."

**Where this fits in the structure:**

- **Normal operation:** Self-heal (see [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)) uses existing integrations (Render API key, GitHub webhook, Supabase). When `ENABLE_SELF_HEAL=true` and `RENDER_API_KEY` are set, the Control Plane auto-detects runs with no artifacts (via API) and remediates (worker env sync + new run). No new “hypotheses” or ad-hoc instrumentation are required for that.
- **This doc** is the **single place** for one-off, hypothesis-driven debug when you need to find root cause (e.g. runbook + self-heal are not enough). All artifact-debug hypotheses (H1–H5) live here. Instrumentation is in runner, control-plane, and handlers (wrapped in `#region agent log`) and is **gated**: it runs only when `DEBUG_ARTIFACTS_HYPOTHESES=1` so production never hits the debug ingest. Remove or keep gated after verification.

**To enable instrumentation:** Set `DEBUG_ARTIFACTS_HYPOTHESES=1` when running the Control Plane and Runner locally. Logs go to the debug ingest endpoint (127.0.0.1:7336) when that is running.

## Hypotheses (tested via instrumentation)

| Id | Hypothesis | Instrumentation |
|----|------------|-----------------|
| **H1** | Runner never claims any job (claimJob always returns null). E.g. no job_runs with status=queued, or node_progress never eligible, or runner uses a different DB. | Runner: log when claimJob returns null |
| **H2** | Runner claims only root job (e.g. copy_generate); landing_page_generate job is never enqueued (advanceSuccessors not creating next job_run, or plan has no landing node/edge). | Scheduler: createRun logs rootJobCount; advanceSuccessors logs when inserting job_run (to_node_id, job_type) |
| **H3** | Runner claims landing_page_generate but handler not found or handler throws before writeArtifact (e.g. loadBrandContext throws, getHandler undefined). | Runner: log when no executor/handler; log handler_done; landing-page-generate: log at entry; runner catch: log job_type + error |
| **H4** | writeArtifact is called but INSERT fails (DB error, constraint). | landing-page-generate: log before and after writeArtifact |
| **H5** | Artifacts are written but GET /v1/runs/:id/artifacts returns empty (wrong run_id, or API/Console uses different DB). | Control plane: GET artifacts logs runId, count, types |

## Log locations

- **Log path:** `.cursor/debug-24bf14.log` (NDJSON)
- **Session ID:** 24bf14

Logs are sent via POST to the debug ingest endpoint only when `DEBUG_ARTIFACTS_HYPOTHESES=1` is set and Control Plane / Runner run locally (so they can reach 127.0.0.1:7336). Without the env var, no instrumentation runs.
