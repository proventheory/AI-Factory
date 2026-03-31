# AI Factory Runners

Runner workers **claim job_runs** from the Control Plane (Postgres), **execute handlers** (e.g. `analyze_repo`, `write_patch`, `seo_gsc_snapshot`, `evolution_replay`), and **write back** artifacts and job events.

## Build and run

- **Build:** From **repo root**: `npm run build` (root `tsconfig.json` compiles `runners/src/**` into `dist/runners/src/`).
- **Run (dev):** From repo root: `npm run dev:runner` (uses `tsx` on `runners/src/index.ts`).
- **Run (prod):** From repo root: `npm run start:runner` (runs `node dist/runners/src/index.js` after build).

Runners do **not** have their own `npm install`; they use the **root workspace** dependencies (see root `package.json`). Key runtime deps: `pg`, `uuid`; they also import from `control-plane/src` (scheduler, deploy-failure-scan, etc.), so the repo is built as one unit.

## Environment

- **DATABASE_URL** (required): Same Supabase/Postgres as the Control Plane. Used to claim jobs and read/write artifacts.
- **Supabase:** The default **Session pooler** URL (`*.pooler.supabase.com:5432`) enforces a small shared connection cap. If the runner logs `MaxClientsInSessionMode`, use the **direct** connection string (`db.<project>.ref.supabase.co:5432`) for the runner and/or Control Plane, or set **`DATABASE_POOL_MAX=1`**. Port **6543** is the transaction pooler (different tradeoffs). The runner defaults to a smaller pool when it detects the session pooler host.
- **CONTROL_PLANE_URL**: Base URL of the Control Plane (default `http://localhost:3001`). Used for deploy-failure scan trigger and optional callbacks.
- **LLM_GATEWAY_URL** or **OPENAI_API_KEY**: For handlers that call LLMs.

See root `.env.example` and [docs/OPERATIONS_RUNBOOK.md](../docs/OPERATIONS_RUNBOOK.md).

## Architecture

- **Poll loop:** Runners poll `job_runs` (e.g. `SKIP LOCKED`) and claim work; they also poll `experiment_runs` for evolution replay.
- **Handlers:** Registered in `handlers/index.ts`; each handler receives a job context (run, plan node, inputs) and returns artifacts / outcome.
- **Evolution:** `evolution_replay` and `evolution_shadow` (stub) run in the runner; fitness and promotion live in the Control Plane.

See [docs/EVOLUTION_LOOP_V1.md](../docs/EVOLUTION_LOOP_V1.md) and [docs/DEPLOY_VERTICAL_KERNEL.md](../docs/DEPLOY_VERTICAL_KERNEL.md).
