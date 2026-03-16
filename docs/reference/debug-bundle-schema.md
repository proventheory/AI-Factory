# Debug bundle schema (for Cursor / repair)

When a pipeline run fails or you need to hand off to Cursor (or another repair process), assemble a **debug bundle** — a single structured payload so the agent has full context without scraping logs.

---

## Recommended contents

The bundle is **JSON** (or a folder of JSON files) containing:

| Field / file | Source | Purpose |
|--------------|--------|---------|
| **run** | `GET /v1/runs/:id` | Run id, initiative_id, status, created_at, etc. |
| **job_runs** | `GET /v1/job_runs` (filter by run_id) or Control Plane DB | job_run id, run_id, plan_node_id, job_type, status, started_at, finished_at, error message. |
| **artifacts** | `GET /v1/runs/:id/artifacts` or `GET /v1/artifacts` | artifact id, run_id, producer_plan_node_id, artifact_type, created_at. |
| **lineage** | `GET /v1/graph/lineage/:artifactId` for each artifact | declared_producer (plan_node_id, run_id, node_key, artifact_type), observed_consumers (job_run_id, artifact_id, role). |
| **tool_calls** | `GET /v1/tool_calls` (filter by run or job_run) | Idempotency key, outcome, capability. |
| **last_error** | Runner or Control Plane logs | Last 20–50 lines of runner log or first error line. |
| **migration_check** | `npm run verify:migrations` output | Confirms migrations are registered (optional). |

---

## Shape (minimal)

```json
{
  "run": { "id": "...", "initiative_id": "...", "status": "failed", ... },
  "job_runs": [ { "id": "...", "job_type": "...", "status": "failed", "error": "..." } ],
  "artifacts": [ { "id": "...", "artifact_type": "...", "producer_plan_node_id": "..." } ],
  "lineage": { "<artifactId>": { "declared_producer": { ... }, "observed_consumers": [ ... ] } },
  "tool_calls": [ ... ],
  "last_error": "string or null"
}
```

---

## Usage

1. **Build:** Use Control Plane API (and optionally DB or runner logs) to fill the bundle. See [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md) (playbooks).
2. **Hand off:** Give Cursor (or your repair script) the bundle file or paste the JSON into the case description.
3. **Repair:** Use runbooks (e.g. [run-failure.md](../runbooks/run-failure.md), [render-staging-failed-deploy-and-duplicate-runner.md](../runbooks/render-staging-failed-deploy-and-duplicate-runner.md)) and self-heal docs to decide rerun, migrate, or code fix.

---

See [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md), [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md).
