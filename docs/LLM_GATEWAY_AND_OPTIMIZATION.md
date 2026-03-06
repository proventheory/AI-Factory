# LLM Gateway and Optimization Layer (Cursor-style Auto/Max Mode)

This doc is the single source of truth for the AI Factory’s **cost/quality optimization layer**: an AI gateway and observability stack that sits between the LangGraph kernel and model providers. It provides cheap-model-first routing, token budgets, caching, observability, eval gates, and optional self-tuning.

---

## Architecture

```
Console (Vercel)  →  Control Plane (Render)  →  LangGraph / Scheduler
                                                         ↓
Runners (executors)  →  LLM Gateway (LiteLLM Proxy)  →  Observability (Langfuse/Helicone)
                                                         ↓
                                                    Cache (LiteLLM / GPTCache)
                                                         ↓
                                                    Model providers (OpenAI, Anthropic, …)
```

- **Insertion point:** Every LLM call from Runners (and any future Control Plane LLM use) goes to `LLM_GATEWAY_URL`. Provider API keys live only in the gateway.
- **Schema:** The `llm_calls` table (run_id, job_run_id, model_tier, model_id, tokens_in, tokens_out, latency_ms) is used for audit and cost aggregation. See [supabase/migrations/20250303000000_ai_factory_core.sql](../supabase/migrations/20250303000000_ai_factory_core.sql).

---

## Routing tiers (Cursor-style modes)

| Tier | Behavior | Use case |
|------|----------|----------|
| **AUTO** | Cheap model first; escalate to next tier only on failure or low confidence. | Default for most job types (plan_compile, code_review, triage). |
| **FAST** | Cheapest model + aggressive caching; limited retries. | High-volume, deterministic-ish nodes (summarizers, classifiers). |
| **MAX** | Best model; higher token budgets; deeper tool usage. | codefix, complex reasoning, repair agents. |

Gateway config exposes these as **model names** (e.g. `auto/chat`, `fast/chat`, `max/chat`) so callers pass `model` in the request; the gateway resolves to the right provider/model and fallback chain.

---

## Environment variables

**Runners / executors (required when executors call LLMs):**

- `LLM_GATEWAY_URL` — Base URL of the LiteLLM Proxy (e.g. `https://llm-gateway.onrender.com`). All executors use this instead of calling OpenAI/Anthropic directly.

**Gateway (LiteLLM Proxy):**

- `OPENAI_API_KEY` — OpenAI API key (set in Render/Fly env or gateway config).
- `ANTHROPIC_API_KEY` — Anthropic API key (optional; for claude models in MAX tier).
- `REDIS_URL` — Redis connection URL for response caching (Phase 3). Required when `cache: true` in config.yaml. Falls back to in-memory cache if Redis is unavailable.
- `LANGFUSE_SECRET_KEY` — Optional; forward traces to Langfuse.
- `LANGFUSE_PUBLIC_KEY` — Optional; for Langfuse.
- Or Helicone keys if using Helicone instead of Langfuse.

**Control Plane:**

- No change until a Control Plane flow (e.g. plan_compile) calls an LLM; then set `LLM_GATEWAY_URL` for that service as well.

**Console (optional):**

- `NEXT_PUBLIC_LANGFUSE_URL` — Link to Langfuse project for cost/telemetry UI.
- Or use Helicone dashboard link; Cost/Usage page can read from Control Plane API that aggregates `llm_calls` if you prefer not to expose Langfuse.

**Error reporting (Sentry) — wired:**

- `SENTRY_DSN` — Optional. When set, Control Plane, Runner, and Console (Next.js) report errors to Sentry. Set in repo root `.env` for Control Plane and Runner; set in Vercel env for Console (or `NEXT_PUBLIC_SENTRY_DSN` for client-side). See [REFERENCE_REPOS_DISCUSSED.md](REFERENCE_REPOS_DISCUSSED.md) (Observability).

---

## OSS we use and what we borrow

