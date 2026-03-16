# Reliability and Observability (Phase 6)

Production readiness, operator determinism, and chaos prevention for the AI-Factory platform and verticals.

## Success criterion (Phase 6)

Production readiness, operator determinism, and chaos-prevention measures are **defined and in progress**.

---

## Observability

### What to observe

| Area | What | Where / how |
|------|------|-------------|
| **Control Plane** | Health, DB connectivity, request latency, errors | GET /health, GET /health/db, GET /v1/health; Sentry if SENTRY_DSN set. |
| **Runner** | Worker registration, job claim rate, job success/failure, heartbeat | worker_registry table; job_events; GET /health on runner. |
| **Runs / jobs** | Run status distribution, job queue depth, stuck runs | GET /v1/runs, GET /v1/job_runs (or DB); node_progress eligible_at. |
| **Deploy vertical** | Incidents opened/closed, repair plans executed, evolution experiments | incidents, repair_plans, experiment_runs; console /graph/memory, /evolution/*. |
| **Evolution** | Mutation proposals, experiment outcome, promotion decisions | mutation_proposals, experiment_runs, fitness_scores, promotion_decisions; console /evolution/mutations, /evolution/experiments, /evolution/scoreboard. |

### In progress

- [ ] **Structured logging** — Control plane and runner emit structured logs (e.g. run_id, job_run_id, event) for aggregation (e.g. Datadog, Logtail).
- [ ] **Metrics export** — Prometheus or OpenTelemetry metrics (run_count by status, job_claim_latency, incident_count by status) from control plane and runner.
- [ ] **Dashboard** — Single pane: run status, job queue depth, worker count, incident summary, evolution scoreboard summary (or link to console).
- [ ] **Alerts** — Alert when run failure rate exceeds threshold, job queue depth stuck, no worker heartbeat for N minutes, or incident open count spikes.

---

## Failure modes

### Known failure modes and mitigations

| Failure mode | Mitigation | Status |
|--------------|------------|--------|
| **DB unavailable** | Control plane /health/db fails; runner cannot claim jobs. Migrations and startup fail fast. | Documented; no auto-retry storm. |
| **Runner down** | job_runs stay queued; lease expiry (job_claims) allows re-claim by another worker. | Leases; multi-runner safe. |
| **Control plane down** | No new runs; runner continues heartbeating. Deploy-failure scan can run on backup control plane (see OPERATIONS_RUNBOOK). | Runbook. |
| **Run stuck (node never eligible)** | node_progress deps_satisfied never reaches deps_total; run stays running. | Manual or scheduled “stale run” detection (in progress). |
| **Job claim lease expiry** | Runner crashes mid-job; lease expires; another worker can claim same job_run (idempotency required). | job_claims.lease_expires_at; handlers should be idempotent where possible. |
| **Evolution experiment stuck queued** | Runner not polling or evolution poll disabled. | Console shows status; operator can trigger or fix runner. |
| **Self-heal loop creates duplicate initiatives** | Idempotency by root_idempotency_key (environment + key); duplicate deploy failure for same commit may create one initiative per key. | Documented; key design. |
| **Scheduler and runner schema drift** | Migrations run on control plane and runner startup; same DB. Verify migrations registered in run-migrate.mjs. | CONTRIBUTING; verify:migrations. |

### In progress

- [ ] **Stale run detector** — Cron or scheduled job that marks runs as failed if node_progress has been eligible but no job_run completed for > N minutes.
- [ ] **Incident timeout** — Auto-close or escalate incidents open for > N days with no progress.
- [ ] **Evolution experiment timeout** — Mark experiment_runs as failed if running for > N minutes without completion.

---

## Chaos prevention

### Operator determinism

- **Migrations** — Explicit list in run-migrate.mjs; no auto-discovery. Same order every time.
- **Run creation** — createRun with plan_id, release_id, root_idempotency_key; idempotent by (environment, root_idempotency_key).
- **Job claims** — FOR UPDATE SKIP LOCKED; one job_run per claim; lease and heartbeat.
- **Evolution** — experiment_runs claimed with FOR UPDATE SKIP LOCKED; one worker per experiment run.

### Guards against chaos

| Risk | Guard |
|------|--------|
| **Run explosion** | No unbounded retry from control plane; runner completes or fails job once per attempt. |
| **Duplicate runs** | root_idempotency_key unique per environment. |
| **Double execution** | job_claims ensure one worker per job_run; lease expiry allows re-claim only after release. |
| **Evolution runaway** | Evolution Loop V1: deploy_repair only; no code/schema mutation; promotion gates (no regression). |
| **Kernel bloat** | KERNEL_SUBSTRATE.md and CONTRIBUTING: no domain meaning in kernel. |
| **Vertical coupling** | Verticals import kernel; kernel does not import verticals. |

### In progress

- [ ] **Rate limits** — Per-client or per-tenant rate limits on run creation and mutation creation (API level).
- [ ] **Circuit breaker** — Optional circuit breaker on external calls (Render, Vercel, LLM) to avoid cascade failures.
- [ ] **Audit log** — Append-only audit of promotion decisions and critical state changes (e.g. incident status, run status) for compliance and replay.

---

## Checklist summary

| Category | Defined | In progress |
|----------|---------|-------------|
| **Observability** | Health, DB, runs/jobs, deploy/evolution visibility | Structured logging, metrics, dashboard, alerts |
| **Failure modes** | DB, runner, control plane, stuck runs, leases, evolution | Stale run detector, incident timeout, experiment timeout |
| **Chaos prevention** | Idempotency, migrations, claims, evolution guardrails, kernel boundary | Rate limits, circuit breaker, audit log |

Phase 6 success: these measures are **defined** (this document) and **in progress** (checklist items to be implemented over time).
