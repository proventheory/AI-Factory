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
| **[WHERE_EMAIL_AND_BRANDS_LIVE.md](WHERE_EMAIL_AND_BRANDS_LIVE.md)** | **Where components, email templates, and First Capital brands live** — DB vs repo, seeds, why the UI can be empty, how to get data back. |
| **[BRAND_EMAIL_FIELD_MAPPING.md](BRAND_EMAIL_FIELD_MAPPING.md)** | **Single source of truth** for email placeholders (e.g. `[product A title]`, `[image_url]`), template contracts, and placeholder vs contract semantics. |
| **[EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md](EMAIL_IMAGE_ASSIGNMENT_AND_TEMPLATE_CONTRACT_SPEC.md)** | Template contract spec: content images, product slots, logo_safe_hero, schema and Control Plane behavior. |
| **[EMAIL_SEED_AND_DELETE.md](EMAIL_SEED_AND_DELETE.md)** | How to seed email templates and delete them (scripts, API, Console). |
| **[POST_DEPLOY_SEEDS.md](POST_DEPLOY_SEEDS.md)** | Post-deploy seed steps (email templates, component library, etc.). |
| **[TEMPLATE_IMAGE_QA_CHECKLIST.md](TEMPLATE_IMAGE_QA_CHECKLIST.md)** | Template image QA checklist. |
| **[SUPABASE_EMAIL_SCHEMA_DEPLOY.md](SUPABASE_EMAIL_SCHEMA_DEPLOY.md)** | Supabase email schema and deploy notes. |
| **[EMAIL_MARKETING_FACTORY_INTEGRATION.md](EMAIL_MARKETING_FACTORY_INTEGRATION.md)** | Email Marketing Factory app in `email-marketing-factory/`, base path, proxy from Console. |
| **[EMAIL_DESIGN_VS_CAMPAIGN.md](EMAIL_DESIGN_VS_CAMPAIGN.md)** | Naming: `email_design_generator` (design initiatives) vs *email campaign* (sent via Klaviyo operator pack). Klaviyo: Console `/klaviyo`, templates + campaigns push. |

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
| **[GRAPH_ENGINE_AND_SELF_HEAL.md](GRAPH_ENGINE_AND_SELF_HEAL.md)** | **Graph & self-heal:** what's implemented, migrations, how to run Control Plane / Runner / Console, full API reference, Console views. |
| **[GRAPH_SELF_HEAL_PLUGGED_STATUS.md](GRAPH_SELF_HEAL_PLUGGED_STATUS.md)** | **API vs stub status:** Which Graph & Self-heal Console features are wired to real APIs (topology, frontier, repair_plan, audit, migration_guard, deploy_events/sync, schema_contracts) and which are stubs or partial. |
| **[GRAPH_ENGINE_IMPLEMENTATION_STATUS.md](GRAPH_ENGINE_IMPLEMENTATION_STATUS.md)** | Implementation status for graph engine features and phases. |
| **[CAPABILITY_GRAPH.md](CAPABILITY_GRAPH.md)** | Capability graph and resolver: "which operator can produce artifact type X?", schema (operators, artifact_types, consumes/produces), GET/POST `/v1/capability/resolve`, ranking policy. |
| **[HOW_TO_BUILD_NEW_PIPELINES.md](HOW_TO_BUILD_NEW_PIPELINES.md)** | How to build new pipelines and wire handlers. |
| **[ARTIFACT_HYGIENE.md](ARTIFACT_HYGIENE.md)** | Artifact hygiene, lineage, and traceability. |
| **[WEBHOOKS.md](WEBHOOKS.md)** | Webhook endpoints (GitHub, Vercel), who receives them (Control Plane), and how new pipelines get webhooks (self-heal / register). |

## Operations runbook and Cursor workflow