| Layer | Repo | What we use |
|-------|------|-------------|
| **LLM Gateway** | [BerriAI/litellm](https://github.com/BerriAI/litellm) | Router, fallbacks (cheap-first, escalate on fail), budgets, rate limits, response caching. Deploy as separate service (e.g. Render); config in `gateway/`. |
| **Observability** | [langfuse/langfuse](https://github.com/langfuse/langfuse) or [Helicone/helicone](https://github.com/Helicone/helicone) | Traces per run/node; cost per job_type/model. Langfuse: prompt/version + evals. Helicone: proxy-based cost dashboards. |
| **Semantic cache** | [zilliztech/GPTCache](https://github.com/zilliztech/GPTCache) | Similar-prompt → reuse; use only for deterministic-ish nodes. Can sit behind LiteLLM or as separate layer; scope by initiative_id / job_type / input hash. |
| **Eval / regression** | [promptfoo/promptfoo](https://github.com/promptfoo/promptfoo) | Prompt CI; run in GitHub Actions on PR. |
| **LLM unit tests** | [confident-ai/deepeval](https://github.com/confident-ai/deepeval) | Tests for critical job types; run in CI. |
| **Self-tuning** | [stanfordnlp/dspy](https://github.com/stanfordnlp/dspy) | Optional: policy optimizer compiles better prompts for stable tasks. |
| **Self-healing** | [OpenHands/OpenHands](https://github.com/OpenHands/OpenHands), [SWE-agent/SWE-agent](https://github.com/SWE-agent/SWE-agent) | Label-triggered auto-fix PRs; gate after eval gates exist. |

---

## Repo artifacts

- **gateway/** — LiteLLM Proxy config (`config.yaml`), Dockerfile. Deploy as own service; provider keys only in gateway env.
- **runners/src/llm-client.ts** — Thin client used by executors: calls `LLM_GATEWAY_URL` with model tier, job_type, run_id, job_run_id for routing and for logging to `llm_calls` (or Langfuse).
- **Console** — Cost/Usage page: read from Langfuse API or from Control Plane API that aggregates `llm_calls`.
- **evals/** — Promptfoo config and DeepEval tests for critical prompts/job types; GitHub Action to run on PR.
- **Schema** — `llm_calls` (existing), `routing_policies`, `llm_budgets` — see `supabase/migrations/20250303000006_gateway_and_mcp.sql`.
- **scripts/optimizer.ts** — Phase 5 optimizer: reads telemetry, outputs routing/budget suggestions, optionally applies to DB.

---

## Phases (implementation order)

1. **Phase 1 — Gateway:** Deploy LiteLLM Proxy; document `LLM_GATEWAY_URL`; define AUTO/FAST/MAX in config; add doc and `gateway/`. **Done:** gateway/, runners llm-client, env docs.
2. **Phase 2 — Observability:** Choose Langfuse or Helicone; wire gateway callbacks; add Console Cost/Usage view. **Done:** Control Plane `GET /v1/llm_calls`, `GET /v1/usage`; Console `/admin/costs` page.
3. **Phase 3 — Caching:** Enable caching in LiteLLM for safe routes; document safe vs unsafe nodes. **Done:** gateway/config.yaml (Redis cache enabled, 1h TTL), runners/src/llm-client.ts (x-cache-scope header, safe/unsafe job_type lists), gateway/README.md updated.
4. **Phase 4 — Eval gates:** Promptfoo suite with real prompts per job_type; GitHub Action on PR. **Done:** evals/promptfoo/promptfooconfig.yaml (plan_compile, code_review, triage, analyze_repo, codegen — 8 test cases), .github/workflows/evals.yml, evals/README.md updated.
5. **Phase 5 — Self-optimizer:** Policy optimizer script; reads telemetry, outputs routing/budget suggestions; stores in DB. **Done:** scripts/optimizer.ts, Control Plane `GET /v1/usage/by_job_type`, `GET /v1/usage/by_model`, `GET/POST /v1/routing_policies`, `GET/POST /v1/llm_budgets`, migration 20250303000006. Phase 5 is now implemented via the `optimizer` job_type and `continuous_improvement` initiative type. See [docs/CONTINUOUS_IMPROVEMENT_JOB_SPEC.md](CONTINUOUS_IMPROVEMENT_JOB_SPEC.md).
6. **Phase 6 — Self-healing:** OpenHands Resolver (label-triggered `fix-me`, PR-only); SWE-agent as MAX-mode fixer. **Done:** GitHub webhook handles `fix-me` label → creates self-heal initiative + plan (`self_heal` or `swe_agent` template). `runners/src/openhands-resolver.ts` (Docker → CLI → LLM fallback). `runners/src/swe-agent.ts` (CLI → Docker → LLM fallback). Gating policy documented (eval pass + human approval required).

---

## Safe vs unsafe nodes for caching

**Safe to cache (deterministic-ish):** classification, triage, rubric grading, template generation, metadata extraction, repeated repo analysis output for same commit.

**Unsafe:** outputs that contain secrets/PHI; one-off user-specific content; code generation that must be unique per run. Scope cache by initiative_id, job_type, and input hash; do not cache when request carries a no-cache header or flag.

### Safe/unsafe classification by job_type

| job_type | Classification | Reason |
|----------|---------------|--------|
| triage | Safe | Deterministic classification; same issue → same severity/type |
| analyze_repo | Safe | Same repo/commit → same summary |
| code_review | Safe | Same diff → same verdict (rubric-based) |
| plan_compile | Safe | Same initiative → same plan structure |
| plan_migration | Safe | Same schema → same migration plan |
| research | Safe | Same topic → similar summary |
| codegen | Unsafe | Must produce unique code per run |
| write_patch | Unsafe | Context-dependent patches |
| submit_pr | Unsafe | Side-effectful (creates PR) |
| apply_batch | Unsafe | Side-effectful (applies migration) |
| openhands_resolver | Unsafe | Context-dependent fix generation |
| prd | Unsafe | Each PRD should be unique to initiative |
| design | Unsafe | Architecture decisions vary per context |
| unit_test | Unsafe | Tests should be unique to code |
| approval | N/A | No LLM call (human action) |

Implementation: `runners/src/llm-client.ts` exports `SAFE_TO_CACHE` and `UNSAFE_TO_CACHE` sets. The `chat()` function sends `x-cache-scope: safe` or `cache-control: no-cache` based on job_type. When adding a new job_type, add it to the appropriate set and update this table.

---

### Slop Guard (L0/L1)

After an executor produces artifacts, the **Slop Guard** runs: L0 deterministic checks (regex for TODO/TBD/NotImplementedError/fake URLs/secrets) then L1 semantic LLM judge (FAST tier, only when L0 passes). Config: `config/slop_guard.yaml`. See [docs/SLOP_GUARD_AND_QUALITY_GATES.md](SLOP_GUARD_AND_QUALITY_GATES.md).

### Quality Gates (Phase-Based)

Quality dimensions (complexity, coverage, lint, type_check, etc.) are evaluated per plan phase via `config/quality_dimensions.yaml`. Results stored in `validations`. Gates group dimensions into checkpoints (code_quality, test_quality, security, release_ready). Runners use `quality_gate` job_type. See [docs/SLOP_GUARD_AND_QUALITY_GATES.md](SLOP_GUARD_AND_QUALITY_GATES.md).

---

## Cache invalidation (Phase 3)

Cache entries expire via **TTL** (default 3600s / 1 hour in `gateway/config.yaml`). To manually invalidate:

- **Redis CLI:** `redis-cli -u $REDIS_URL FLUSHDB` (clears all cached responses).
- **Per-key:** LiteLLM does not expose per-key invalidation; rely on TTL expiry or flush.
- **Rollout:** After deploying new prompts or changing model routing, flush cache to avoid stale responses.

LiteLLM exposes cache hit/miss via Langfuse trace metadata when callbacks are enabled. Monitor `cache_hit` in Langfuse to measure hit rate.

---

## GPTCache decision

**Decision: No.** LiteLLM Redis exact-match caching handles our needs. GPTCache (semantic/embedding-based) would require deploying an embedding model, tuning similarity thresholds, and maintaining a separate service — all for marginal improvement over exact-match on structured prompts. Our job types send structured inputs (JSON, specs, diffs) where exact-match works well.

---

## DSPy decision

**Decision: No.** DSPy requires 100+ examples per task to compile optimized prompts. We don't have that volume yet. Manual prompt iteration with Promptfoo evals (8 test cases, 2 models) is more effective and faster to iterate. If we reach 100+ logged examples per job type and want to automate prompt tuning, DSPy can be added as a step in the optimizer script — but that's not warranted now.

---

## Self-healing gating policy (Phase 6)

Self-healing PRs (triggered by `fix-me` label via webhook) must **not be auto-merged**. Policy:

1. **Eval gate required:** Promptfoo and/or DeepEval must pass on the PR branch before merge is allowed.
2. **Human approval optional:** When `ENABLE_SELF_HEAL=true`, PRs are created but require at least one human review.
3. **Status checks:** Configure GitHub branch protection to require the `Evals (Prompt CI)` workflow to pass.
4. **Rollback:** If a self-healing PR introduces regression (detected by evals or drift monitor), the release manager triggers auto-rollback.

---

## Related pages

- **Evals:** [evals/README.md](../evals/README.md) — Promptfoo and DeepEval tests, CI instructions.
- **MCP:** [docs/DEPLOYMENT_PLAN_WITH_MCP.md](DEPLOYMENT_PLAN_WITH_MCP.md) — MCP server config and Console UI.
- **Cost/Usage:** Console `/admin/costs` page — LLM call usage by tier, job type, and model.
- **Optimizer:** `scripts/optimizer.ts` — Reads telemetry, suggests routing/budget changes.
- **Routing policies:** Control Plane `GET/POST /v1/routing_policies` and `GET/POST /v1/llm_budgets`.

---

## Links

- [LiteLLM](https://github.com/BerriAI/litellm) — proxy, routing, fallbacks, budgets, caching.
- [Langfuse](https://github.com/langfuse/langfuse) — traces, prompts, evals.
- [Helicone](https://github.com/Helicone/helicone) — proxy-based cost analytics.
- [GPTCache](https://github.com/zilliztech/GPTCache) — semantic cache (evaluated, not adopted; see decision above).
- [Promptfoo](https://github.com/promptfoo/promptfoo) — prompt CI.
- [DeepEval](https://github.com/confident-ai/deepeval) — LLM unit testing.
- [DSPy](https://github.com/stanfordnlp/dspy) — prompt optimization (evaluated, not adopted; see decision above).
- [OpenHands](https://github.com/OpenHands/OpenHands) — self-healing resolver.
- [SWE-agent](https://github.com/SWE-agent/SWE-agent) — issue → patch → PR.
- [tokencost](https://github.com/AgentOps-AI/tokencost) — optional cost estimation for router/dashboards.
