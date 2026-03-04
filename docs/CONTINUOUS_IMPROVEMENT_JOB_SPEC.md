# Continuous Improvement Job Spec

Inspired by [macaron-software/software-factory](https://github.com/macaron-software/software-factory). A scheduled workflow that scans metrics, identifies worst dimensions, and proposes improvements via PR.

## Trigger

Cron (e.g. `0 2 * * *` UTC) or GitHub Action scheduled workflow. Calls Control Plane API to create an initiative with `intent_type = continuous_improvement`.

## Plan Template

DAG: `aggregate_metrics` -> `identify_improvements` -> `generate_patches`

Or single node: `optimizer` (job_type `optimizer`).

## Optimizer Node

**Input:** Last 7 days of telemetry: run outcomes, validation pass/fail rates by dimension, llm_calls cost/latency by job_type, cache hit rates, error signatures.

**Output:** `improvement_spec` artifact (JSON) with:
- `routing_changes`: job_type tier adjustments (e.g. "promote codegen to MAX")
- `quality_changes`: threshold adjustments in quality_dimensions.yaml
- `slop_guard_additions`: new L0 rules for slop_guard.yaml
- `prompt_improvements`: prompt tweaks per job_type
- `summary`: human-readable summary

## What the Optimizer Can Change (via PR)

1. `gateway/config.yaml` — routing, model tiers per job_type
2. Prompt files — e.g. `prompts/code_review.txt`
3. `config/quality_dimensions.yaml` — thresholds, new dimensions
4. `config/slop_guard.yaml` — new L0 rules
5. `evals/promptfoo/promptfooconfig.yaml` — new test cases

All changes go through PR; no direct writes to main/prod.

## GitHub Action (Optional)

`.github/workflows/continuous-improvement.yml`:
- Schedule: `cron: '0 2 * * *'`
- Steps: (1) Call CP API to create `continuous_improvement` initiative and run. (2) Poll run status until complete. (3) Fetch `improvement_spec` artifact. (4) Create branch, apply patches, open PR.

## Safety

- PR-only mode (never push to protected branches)
- Max 1 improvement run per day
- Human review required before merge
- Approval gate for dependency/security changes

## Relation to LLM Gateway Optimization

This is the implementation of **Phase 5 (Self-optimizer control loop)** from [docs/LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md). The optimizer run reads telemetry and produces routing/budget/caching policy updates.

## Handler

Implemented in `runners/src/handlers/optimizer.ts`. Registered as job_type `optimizer`.
