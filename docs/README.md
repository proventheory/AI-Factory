# AI Factory — Internal Documentation Index

This folder contains internal documentation for the AI Factory monorepo. Keep these files in sync with the actual architecture and code.

## Architecture and stack

| Document | Purpose |
|----------|---------|
| **[STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md)** | Locked stack choices (Next.js, shadcn, Supabase, Vercel, Render), repo layout, env vars, kernel contract, build order. **Start here** for how the system is built and run. |
| **[FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md](FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md)** | Features adopted from Lovable/Bolt/Replit etc.: plan compiler, agent_role, schema→UI, code agents, deploy automation, stateful agents, repo context, prompt→UI. Implementation status and optional OSS (Refine, RepoMaster, v0). |
| **[BRAND_ENGINE.md](BRAND_ENGINE.md)** | Brand Engine: tokenized brand identity, brand profiles, design tokens, document generation (decks, reports), brand embeddings, brand-aware AI pipeline. |

## UI and design

| Document | Purpose |
|----------|---------|
| **[UI_AND_CURSOR.md](UI_AND_CURSOR.md)** | Canonical components (AppShell, DataTable, PageFrame, Stack, CardSection, TableFrame), design tokens, React Query hooks, Ops/Admin routes, example Cursor prompts, 8px grid, v0/Cursor guidance. |
| **[UI_DEBUGGING.md](UI_DEBUGGING.md)** | External tools (Polypane, Responsively App, Locofy, tailwindcss-debug-screens), Storybook and Playwright in-repo, what to do when layout tests fail, design rules for agents. |
| **[DESIGN_TOKENS.md](DESIGN_TOKENS.md)** | Design tokens source of truth (`console/src/design-tokens/tokens.ts`), colors/typography/spacing/radius/shadow, Tailwind theme, `generated.css`, brand_themes schema. |
| **[CONSOLE_UI_LIBRARY.md](CONSOLE_UI_LIBRARY.md)** | How Console UI is built: shadcn + layout primitives, design tokens, component list and adding new blocks. |

## Deployment and integrations

| Document | Purpose |
|----------|---------|
| **[LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md)** | LLM Gateway (LiteLLM), AUTO/FAST/MAX routing, observability, Cost/Usage view, caching, eval gates, self-tuning, self-healing. |
| **[SLOP_GUARD_AND_QUALITY_GATES.md](SLOP_GUARD_AND_QUALITY_GATES.md)** | Quality Factory Line (phase-based gates, dimensions) and Adversarial Slop Guard (L0 deterministic + L1 semantic). |
| **[CONTINUOUS_IMPROVEMENT_JOB_SPEC.md](CONTINUOUS_IMPROVEMENT_JOB_SPEC.md)** | Nightly optimizer run: scan metrics, suggest improvements, open PRs. Phase 5 of LLM Gateway plan. |
| **[DEPLOYMENT_PLAN_WITH_MCP.md](DEPLOYMENT_PLAN_WITH_MCP.md)** | Steps to put the factory on the web: Supabase, Control Plane (Fly/Render), Console (Vercel), LLM Gateway, MCP connections, Email Marketing Factory. |
| **[DEPLOY_PHASE3_CHECKLIST.md](DEPLOY_PHASE3_CHECKLIST.md)** | One-time Phase 3 checklist: GitHub Actions secrets/variables and optional branch protection; workflow env check. |
| **[EMAIL_MARKETING_FACTORY_INTEGRATION.md](EMAIL_MARKETING_FACTORY_INTEGRATION.md)** | Email Marketing Factory app in `email-marketing-factory/`, base path `/email-marketing`, proxy from Console, schema alignment. |
| **[BRAND_TOKENS_AND_PACKAGES.md](BRAND_TOKENS_AND_PACKAGES.md)** | Brand tokens: Console write-through, packages/tokens (TokenService, export CSS/email), and upgrade plan alignment. |

## Checklists and plans (reference)

| Document | Purpose |
|----------|---------|
| **[REFERENCE_REPOS_DISCUSSED.md](REFERENCE_REPOS_DISCUSSED.md)** | Full list of GitHub repos we discussed (AI orchestration, workflow engines, schema/vector/UI/observability). Priority subset for AI Factory + ProfessorX; gaps vs current stack. |
| **[TODO_MULTI_FRAMEWORK_PLAN.md](TODO_MULTI_FRAMEWORK_PLAN.md)** | Multi-framework implementation checklist (agent_role, plan compiler, approvals, scheduler, runner context, etc.); status 100% complete. |
| **[PLATFORM_UI_REVAMP_CHECKLIST.md](PLATFORM_UI_REVAMP_CHECKLIST.md)** | Platform UI revamp with shadcn and unified design system — checklist. |
| **[UI_DEBUGGING_LAYOUT_CHECKLIST.md](UI_DEBUGGING_LAYOUT_CHECKLIST.md)** | UI debugging tools and layout system — granular checklist. |

## Other internal docs

- **NOTION_PT_INTEGRATION.md** — Notion PT Project Manager Agent integration (planning/tasks).
- **GAP_AND_WHAT_I_NEED.md**, **EXECUTION_SUMMARY.md**, **TODO_BY_LINE.md**, **TODO_IMPLEMENTATION_2000.md** — Session or task-specific notes; may be outdated.

---

**Repo layout (current):** `console/` (ProfessorX, Next.js + shadcn), `control-plane/` (REST API, plan compiler, scheduler), `runners/` (ExecutorRegistry, handlers), `supabase/` (migrations), `email-marketing-factory/`, `docs/`.
