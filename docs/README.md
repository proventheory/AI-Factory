# AI Factory — Internal Documentation Index

This folder contains internal documentation for the AI Factory monorepo. Keep these files in sync with the actual architecture and code.

## Architecture and stack

| Document | Purpose |
|----------|---------|
| **[STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md)** | Locked stack choices (Next.js, shadcn, Supabase, Vercel, Render), repo layout, env vars, kernel contract, build order. **Start here** for how the system is built and run. |
| **[FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md](FEATURE_ADOPTION_FROM_PROMPT_TO_SAAS.md)** | Features adopted from Lovable/Bolt/Replit etc.: plan compiler, agent_role, schema→UI, code agents, deploy automation. Implementation status and optional OSS. |
| **[BRAND_ENGINE.md](BRAND_ENGINE.md)** | Brand Engine: tokenized brand identity, brand profiles, design tokens, document generation, brand embeddings, brand-aware AI pipeline. |

## UI and design

| Document | Purpose |
|----------|---------|
| **[UI_AND_CURSOR.md](UI_AND_CURSOR.md)** | Canonical components (AppShell, DataTable, PageFrame, Stack, CardSection), design tokens, React Query hooks, Ops/Admin routes, 8px grid, v0/Cursor guidance. |
| **[UI_DEBUGGING.md](UI_DEBUGGING.md)** | External tools (Polypane, Responsively App), Storybook and Playwright, layout test failures, design rules for agents. |
| **[DESIGN_TOKENS.md](DESIGN_TOKENS.md)** | Design tokens source of truth (`console/src/design-tokens/tokens.ts`), colors/typography/spacing, Tailwind theme, brand_themes schema. |
| **[CONSOLE_UI_LIBRARY.md](CONSOLE_UI_LIBRARY.md)** | How Console UI is built: shadcn + layout primitives, design tokens, component list. |
| **[NAV_ARCHITECTURE_TRAPS_AND_FIXES.md](NAV_ARCHITECTURE_TRAPS_AND_FIXES.md)** | Navigation architecture pitfalls and fixes. |
| **[WIDGET_STACK_DECISIONS.md](WIDGET_STACK_DECISIONS.md)** | Widget stack decisions. |

## Email and templates

| Document | Purpose |
|----------|---------|
| **[BRAND_EMAIL_FIELD_MAPPING.md](BRAND_EMAIL_FIELD_MAPPING.md)** | **Single source of truth** for email placeholders (e.g. `[product A title]`, `[image_url]`), template contracts, and placeholder vs contract semantics. |
| **[EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md](EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md)** | Template contract spec: content images, product slots, logo_safe_hero, schema and Control Plane behavior. |
| **[EMAIL_SEED_AND_DELETE.md](EMAIL_SEED_AND_DELETE.md)** | How to seed email templates and delete them (scripts, API, Console). |
| **[POST_DEPLOY_SEEDS.md](POST_DEPLOY_SEEDS.md)** | Post-deploy seed steps (email templates, component library, etc.). |
| **[TEMPLATE_IMAGE_QA_CHECKLIST.md](TEMPLATE_IMAGE_QA_CHECKLIST.md)** | Template image QA checklist. |
| **[SUPABASE_EMAIL_SCHEMA_DEPLOY.md](SUPABASE_EMAIL_SCHEMA_DEPLOY.md)** | Supabase email schema and deploy notes. |
| **[EMAIL_MARKETING_FACTORY_INTEGRATION.md](EMAIL_MARKETING_FACTORY_INTEGRATION.md)** | Email Marketing Factory app in `email-marketing-factory/`, base path, proxy from Console. |

## Brand tokens

| Document | Purpose |
|----------|---------|
| **[BRAND_DECK_REFERENCE_SCHEMA.md](BRAND_DECK_REFERENCE_SCHEMA.md)** | Token contract: three layers (core tokens, semantic roles, channel mappings), alias policy, fallback precedence, completeness model. Brand System View reference. |
| **[BRAND_TOKEN_VALIDATION.md](BRAND_TOKEN_VALIDATION.md)** | Validation rules for colors, typography, and deck/report theme references. Runs on Console Edit submit; legacy shapes allowed. |
| **[BRAND_TOKENS_AND_PACKAGES.md](BRAND_TOKENS_AND_PACKAGES.md)** | Brand tokens: Console write-through, packages/tokens (TokenService, export CSS/email), upgrade plan alignment. |
| **[BRAND_TOKENS_TAXONOMY.md](BRAND_TOKENS_TAXONOMY.md)** | Brand tokens taxonomy. |
| **[BRAND_TOKENS_MIGRATION_MAPPING.md](BRAND_TOKENS_MIGRATION_MAPPING.md)** | Brand tokens migration mapping. |
| **[BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md)** | Brand design tokens upgrade plan. |
| **[brand-deck-example.json](brand-deck-example.json)** | Example JSON for a full brand (design_tokens, deck_theme, report_theme). Use with seed scripts or API. |