| Document | Purpose |
|----------|---------|
| **[OPERATIONS_RUNBOOK.md](OPERATIONS_RUNBOOK.md)** | **AI Factory Operator Runbook:** commands at a glance, playbooks (run failure, migration, artifact), mental model, how to use Cursor with debug bundles. **Start here** when something breaks or before/after a migration. |
| **[CURSOR_AND_OPERATIONS.md](CURSOR_AND_OPERATIONS.md)** | Why Cursor is driven by **commands and APIs** (not the Vercel URL); three layers (state → RPCs → Cursor); debug packet; CLI + ProfessorX split; folder structure. |
| **[runbooks/console-data-safety-and-traceability.md](runbooks/console-data-safety-and-traceability.md)** | **Console data safety:** Never leave Console empty; traceability for templates, components, brands. Pre-deploy export, post-deploy repopulate, recovery steps. |
| **[runbooks/run-failure.md](runbooks/run-failure.md)** | When a pipeline run fails: doctor:run → bundle → repair-plan → give Cursor bundle → replay. |
| **[runbooks/migration-workflow.md](runbooks/migration-workflow.md)** | Before/after migrations: migration:guard → fix risks → apply → post-migration:audit. |
| **[runbooks/artifact-debugging.md](runbooks/artifact-debugging.md)** | Artifact lineage and consumers: graph:lineage, use in bundle or Console. |
| **[runbooks/render-staging-failed-deploy-and-duplicate-runner.md](runbooks/render-staging-failed-deploy-and-duplicate-runner.md)** | Render staging: failed deploy and duplicate runner remediation. |
| **[runbooks/console-db-relation-does-not-exist.md](runbooks/console-db-relation-does-not-exist.md)** | Console "relation does not exist" errors. |
| **[reference/cli-commands.md](reference/cli-commands.md)** | All operator CLI commands and Control Plane RPCs. |
| **[reference/debug-bundle-schema.md](reference/debug-bundle-schema.md)** | JSON shape of the debug bundle for Cursor. |

**Console:** [Operator guide](/operator-guide) explains that this workflow is triggered by **commands and APIs**, not by the Vercel URL, and links to the runbook and Cursor doc.

## Deployment and operations

| Document | Purpose |
|----------|---------|
| **[DEPLOY_AND_DATA_SAFETY.md](DEPLOY_AND_DATA_SAFETY.md)** | **Mandatory:** Avoid empty Console and lost work. Before/after deploy: export templates, commit mapping, repopulate, verify. |
| **[DEPLOY_ENV_SETUP.md](DEPLOY_ENV_SETUP.md)** | Deploy environment setup. |
| **[DEPLOYMENT_PLAN_WITH_MCP.md](DEPLOYMENT_PLAN_WITH_MCP.md)** | Steps to put the factory on the web: Supabase, Control Plane, Console, LLM Gateway, MCP, Email Marketing Factory. |
| **[DEPLOY_PHASE3_CHECKLIST.md](DEPLOY_PHASE3_CHECKLIST.md)** | Phase 3 checklist: GitHub Actions secrets/variables, workflow env check. |
| **[RENDER_SETUP.md](RENDER_SETUP.md)** | Render setup for Control Plane / services. |
| **[STAGING_RENDER_CHECKLIST.md](STAGING_RENDER_CHECKLIST.md)** | Staging and Render checklist. |
| **[RUNNERS_DEPLOYMENT.md](RUNNERS_DEPLOYMENT.md)** | Runners deployment. |
| **[SECURITY_AND_RUNBOOKS.md](SECURITY_AND_RUNBOOKS.md)** | Security and runbooks. |
| **[SELF_HEAL_HOW_TO_TRIGGER.md](SELF_HEAL_HOW_TO_TRIGGER.md)** | Self-heal: one-time setup and automatic behavior (platform + local CLI). |
| **[SELF_HEAL_REQUIRED_ENV.md](SELF_HEAL_REQUIRED_ENV.md)** | **Self-heal env:** Control Plane (ENABLE_SELF_HEAL, RENDER_*, VERCEL_*), auto-register Vercel when launching (projectId in spec/launch). |
| **[SELF_HEAL_PROVIDER_STATUS_REFERENCE.md](SELF_HEAL_PROVIDER_STATUS_REFERENCE.md)** | Which Render/Vercel deploy status values we treat as failed (self-heal triggers redeploy). |
| **[VERCEL_CONSOLE_DEPLOY.md](VERCEL_CONSOLE_DEPLOY.md)** | Deploy Console to Vercel (root dir, workspace, verify Self-heal page). |
| **[VERCEL_SELF_HEAL.md](VERCEL_SELF_HEAL.md)** | Vercel self-heal (redeploy on failure, webhook). |
| **[VAULT_KEYS.md](VAULT_KEYS.md)** | Vault keys reference. |
| **[VERCEL_PREVIEW_PUBLIC_ACCESS.md](VERCEL_PREVIEW_PUBLIC_ACCESS.md)** | Vercel preview public access. |
| **[VERCEL_TEST_WITHOUT_DEPLOYING.md](VERCEL_TEST_WITHOUT_DEPLOYING.md)** | Testing on Vercel without deploying. |

