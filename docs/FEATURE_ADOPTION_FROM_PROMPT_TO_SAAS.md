# Features Adopted from Prompt-to-SaaS Platforms

We are not building a "Lovable-style ecosystem." We take **their best features** (from Lovable, Base44, Replit AI, Bolt.new, etc.) and implement them our way with the LangGraph kernel, plan DAG, Supabase, and Render/Vercel. This doc lists which features we want, how we implement each, and which optional OSS we can plug in when useful.

**Implementation status:** The feature table below is implemented in this repo: plan compiler with agent_role and templates (software, issue_fix, migration, factory_ops, ci_gate, crew), ExecutorRegistry and handlers (analyze_repo, code_review, submit_pr, approval), agent_memory and predecessor artifacts, layout primitives (PageFrame, Stack, CardSection, TableFrame), admin registry and shadcn + DataTable. **Newly implemented:** LLM gateway Phases 3–5 (caching with safe/unsafe node lists, eval gates with Promptfoo/CI, self-optimizer script with routing_policies/llm_budgets DB), MCP client in runners (HTTP + stdio), MCP server config DB + Console UI, agent_memory Control Plane API + Console list, enhanced run detail with per-node LLM usage, Cost page with job_type breakdown, GitHub Action for evals. Optional OSS (Refine, RepoMaster, v0, SWE-Agent) remain doc-only or stub where noted.

---

## Feature adoption table

| Feature | How we do it | Optional OSS we can use |
|--------|---------------|--------------------------|
| **Spec / architecture** | Plan compiler (prd → design → code → test → review); agent_role (product_manager, architect, engineer, qa, reviewer); templates: software, issue_fix, migration, factory_ops, ci_gate | MetaGPT (pattern reference only); GPT Engineer, Smol Developer (patterns/prompts for spec→code) |
| **Schema → UI** | Hand-built shadcn + TanStack Table + admin registry; Refine documented as optional | Refine (refinedev/refine) for schema-driven CRUD if we want generated admin panels |
| **Code agents** | job_type → executor mapping; kernel contract; ExecutorRegistry; codefix→SWE-Agent, pr_review→PR-Agent, research→CrewAI, etc. | SWE-Agent, OpenHands (executors); PR-Agent (custom) |
| **Deploy automation** | Branch-based deploy (main/prod), Render + Vercel, migrate-and-test workflow | — |
| **Stateful agents** | agent_memory table, initiative scope, predecessor artifacts, producer_plan_node_id | — |
| **Repo context** | AnalyzeRepo node, repo_summary artifact, workspace_path, Repo-to-MCP | RepoMaster (see below) |
| **Prompt → UI scaffolding** | v0/Cursor prompts + layout primitives (PageFrame, Stack, CardSection, TableFrame, 8px grid) | v0 (vercel/v0) for rapid UI generation |
| **Generated app foundations** | Not used for Console; factory may generate apps | Makerkit (makerkit/nextjs-saas-starter), Open SaaS (wasp-lang/open-saas) for auth/billing/teams in generated apps |
| **LLM routing / cost optimization** | LiteLLM Proxy as gateway; AUTO/FAST/MAX tiers; runners use [runners/src/llm-client.ts](../runners/src/llm-client.ts); observability (Langfuse/Helicone); optional caching, eval gates, self-tuning | LiteLLM, Langfuse, Helicone, GPTCache, Promptfoo, DeepEval, DSPy — see [LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md) |
| **Brand Engine / tokenized identity** | brand_profiles, design_tokens, brand embeddings, document generation (decks/reports), brand context in LLM prompts | Style Dictionary, PptxGenJS, pgvector |
| **Quality gates + slop guard + continuous improvement** | Quality dimensions config + validations; L0/L1 slop guard; nightly optimizer run → PRs | macaron-software/software-factory (ideas only) |

All OSS listed are **optional tools or plugins**, not core dependencies. We take their best ideas and implement with our own stack.

---

## Repo intelligence (optional): RepoMaster or equivalent

**What it is:** Platforms like Lovable use deep repo understanding (dependency graph, function call graph, architecture map, hotspots) so code agents can navigate and patch large codebases. We already have **AnalyzeRepo** → `repo_summary` / RAG and Repo-to-MCP, but we do not yet have first-class **dependency graph**, **function call graph**, or **architecture map** as inputs for debugging and patching agents.

**Optional tool:** **RepoMaster** (GitHub: QuantaAlpha/RepoMaster) provides:

- Repo → dependency graph → function call graph → architecture map → hotspots

This is useful for codefix, issue_fix, and migration runs when agents need to understand structure and find hotspots.

**How it would plug in:**

- As an **adapter or MCP** that runs against a repo (or workspace_path) and produces an artifact (e.g. `architecture_map` or `dependency_graph`).
- Downstream nodes (WritePatch, code_review, migration steps) can consume that artifact via predecessor_artifacts and use it for context.
- Integration path: register an adapter or MCP that calls RepoMaster (or equivalent), writes an artifact with `producer_plan_node_id`, and optionally a new plan template that includes an "AnalyzeRepoDeep" or "RepoArchitecture" node before WritePatch/code_review.

**Status:** Documented as optional. No code change required until we decide to add the adapter/MCP. See also [docs/STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md) and [docs/UI_DEBUGGING_LAYOUT_CHECKLIST.md](UI_DEBUGGING_LAYOUT_CHECKLIST.md) §11 (Self-healing pipeline) for checklist items that reference RepoMaster.

---

## Optional OSS references (short)

- **Makerkit / Open SaaS:** Optional references for **generated apps** (auth, billing, teams) that the factory might produce—not for the Console itself.
- **GPT Engineer / Smol Developer:** We use our own plan compiler + LangGraph + executors; these are optional sources for patterns or prompts when we want to improve spec→code flows.
- **Refine:** Already evaluated; we use hand-built shadcn + TanStack Table; Refine remains an optional path for schema→CRUD if we add generated admin surfaces later.
- **v0:** Documented in [docs/UI_AND_CURSOR.md](UI_AND_CURSOR.md) for prompt→UI scaffolding; we use our layout primitives and design tokens so generated code matches our stack.

---

## 8090 Software Factory (macaron-software)

**Source:** [macaron-software/software-factory](https://github.com/macaron-software/software-factory)

Three ideas adopted:

1. **Quality Factory Line**: `config/quality_dimensions.yaml` defines dimensions (complexity, coverage, lint, etc.) + phase-based gates. Runners evaluate dimensions and write to `validations`. See [docs/SLOP_GUARD_AND_QUALITY_GATES.md](SLOP_GUARD_AND_QUALITY_GATES.md).
2. **Adversarial Slop Guard**: `config/slop_guard.yaml` with L0 deterministic rules (regex, policy) + L1 semantic LLM judge. L0 runs first; L1 only when L0 passes. Reduces token burn.
3. **Continuous Improvement**: Nightly optimizer run reads metrics, suggests routing/prompt/gate improvements, opens PRs. See [docs/CONTINUOUS_IMPROVEMENT_JOB_SPEC.md](CONTINUOUS_IMPROVEMENT_JOB_SPEC.md).

**Bonus**: 4-layer memory convention (session/pattern/project/global via `agent_memory.scope`) and auto-loaded context (`config/context_loader.yaml`).
