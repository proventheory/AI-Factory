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
| **[EMAIL_DESIGN_VS_CAMPAIGN.md](EMAIL_DESIGN_VS_CAMPAIGN.md)** | Naming: `email_design_generator` (design initiatives) vs *email campaign* (sent via Klaviyo operator pack). |
| **[KLAVIYO_OPERATOR_PACK.md](KLAVIYO_OPERATOR_PACK.md)** | **Klaviyo operator pack (Phases 1–4):** templates + campaigns push, flow scaffolding, performance/recommendations, Console `/klaviyo`, API, migrations, how to test. |

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

## Graph engine and self-heal

| Document | Purpose |
|----------|---------|
| **[GRAPH_ENGINE_AND_SELF_HEAL.md](GRAPH_ENGINE_AND_SELF_HEAL.md)** | **Graph & self-heal:** what’s implemented, migrations, how to run Control Plane / Runner / Console, full API reference, Console views. |
| **[GRAPH_ENGINE_PLAN_STATUS.md](GRAPH_ENGINE_PLAN_STATUS.md)** | **100% plan status:** checklist of all plan items (Part D, E, F, I.2, L, Phases 1–7) and prompt-built pipelines. |
| **[PIPELINE_GENERATION.md](PIPELINE_GENERATION.md)** | **Pipeline & app generation:** prompt-built pipelines 100% V2 (draft, save/load, templates, compose, deploy pattern, Console start run); real app generation (Track B) planned. |
| **[LAUNCH_KERNEL_V1.md](LAUNCH_KERNEL_V1.md)** | **Launch kernel:** BuildSpec, LaunchArtifact contract, deploy (Vercel/Render/Netlify/Railway/Fly), DNS (Cloudflare/Vercel), strategy-doc parser, extended BuildSpec, repo provisioning, runner `deploy_preview`, Console Launches UI. |
| **[BUSINESS_OPERATOR_V1.md](BUSINESS_OPERATOR_V1.md)** | **Stage 4 kernel maturity:** Business Operator V1 scope, required adapters (ads, metrics, experiments), and scaffold. Builds on Dev Kernel V1 + Action Kernel V1. |
| **[ADS_COMMERCE_OPERATOR.md](ADS_COMMERCE_OPERATOR.md)** | **Ads + Commerce Operator (Phases 1–5):** canonical schema, Meta/Shopify connectors (read), metrics, diagnosis, Meta pause + validation, Slack daily summary. |

## Operations runbook and Cursor workflow

| Document | Purpose |
|----------|---------|
| **[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)** | **AI Factory Operator Runbook:** commands at a glance, playbooks (run failure, migration, artifact), mental model, how to use Cursor with debug bundles. Start here when something breaks or before/after a migration. |
| **[CURSOR_AND_OPERATIONS.md](CURSOR_AND_OPERATIONS.md)** | Why Cursor is driven by **commands and APIs** (not the Vercel URL); three layers (state → RPCs → Cursor); debug packet; CLI + ProfessorX split; folder structure. |
| **[runbooks/run-failure.md](runbooks/run-failure.md)** | When a pipeline run fails: doctor:run → bundle → repair-plan → give Cursor bundle → replay. |
| **[runbooks/migration-workflow.md](runbooks/migration-workflow.md)** | Before/after migrations: migration:guard → fix risks → apply → post-migration:audit. |
| **[runbooks/artifact-debugging.md](runbooks/artifact-debugging.md)** | Artifact lineage and consumers: graph:lineage, use in bundle or Console. |
| **[reference/cli-commands.md](reference/cli-commands.md)** | All operator CLI commands and Control Plane RPCs. |
| **[reference/debug-bundle-schema.md](reference/debug-bundle-schema.md)** | JSON shape of the debug bundle for Cursor. |

**Console:** [Operator guide](/operator-guide) explains that this workflow is triggered by **commands and APIs**, not by the Vercel URL, and links to the runbook and Cursor doc.

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
| **[WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](WHAT_YOU_CAN_DO_WITH_PROFESSORX.md)** | **Operator Console capabilities:** what ProfessorX is now (graph-native, self-heal), what you can do (orchestration, graph, brands, config, ops), and evolution (was vs is). |
| **[AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md](AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md)** | What you can do and test with the agency/ProfessorX setup (dev + marketing; includes graph & self-heal). |
| **[NOTION_PT_INTEGRATION.md](NOTION_PT_INTEGRATION.md)** | Notion PT Project Manager Agent integration (planning/tasks). |

---

**Repo layout:** `console/` (ProfessorX — AI Factory Operator Console, Next.js + shadcn; graph, self-heal, change impact, repair, migration guard), `control-plane/` (REST API, plan compiler, scheduler, graph RPCs, migration guard), `runners/` (ExecutorRegistry, handlers, artifact consumption), `supabase/` (migrations), `email-marketing-factory/`, `docs/`.