## SEO migration

| Document | Purpose |
|----------|---------|
| **[wp-shopify-migration/README.md](wp-shopify-migration/README.md)** | WP → Shopify migration overview: jobs, artifacts, scoring. |
| **[wp-shopify-migration/artifact-schemas.md](wp-shopify-migration/artifact-schemas.md)** | SEO artifact schemas. |
| **[wp-shopify-migration/job-contracts.md](wp-shopify-migration/job-contracts.md)** | SEO job contracts. |
| **[wp-shopify-migration/scoring-model.md](wp-shopify-migration/scoring-model.md)** | SEO scoring model. |
| **[wp-shopify-migration/CONSOLE_UI_VIEWS.md](wp-shopify-migration/CONSOLE_UI_VIEWS.md)** | Console UI views for WP → Shopify audit runs. |
| **[SOP_SEO_MIGRATION.md](SOP_SEO_MIGRATION.md)** | SOP for SEO migration. |

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

## Data and integrations

| Document | Purpose |
|----------|---------|
| **[AIRTABLE_METADATA_AND_PAGE_MAPPING.md](AIRTABLE_METADATA_AND_PAGE_MAPPING.md)** | Airtable metadata and page mapping; WooCommerce cross-reference. |
| **[TAXONOMY_SCHEMA_AND_MAPPING.md](TAXONOMY_SCHEMA_AND_MAPPING.md)** | Taxonomy schema and mapping. |
| **[PHARMACY_IMPORT.md](PHARMACY_IMPORT.md)** | Pharmacy import. |
| **[WOOCOMMERCE_WORDPRESS_CROSS_REFERENCE.md](WOOCOMMERCE_WORDPRESS_CROSS_REFERENCE.md)** | WooCommerce/WordPress cross-reference. |

## Other

| Document | Purpose |
|----------|---------|
| **[WHAT_YOU_CAN_DO_WITH_PROFESSORX.md](WHAT_YOU_CAN_DO_WITH_PROFESSORX.md)** | **Operator Console capabilities:** what ProfessorX is now (graph-native, self-heal), what you can do (orchestration, graph, brands, config, ops), and evolution. |
| **[AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md](AGENCY_PLAN_WHAT_YOU_CAN_DO_AND_TEST.md)** | What you can do and test with the agency/ProfessorX setup (dev + marketing; includes graph & self-heal). |
| **[NOTION_PT_INTEGRATION.md](NOTION_PT_INTEGRATION.md)** | Notion PT Project Manager Agent integration (planning/tasks). |
| **[HOW_IT_WORKS.md](HOW_IT_WORKS.md)** | How the system works (high-level). |
| **[TAXONOMY_AND_AI_FACTORY_ARCHITECTURE.md](TAXONOMY_AND_AI_FACTORY_ARCHITECTURE.md)** | Taxonomy and AI Factory architecture. |

---

**Repo layout:** `console/` (ProfessorX — AI Factory Operator Console, Next.js + shadcn; graph, self-heal, change impact, repair, migration guard), `control-plane/` (REST API, plan compiler, scheduler, graph RPCs, migration guard), `runners/` (ExecutorRegistry, handlers, artifact consumption), `supabase/` (migrations), `email-marketing-factory/`, `docs/`.
