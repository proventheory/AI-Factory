# Evolution Loop V1

Bounded self-improvement for the **deploy_repair** vertical: mutation proposals, experiment runs (replay), fitness scoring, and promotion decisions. This is the first concrete implementation of the blueprint’s “Controlled Evolution” and “measured evolutionary loop.”

## Goal

- **Self-heal**: “I failed, so I try to repair this instance.”
- **Self-build (Evolution)**: “I observed patterns, inferred a better strategy, tested it, and changed future behavior.”

Evolution Loop V1 adds the mutation-and-selection layer so deploy_repair can improve over time within strict guardrails.

## First domain: deploy_repair only

- **Mutation targets** (bounded, low/medium risk): `repair_recipe_order`, `classifier_threshold`, `retry_backoff_profile`, `canary_policy`, `validator_threshold`.
- **No code mutation, no schema mutation, no policy-boundary mutation** in V1.
- **Replay-first**: experiments use `traffic_strategy=replay` to evaluate baseline vs candidate on the same cohort (incidents/repair_attempts).

## Concepts

| Concept | Description |
|--------|-------------|
| **mutation_proposals** | A proposed change (patch) to a target (e.g. recipe order, threshold), with baseline snapshot, risk level, status (draft → queued → approved_for_test → testing → accepted/rejected). |
| **experiment_runs** | One run of an experiment: links to a mutation proposal, has baseline_ref and candidate_ref, traffic strategy (replay/shadow/canary), cohort_key/cohort_filters, status and outcome (win/loss/inconclusive). |
| **fitness_scores** | Per-experiment-run metrics (e.g. resolved_count, resolution_time_sec_avg, repair_attempts_total) with direction (higher_is_better / lower_is_better) and weight. |
| **promotion_decisions** | Decision (promote / reject / retry_test / sandbox_only / human_review) with reason and optional promoted_ref, tied to mutation proposal and experiment run. |
| **evolution_targets** | Registry of what can be mutated: domain, target_type, target_id, mutability_level (low/medium/high/locked). Seeded for deploy_repair. |

## Flow

1. **Propose** — Create a mutation proposal (e.g. reorder repair recipes) via `POST /v1/evolution/mutations`. Target-registry validates the patch and sets risk level.
2. **Experiment** — Create an experiment run via `POST /v1/evolution/experiments` (mutation_proposal_id, domain, baseline_ref, candidate_ref, traffic_strategy=replay, optional cohort_key/cohort_filters). Status is set to `queued`.
3. **Run** — Runner polls `experiment_runs` where `status='queued'`, claims one, sets `status=running`, and runs the **evolution_replay** handler: load cohort (incidents/repair_attempts from cohort_filters), compute cohort summary, write **fitness_scores**, set experiment outcome and `status=completed` (or `failed`).
4. **Decide** — Call `POST /v1/evolution/experiments/:id/decide` with optional score_delta, baseline_regression, metric_summary (or leave body empty to auto-evaluate from fitness_scores). Promotion gate writes a **promotion_decision** (promote/reject/…).

## API (control plane)

- `GET /v1/evolution/targets` — List active evolution targets (?domain= optional).
- `POST /v1/evolution/mutations` — Create mutation proposal (body: domain, target_type, target_id, mutation_kind, patch, proposed_by, optional baseline_snapshot, hypothesis, dedupe_key, rationale, tags).
- `GET /v1/evolution/mutations` — List proposals (?domain=, ?status=, ?limit=, ?offset=).
- `GET /v1/evolution/mutations/:id` — Get one proposal.
- `PATCH /v1/evolution/mutations/:id` — Update status (body: { status }).
- `POST /v1/evolution/experiments` — Create experiment run (body: mutation_proposal_id, domain, baseline_ref, candidate_ref, traffic_strategy, optional traffic_percent, sample_size, cohort_key, cohort_filters).
- `GET /v1/evolution/experiments` — List experiments (?mutation_proposal_id=, ?domain=, ?status=, ?limit=, ?offset=).
- `GET /v1/evolution/experiments/:id` — Get one experiment.
- `POST /v1/evolution/experiments/:id/decide` — Record promotion decision (body optional: decided_by, decision, reason, or score_delta, baseline_regression, metric_summary for auto-evaluate).
- `GET /v1/evolution/scoreboard` — Scoreboard (experiment_run_id, metric_count, weighted_score_proxy, etc.; ?domain=, ?limit=).

## Runner

- **Evolution poll** — Every 10s the runner tries to claim one row from `experiment_runs` where `status='queued'` (FOR UPDATE SKIP LOCKED), sets `status=running` and `started_at=now()`, then runs **evolution_replay**.
- **evolution_replay** — Loads experiment run, loads deploy_repair cohort from `cohort_filters` (incidents + repair_attempts), computes cohort summary, writes fitness_scores, sets outcome and `status=completed` (or `failed` with notes).
- **evolution_shadow** — Stub in V1; throws “not implemented; use replay.”

## Console

- **/evolution/mutations** — List mutation proposals (filters: domain, status).
- **/evolution/experiments** — List experiment runs (filter: status).
- **/evolution/scoreboard** — List experiment score summary (filter: domain).

## Guardrails (V1)

- **Deploy_repair only** — No other domains in evolution_targets or mutation logic.
- **No code/schema/policy-boundary mutation** — Only behavioral mutation: recipe order, thresholds, weights, backoff.
- **Replay-first** — Experiments use replay strategy; shadow/canary are not implemented in V1.
- **Low-risk targets first** — Target registry assigns risk from evolution_targets.mutability_level; locked targets reject patches.
- **Promotion gate** — Reject on baseline regression or no improvement; promote only when score_delta > 0 and no regression.

## DB

- **Migrations**: `20250404000000_evolution_loop_v1.sql` (mutation_proposals, experiment_runs, fitness_scores, promotion_decisions, views), `20250404000001_evolution_targets_seed.sql` (evolution_targets table + seed for deploy_repair).
- **run_events.id** is `bigint`; any FK from evolution tables to run_events uses `bigint`.
- **evolution_targets** seed uses `ON CONFLICT (domain, target_type, target_id) DO NOTHING`.

## Success criteria (Phase 1)

1. One mutation proposal can be created.
2. One experiment run can be created and replayed (runner picks it up, writes fitness_scores, sets outcome).
3. One promotion decision can be recorded (via API or auto-evaluate).
4. No kernel/domain boundary is violated (evolution lives in control-plane evolution module and runner evolution handlers; kernel stays runs/jobs/artifacts/events).

## Roadmap (Phases 2–6)

- **Phase 2** — Stabilize deploy vertical kernel.
- **Phase 3** — Extract kernel substrate (small, stable).
- **Phase 4** — Second vertical (e.g. SEO) on same engine.
- **Phase 5** — Product around one vertical.
- **Phase 6** — Reliability/observability hardening.

Only Phase 1 (this document) is implemented in Evolution Loop V1.
