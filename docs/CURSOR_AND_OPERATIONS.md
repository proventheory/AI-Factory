# Cursor and operations

Operations (run failure, migrations, artifact debugging, deploy) are driven by **commands and APIs**, not only the Vercel Console URL. Cursor (or any repair agent) works best when given a **structured debug bundle** instead of raw logs.

---

## Mental model

- **State** lives in Postgres; Console and Control Plane API are views and triggers.
- **Three layers:** (1) State (DB: initiatives, runs, job_runs, artifacts, artifact_consumption). (2) RPCs (Control Plane REST: runs, lineage, capability resolve, by-artifact-type). (3) Cursor — give it a **debug bundle** (run + job_runs + artifacts + lineage + last error) so it has one case file.
- **CLI + ProfessorX:** Use npm/scripts and API from the repo; use ProfessorX (Console) for graph, lineage, approvals, and Admin CRUD. See [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md).

---

## Debug bundle and prompt templates

When a run fails or you need to hand off to Cursor:

1. **Build a debug bundle** — run, job_runs, artifacts, lineage (`GET /v1/graph/lineage/:id`), tool_calls, last error snippet. See [reference/debug-bundle-schema.md](reference/debug-bundle-schema.md).
2. **Give Cursor the bundle** (file or pasted JSON) so it can reason over state and runbooks without scraping logs.
3. **Use runbooks** — [runbooks/run-failure.md](runbooks/run-failure.md), [runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md), [SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md).

---

## Folder structure (relevant to operations)

- **scripts/run-migrate.mjs** — single migration entry point; runner runs it on startup. All `supabase/migrations/*.sql` must be registered here; `npm run verify:migrations`.
- **control-plane/src/api.ts** — REST API (runs, lineage, capability resolve, by-artifact-type).
- **runners/** — claim jobs, run handlers, write artifacts and artifact_consumption.
- **docs/runbooks/** — large-deploy-verification (Gate B), render-staging, console-db-relation, console-data-safety, run-failure, migration-workflow, artifact-debugging.
- **docs/OPERATIONS_RUNBOOK.md** — commands at a glance, playbooks, index of runbooks.

See [OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md), [WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](WHAT_YOU_CAN_DO_WITH_PROFESSORX.md).