## Deployment and operations

| Document | Purpose |
|----------|---------|
| **[DEPLOY_ENV_SETUP.md](DEPLOY_ENV_SETUP.md)** | Deploy environment setup. |
| **[DEPLOYMENT_PLAN_WITH_MCP.md](DEPLOYMENT_PLAN_WITH_MCP.md)** | Steps to put the factory on the web: Supabase, Control Plane, Console, LLM Gateway, MCP, Email Marketing Factory. |
| **[DEPLOY_PHASE3_CHECKLIST.md](DEPLOY_PHASE3_CHECKLIST.md)** | Phase 3 checklist: GitHub Actions secrets/variables, workflow env check. |
| **[RENDER_SETUP.md](RENDER_SETUP.md)** | Render setup for Control Plane / services. |
| **[STAGING_RENDER_CHECKLIST.md](STAGING_RENDER_CHECKLIST.md)** | Staging and Render checklist. |
| **[RUNNERS_DEPLOYMENT.md](RUNNERS_DEPLOYMENT.md)** | Runners deployment. |
| **[SECURITY_AND_RUNBOOKS.md](SECURITY_AND_RUNBOOKS.md)** | Security and runbooks. |
| **[SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)** | How to trigger self-heal (LLM Gateway, quality gates). |
| **[VAULT_KEYS.md](VAULT_KEYS.md)** | Vault keys reference. |
| **[VERCEL_PREVIEW_PUBLIC_ACCESS.md](VERCEL_PREVIEW_PUBLIC_ACCESS.md)** | Vercel preview public access. |
| **[VERCEL_TEST_WITHOUT_DEPLOYING.md](VERCEL_TEST_WITHOUT_DEPLOYING.md)** | Testing on Vercel without deploying. |

## LLM and quality

| Document | Purpose |
|----------|---------|
| **[LLM_GATEWAY_AND_OPTIMIZATION.md](LLM_GATEWAY_AND_OPTIMIZATION.md)** | LLM Gateway (LiteLLM), AUTO/FAST/MAX routing, observability, Cost/Usage view, caching, eval gates, self-tuning, self-healing. |
| **[SLOP_GUARD_AND_QUALITY_GATES.md](SLOP_GUARD_AND_QUALITY_GATES.md)** | Quality Factory Line (phase-based gates) and Adversarial Slop Guard (L0 deterministic + L1 semantic). |
| **[CONTINUOUS_IMPROVEMENT_JOB_SPEC.md](CONTINUOUS_IMPROVEMENT_JOB_SPEC.md)** | Nightly optimizer run: scan metrics, suggest improvements, open PRs. |

## Console and storage

| Document | Purpose |
|----------|---------|
| **[CONSOLE_SUPABASE_STORAGE.md](CONSOLE_SUPABASE_STORAGE.md)** | Console and Supabase storage. |
| **[ENABLEMENT_ENV_VARS.md](ENABLEMENT_ENV_VARS.md)** | Env vars that enable optional features: ENABLE_SELF_HEAL, OPTIMIZER_APPLY, NEXT_PUBLIC_FEATURE_*. |
| **[E2E_SYSTEM_SMOKE_TASK.md](E2E_SYSTEM_SMOKE_TASK.md)** | E2E system smoke task. |

## Other

| Document | Purpose |
|----------|---------|
| **[AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md](AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md)** | What you can do and test with the agency/ProfessorX setup. |
| **[NOTION_PT_INTEGRATION.md](NOTION_PT_INTEGRATION.md)** | Notion PT Project Manager Agent integration (planning/tasks). |

---

**Repo layout:** `console/` (ProfessorX, Next.js + shadcn), `control-plane/` (REST API, plan compiler, scheduler), `runners/` (ExecutorRegistry, handlers), `supabase/` (migrations), `email-marketing-factory/`, `docs/`.
