# How to Build New Pipelines (Email, SEO, Ads, or Any)

**Use this doc when:** You are adding a new pipeline (or new nodes/job types to an existing pipeline) in AI Factory—whether you're typing in Cursor, using AI Factory to generate pipelines, or onboarding. **Do not skip steps.** Each section is mandatory for correctness, lineage, and deploy safety.

---

## What counts as a "pipeline"

A **pipeline** is a runnable graph: **initiative** (intent_type) → **plan** (nodes + edges) → **runs** → **job_runs** (one per node) → **handlers** (job_type) → **artifacts**. New pipelines usually mean: new `intent_type`, new or extended **job_type**(s), new **handlers**, and often new **artifact_type**(s). Examples: email (copy → email_generate_mjml → Klaviyo), SEO migration (inventory → matcher → redirect_verifier → risk_scorer → audit_report), ads (spend/orders → diagnosis → actions).

---

## Mandatory checklist (every new pipeline or new job type)

Work through these in order. If you skip one, lineage, capability resolution, or artifact hygiene will be wrong.

### 1. Runner: handler and job_type

- [ ] **Add or extend a handler** in `runners/src/handlers/` (e.g. `email-generate-mjml.ts`, `seo-url-matcher.ts`). Handler signature: `(client, context, params) => Promise<void>`; it reads `context.predecessor_artifacts`, writes artifacts via the shared write path.
- [ ] **Register the job_type** in `runners/src/handlers/index.ts`: `registry.set("your_job_type", async (client, context, params) => { ... })`. If the handler uses **predecessor artifact content in an LLM prompt**, load that content **only** via `loadArtifactContentForLlm` or `loadPredecessorContentsForLlm` (see **Artifact hygiene** below).
- [ ] **Record artifact consumption** when the handler reads predecessor artifacts: use `recordArtifactConsumption(client, ...)` from `runners/src/job-context.js` (or the shared pattern) so lineage and `artifact_consumption` stay correct.

### 2. Artifact hygiene (non‑negotiable)

- [ ] **Any path that sends artifact body to an LLM** must use **`loadArtifactContentForLlm`** or **`loadPredecessorContentsForLlm`** from `runners/src/artifact-content.ts`. No raw `SELECT metadata_json` or artifact body in prompts. See **`docs/ARTIFACT_HYGIENE.md`**.
- [ ] If the new handler uses predecessor artifacts in a **prompt** (e.g. copy → email, or PRD → design): in `index.ts` load predecessor content with the helper and pass it into the handler (e.g. `predecessor_copy_for_llm`), or inside the handler call `loadPredecessorContentsForLlm(client, context.predecessor_artifacts)` and use the result in the prompt. **Do not** put raw artifact body into `userPrompt` or `chat()` without the helper.
- [ ] If the handler only uses artifact **metadata** (e.g. URLs, IDs, structured fields) and **does not** put artifact body in an LLM: document that in `docs/ARTIFACT_HYGIENE.md` under "Paths that do not build prompts" so the invariant stays clear.

### 3. Capability graph (so resolver and by-artifact-type work)

- [ ] **New artifact types:** Add rows to `artifact_types` (in the capability graph migration or seed). Every artifact type your pipeline produces or consumes should exist there.
- [ ] **New job_type = new operator:** Add a row to `operators` with `key` = your `job_type` (e.g. `email_generate_mjml`, `seo_url_matcher`). Set `priority` if you need deterministic ordering when multiple operators produce the same artifact type.
- [ ] **Edges:** Insert into `operator_produces_artifact_type` (this operator produces X). If the node consumes specific artifact types, insert into `operator_consumes_artifact_type`. Optionally link to `capabilities` via `operator_implements_capability`. See **`docs/CAPABILITY_GRAPH.md`** and the seed in `supabase/migrations/20250331000011_capability_graph.sql`.

### 4. Lineage and artifact_consumption

