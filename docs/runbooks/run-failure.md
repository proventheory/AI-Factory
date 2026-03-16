# Runbook: Pipeline run failed

When a pipeline run fails (job_runs in failed state, no artifacts, or errors in Console):

---

## 1. Gather state (debug bundle)

- **Control Plane:** `GET /v1/runs/:id`, `GET /v1/runs/:id/artifacts`, `GET /v1/job_runs` (filter by run_id).
- **Lineage:** For any artifact IDs, `GET /v1/graph/lineage/:artifactId` (declared producer, observed consumers).
- **Runner logs:** If you have access to Render (or local) runner logs, note the first error line and exit code.

Assemble a **debug bundle** (run + job_runs + artifacts + lineage + last log snippet) so Cursor or your repair process has a single structured case file. See [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md).

---

## 2. Classify failure

| Type | What to do |
|------|------------|
| **Deploy/startup** (runner never started, 42P01) | [render-staging-failed-deploy-and-duplicate-runner.md](render-staging-failed-deploy-and-duplicate-runner.md): run migrations against staging DB, then redeploy runner. |
| **Runtime/schema** (runner started but job failed with missing table/column) | Run migrations; if already applied, check that the runner’s `DATABASE_URL` is the same as the Control Plane. |
| **LLM / handler error** | Check runner env (`LLM_GATEWAY_URL`, `OPENAI_API_KEY`); use repair plan or self-heal. See [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md). |

---

## 3. Repair and replay

- **Rerun:** Console or `POST /v1/runs/:id/rerun` (if supported).
- **Subgraph replay:** When self-heal or repair engine suggests it; see Dev Kernel V1 and [GRAPH_ENGINE_AND_SELF_HEAL.md](../GRAPH_ENGINE_AND_SELF_HEAL.md).
- **Fix and redeploy:** After code/schema fix, run `npm run verify:migrations`, then deploy; complete [large-deploy-verification.md](large-deploy-verification.md) if you changed migrations.

---

See also: [OPERATIONS_RUNBOOK.md](../OPERATIONS_RUNBOOK.md), [SELF_HEAL_HOW_TO_TRIGGER.md](../SELF_HEAL_HOW_TO_TRIGGER.md).
