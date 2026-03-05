# Runner deployment

Runners are the workers that **claim and execute** pipeline jobs. Without at least one runner process connected to the same database as the Control Plane, "Start run" from the Console will create runs and queue jobs, but no work will be done until a runner is running.

---

## What the runner does

1. **Poll** the database for eligible jobs (`job_runs` + `node_progress`).
2. **Claim** a job (atomic lease so only one worker runs it).
3. **Execute** the handler or executor for that `job_type` (e.g. `prd`, `codegen`, `copy_generate`, `landing_page_generate`).
4. **Persist** artifacts and events, then **advance** the run (mark node complete, queue successors).
5. **Heartbeat** while running so the lease isn’t reclaimed.

See `runners/src/runner.ts` (claim/heartbeat) and `runners/src/index.ts` (poll loop).

---

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Same Postgres as the Control Plane. Runner reads `job_runs`, `node_progress`, `plan_nodes`, etc., and writes artifacts, `job_events`, `node_progress`. |
| `CONTROL_PLANE_URL` | For brand/routing | Base URL of the Control Plane API (e.g. `https://ai-factory-api-staging.onrender.com`). Used to load brand context (initiative → brand_profile) and **routing_policies** (model tier per job type). |
| `LLM_GATEWAY_URL` | For LLM jobs | LiteLLM Proxy or gateway URL. Any job that calls an LLM (prd, codegen, copy_generate, etc.) needs this. |
| `WORKER_ID` | No | Defaults to `worker-${pid}`. Helps identify the worker in logs and leases. |
| `ENVIRONMENT` | No | e.g. `sandbox`, `staging`, `prod`. For logging. |
| `MAX_CONCURRENCY` | No | Max jobs this process runs at once (default `5`). |
| `RUNNER_VERSION` | No | For logging. |

---

## Run locally

From the repo root. Ensure `.env` has `DATABASE_URL`, `CONTROL_PLANE_URL` (e.g. `http://localhost:3001`), and `LLM_GATEWAY_URL` (e.g. your LiteLLM proxy or gateway).

**Option A – dev scripts (recommended):**
```bash
# Terminal 1: Control Plane
npm run dev:control-plane

# Terminal 2: Runner (loads .env automatically)
npm run dev:runner
```
Then open the Console (e.g. `cd console && npm run dev`), go to an initiative with intent **landing**, click **Compile plan** → **Start run**. The runner will claim jobs (copy_generate, then landing_page_generate) and the **Artifacts** tab will show **Open preview** for the landing page.

**Option B – built output:**
```bash
npm run build
export DATABASE_URL="postgresql://..."
export CONTROL_PLANE_URL="http://localhost:3001"
export LLM_GATEWAY_URL="http://localhost:4000"
npm run start:runner
```

---

## Deploy as a process

- **Render (recommended)**: The repo includes a **worker** service in `render.yaml` and `Dockerfile.runner`. After syncing the Blueprint, **ai-factory-runner-staging** will deploy from `main`. Set in the worker’s Environment: `DATABASE_URL` (same as API), `CONTROL_PLANE_URL` (e.g. `https://ai-factory-api-staging.onrender.com`), `LLM_GATEWAY_URL`. Without these, jobs stay queued. The worker runs `node dist/runner-bundle.js`.
- **Render (manual)**: Add a **Background Worker**; use `dockerContext: .`, `dockerfilePath: ./Dockerfile.runner`. Set the same env vars as above.
- **Railway / Fly.io / ECS / etc.**: Use `Dockerfile.runner` or run `npm run build` then `npm run start:runner` with `DATABASE_URL`, `CONTROL_PLANE_URL`, `LLM_GATEWAY_URL`.
- **Same host as Control Plane**: Run `node dist/runners/src/index.js` (or `npm run start:runner`) with the same `DATABASE_URL`.

---

## Verify it’s working

1. **Console**: Create an initiative (e.g. intent_type `marketing` or `software`), compile plan, click **Start run** (or call `POST /v1/plans/:id/run`).
2. **Runs**: Open the run; you should see job_runs move from `queued` → `running` → completed (or failed).
3. **Artifacts**: After jobs complete, artifacts should appear for that run.
4. **Logs**: Runner logs should show `[runner] Executing job ... job_type=...` and no repeated "No eligible job" if there was work to do.

If jobs stay `queued`, either no runner is connected (check process and `DATABASE_URL`) or the runner is failing before it can claim (check runner logs and DB connectivity).

---

## Scaling

- Run **multiple** runner processes (different `WORKER_ID`) against the same `DATABASE_URL`; they will claim different jobs. The claim uses `SELECT ... FOR UPDATE SKIP LOCKED` so only one runner gets each job.
- Increase **MAX_CONCURRENCY** per process if each job is I/O-bound and you want more parallelism per worker.

---

## Related

- **Control Plane**: `control-plane/` — API and scheduler; creates runs and enqueues root nodes.
- **Scheduler**: `control-plane/src/scheduler.ts` — `createRun`, `advanceSuccessors`, `checkRunCompletion`.
- **Enablement plan**: `docs/ENABLEMENT_PLAN_FULL_VISION.md` §8 (production runners).