- [ ] Handlers that **read** predecessor artifacts must **record consumption** so `GET /v1/graph/lineage/:artifactId` shows both declared producer and observed consumers. Use the existing `recordArtifactConsumption` pattern (artifact_id, run_id, job_run_id, plan_node_id, role).
- [ ] When **writing** an artifact, set `producer_plan_node_id` so lineage can show the producer. The shared write path in `index.ts` supports this.

### 5. Migrations and CI (required for self-heal on deploy)

- [ ] If you add **new tables or columns** (e.g. for SEO, ads, or email metadata): add a new file under `supabase/migrations/` and **add that file to the `migrations` array in `scripts/run-migrate.mjs`** in the **same PR**. Order migrations so dependencies exist (e.g. Phase 6 tables after `ai_factory_core`).
- [ ] **CI:** `npm run verify:migrations` (run in `.github/workflows/ci.yml`) must pass—every file in `supabase/migrations/` must be listed in `run-migrate.mjs`. Do not merge if the check fails.
- **Self-heal on deploy:** The Control Plane runs **all migrations in run-migrate.mjs** on every start (before the API). So once your new migration is in that list and you deploy, the new wizard/pipeline’s schema is applied automatically—no manual “run migrations” step. If you forget to add the migration to `run-migrate.mjs`, the new tables won’t exist after deploy and the wizard will hit “relation does not exist.” Always register new migrations so they self-heal.

### 6. Control Plane: plan shape and by-artifact-type (if applicable)

- [ ] If the pipeline is triggered by **POST /v1/runs/by-artifact-type** (e.g. "produce copy"): the resolver must return your operator for the requested `produces` (and optional `consumes`). Ensure capability graph seed includes your operator and produces edge.
- [ ] If the pipeline is **compiled from an initiative** (e.g. intent_type `wp_shopify_migration`, `email_design_generator`): ensure the plan compiler or template creates nodes with the correct `job_type` and edges so predecessor artifacts are available in `context.predecessor_artifacts`.

### 7. Docs and runbook

- [ ] **Document the pipeline** (job contracts, inputs/outputs, artifact types). For SEO: `docs/wp-shopify-migration/job-contracts.md`. For email: see `docs/EMAIL_DESIGN_VS_CAMPAIGN.md`, `docs/KLAVIYO_OPERATOR_PACK.md`. For ads: `docs/ADS_COMMERCE_OPERATOR.md` or equivalent.
- [ ] If you added a new **artifact_type** or **job_type**, update **`docs/ARTIFACT_HYGIENE.md`** (either "Where artifact content reaches the LLM" or "Paths that do not build prompts") so Cursor and code review don’t regress.
- [ ] After deploy: complete the **Gate B** checklist in **`docs/runbooks/large-deploy-verification.md`** (tables exist, runner migrate→start, lineage API, capability resolver, capability loop).

---

## Email pipelines

- **Intent types:** e.g. `email_design_generator`. Plan: often one or two nodes (e.g. `copy_generate` → `email_generate_mjml`).
- **Artifact types:** `copy`, `email_template`, `campaign_brief`. Handlers: `copy_generate`, `email_generate_mjml`; optional downstream: Klaviyo push (Control Plane / Console).
- **Artifact hygiene:** `email_generate_mjml` receives predecessor copy via `loadArtifactContentForLlm` in `index.ts` and uses it as `predecessor_copy_for_llm` in the campaign prompt. Do not add new email handlers that put raw artifact body into an LLM without the helper.
- **Capability graph:** `copy_generate` → produces `copy`; `email_generate_mjml` → produces `email_template`, can consume `copy` / `campaign_brief`. Seed these in capability graph.
- **References:** `docs/EMAIL_DESIGN_VS_CAMPAIGN.md`, `docs/KLAVIYO_OPERATOR_PACK.md`, `docs/ARTIFACT_HYGIENE.md`.

---

## SEO pipelines

- **Intent types:** e.g. `wp_shopify_migration`. Plan: DAG of nodes (source_inventory, target_inventory, url_matcher, redirect_verifier, content_parity, technical_diff, risk_scorer, audit_report, etc.). See **`docs/wp-shopify-migration/job-contracts.md`**.
- **Artifact types:** `seo_url_inventory`, `seo_url_match_report`, `seo_redirect_verification`, `seo_content_parity_report`, `seo_ranking_risk_report`, `seo_audit_summary`, etc. Each job_type produces one (or more) artifact types.
- **Artifact hygiene:** SEO handlers today use artifact **metadata** (URLs, matches, counts) for logic and HTTP checks; they do **not** put artifact body into LLM prompts. If you add an SEO step that **does** send artifact content to an LLM (e.g. a summarizer or classifier), that path **must** use `loadArtifactContentForLlm` or `loadPredecessorContentsForLlm`, and you must update `docs/ARTIFACT_HYGIENE.md`.
- **Capability graph:** Register every SEO job_type as an operator and link produces/consumes to the artifact types in `docs/wp-shopify-migration/job-contracts.md`. Seed in capability graph migration or a follow-up seed script.
- **References:** `docs/wp-shopify-migration/README.md`, `docs/wp-shopify-migration/job-contracts.md`, `docs/wp-shopify-migration/artifact-schemas.md`, `docs/ARTIFACT_HYGIENE.md`.

---

## Ads / commerce pipelines

- **Intent types:** e.g. ads or commerce initiatives. Plan: nodes for spend/orders ingestion, diagnosis, Meta/Shopify actions, validation.
- **Artifact types:** Define what each node produces (e.g. `spend_snapshot`, `orders_snapshot`, `diagnosis_report`, `pause_recommendation`). Add these to capability graph and seed operators.
- **Artifact hygiene:** If any ads handler builds an LLM prompt from artifact content (e.g. from a previous node’s report), use **only** `loadArtifactContentForLlm` or `loadPredecessorContentsForLlm` for that content, and document in `docs/ARTIFACT_HYGIENE.md`.
- **References:** `docs/ADS_COMMERCE_OPERATOR.md`, `docs/ARTIFACT_HYGIENE.md`, `docs/CAPABILITY_GRAPH.md`.

---

## Cursor and AI Factory

- **When you are in Cursor** (or any AI assistant) building or extending a pipeline: **open and follow this doc** so you don’t skip handler registration, artifact hygiene, capability graph seed, lineage, or migrations. The checklist is the source of truth.
- **When AI Factory builds pipelines** (e.g. plan-from-prompt, or generated DAGs): the code that creates plans and job types should ensure (1) every node has a registered `job_type`, (2) every artifact type produced/consumed is in the capability graph, and (3) any handler that uses artifact content in an LLM uses the artifact-content helpers. This doc should be referenced in the pipeline-generation logic or runbooks so automated builds don’t skip steps.

---

## Quick reference: key files

| Step | File(s) |
|------|--------|
| Handler + job_type registration | `runners/src/handlers/index.ts`, `runners/src/handlers/<name>.ts` |
| Artifact content for LLM | `runners/src/artifact-content.ts` (`loadArtifactContentForLlm`, `loadPredecessorContentsForLlm`); `docs/ARTIFACT_HYGIENE.md` |
| Capability graph seed | `supabase/migrations/20250331000011_capability_graph.sql` (or seed script); resolver: `control-plane/src/capability-resolver.ts` |
| Lineage / consumption | `recordArtifactConsumption`; `GET /v1/graph/lineage/:id` in `control-plane/src/api.ts` |
| Migrations | `supabase/migrations/*.sql`, `scripts/run-migrate.mjs`; CI: `npm run verify:migrations`, `.github/workflows/ci.yml` |
| Runbook after deploy | `docs/runbooks/large-deploy-verification.md` |
