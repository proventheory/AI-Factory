# Schema JSON Guardrails

The database is domain-grouped with a relational core; JSON/JSONB is used for **config and metadata** only. This doc defines contracts and decision rules so JSON-heavy tables stay that way and new behavioral or queryable data uses columns or child tables instead of bloating JSON.

---

## 1. job_events.payload_json

**Table:** `job_events` — columns `job_run_id`, `event_type` (enum), `payload_json`, `created_at`.

**Payload shape per event_type** (canonical; extend this list when adding new event types):

| event_type | payload_json shape | Notes |
|------------|--------------------|--------|
| `attempt_started` | none or `{}` | No payload. |
| `attempt_succeeded` | none or `{}` | No payload. |
| `attempt_failed` | `{ error_signature?: string; reason?: string }` | e.g. `reason: "lost_race"` or `error_signature` from job run. |
| `halted` | `{ reason: string; error_signature?: string; attempts?: number }` | Budget exhausted, etc. |
| `hypothesis_generated` | `{ source: "repair_recipe" \| "hypothesis"; recipe_id?: string; patch_pattern?: string; model_tier?: string; attempt?: number }` | From repair engine or recipe. |
| `escalated_model` | `{ model_tier: string; attempt: number }` | Model escalation audit. |
| `patch_applied` | (document when used) | Placeholder; extend when patch application is recorded. |

**Rules:**

- Do **not** add ad-hoc keys. When adding a new event type, extend this list and the code contract (see `control-plane/src/kernel-contract.ts` or job-events contract).
- If you need **queryable** failure or escalation data (e.g. "all runs where error_signature = X"), add a dedicated table (e.g. `job_failures`, `llm_escalations`) or a GIN index on `payload_json` with a strict schema; keep payload minimal.

---

## 2. artifacts.metadata_json

**Table:** `artifacts` — identity and lineage are relational (`artifact_type`, `artifact_class`, `run_id`, `job_run_id`, `producer_plan_node_id`, `uri`, `sha256`). Payload and optional metadata live in `metadata_json`.

**Allowed keys** (prefer these; document any new key here):

| Key | Type | Purpose |
|-----|------|---------|
| `content` | string | Inline text, MJML, HTML. Max 2MB enforced in Control Plane PATCH. |
| `mjml` | string | Email artifact editor; MJML source when separate from content. |
| `error_signature` | string | Repair/incident artifacts. |
| `type` | string | e.g. `"incident"` for mdd_doc. |
| (other) | — | Runners and Control Plane may add type-specific keys; add them to this table when introduced. |

**Rules:**

- Prefer **documented keys**. Avoid storing **queryable relational facts** (e.g. template_id, run_step) only in metadata; use columns or FKs where you need to query.
- For **large content**, consider external storage and a `content_uri` (or similar) in the future; keep `metadata_json` from holding unbounded blobs if artifacts scale.

**Enforcement:** Control Plane API (PATCH /v1/artifacts/:id) logs a warning when `metadata` includes keys not in the allowlist (`content`, `mjml`, `error_signature`, `type`). Add new keys to the allowlist in `control-plane/src/api.ts` and to this doc when introducing them.

**WP → Shopify audit artifacts** (`wp_shopify_migration` pipeline): When `artifact_type` is one of `seo_url_inventory`, `seo_url_match_report`, `seo_redirect_verification`, `seo_content_parity_report`, `seo_technical_diff_report`, `seo_ranking_risk_report`, `seo_audit_summary`, `seo_gsc_snapshot`, `seo_ga4_snapshot`, `seo_backlink_snapshot`, `seo_internal_link_graph`, `seo_internal_graph_diff_report`, the full report payload is stored in `metadata_json` (e.g. `urls`, `matches`, `comparisons`, `stats`). See [docs/wp-shopify-migration/artifact-schemas.md](wp-shopify-migration/artifact-schemas.md) for canonical shapes. Do not use these artifact types for queryable relational data without adding a dedicated table (e.g. `seo_url_risk_snapshots`).

---

## 3. document_templates.component_sequence

**Contract:** `component_sequence` is an **ordered list of component IDs or refs only**. Do **not** store full component config here.

- **Component entities** live in `document_components` (one row per component: `template_id`, `component_type`, `config`, `position`). See [supabase/migrations/20250303000007_brand_engine.sql](../supabase/migrations/20250303000007_brand_engine.sql).
- **Template-level config** (e.g. page size, margins) belongs in `template_config` JSON.

**Rule:** When adding template assembly logic (e.g. email preview from component library), keep `component_sequence` as refs/order only; persist component config in `document_components.config`.

---

## 4. brand_profiles.design_tokens

**References:**

- [docs/BRAND_TOKENS_MIGRATION_MAPPING.md](BRAND_TOKENS_MIGRATION_MAPPING.md) — canonical paths and legacy mapping.
- [docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md) — design tokens and flat table.

**Rule:** **Design tokens and style only.** Do **not** store campaign/asset refs here (e.g. `products`, `selected_images`, sitemap, social/contact assets). Put campaign-specific data in the initiative or `email_design_generator_metadata` (or dedicated tables).

**Note:** `brand_design_tokens_flat` is the queryable index (path, value, type, group); source of truth for token values remains `brand_profiles.design_tokens` JSON. Sync from Control Plane on brand update.

**Enforcement:** Control Plane API (POST/PUT brand_profiles) logs a warning if `design_tokens` contains top-level keys `products` or `selected_images`; fix by moving those to initiative or email_design_generator_metadata.

---

## 5. email_design_generator_metadata.metadata_json

**Table:** `email_design_generator_metadata` (1:1 with initiative via `initiative_id`). Relational columns: `subject_line`, `from_name`, `from_email`, `reply_to`, `template_artifact_id`, `audience_segment_ref`.

**Current allowed content in metadata_json:** `template_id` (fallback when not on initiative), `campaign_prompt`, `products`, `images`, `selected_images`, `sitemap_url`, `sitemap_type`. API merges `template_id` from body into this blob on insert/update.

**Decision rule:** When adding **scheduling, segmentation, targeting, proofing state, or asset relationships**, add **columns** or a **child table** (e.g. `email_design_campaign_options`). Do **not** extend only `metadata_json`. Keep `metadata_json` for campaign payload (prompt, products, images) that is read once per run and not queried by key.

**Enforcement:** Control Plane API (POST/PATCH email designs) returns 400 if `metadata_json` contains blocklisted keys: `scheduled_at`, `segment_id`, `proof_status`. Add new reserved keys to the blocklist in `control-plane/src/api.ts` when you add columns or a child table for that concept.

---

## 6. Quick reference

| Table | JSON column(s) | Purpose | Do not put here / when to add columns |
|-------|----------------|---------|---------------------------------------|
| `job_events` | `payload_json` | Event-specific detail per event_type | Ad-hoc keys; queryable failure/escalation data → use dedicated table or GIN + schema. |
| `artifacts` | `metadata_json` | Content + optional metadata | Queryable relational facts; unbounded content → consider external storage + ref. |
| `document_templates` | `template_config`, `component_sequence` | Template config; order of component refs | Full component config in sequence; complex rules → consider template_rules table. |
| `document_components` | `config` | Per-component config | — |
| `brand_profiles` | `identity`, `tone`, `visual_style`, `copy_style`, `design_tokens`, `deck_theme`, `report_theme`, `style_dimensions` | Style/identity config | Campaign refs (products, selected_images) → initiative or email metadata. |
| `email_design_generator_metadata` | `metadata_json` | Campaign payload (prompt, products, images) | Scheduling, segmentation, proofing, asset links → columns or child table. |
| `initiatives` | `goal_metadata`, `metadata` | Optional goal/config | Queryable goal steps → initiative_goals table. |
| `runs` | `metadata`, `image_assignment_json` | Run-level options; ImageAssignment schema | — |
| `plan_nodes` | `retry_policy_json`, `config` | Retry policy; node config | Queryable inputs/outputs → columns or table. |

---

## 7. Future normalization triggers

When one of these triggers applies, add columns or tables instead of extending JSON.

| Trigger | Action |
|--------|--------|
| Adding scheduling, segmentation, A/B, or proofing for email campaigns | Add columns on `email_design_generator_metadata` or table `email_design_campaign_options`; do not put only in `metadata_json`. |
| Needing to query "brands with product X" or "campaigns using image Y" | Move products/selected_images out of `brand_profiles.design_tokens` into initiative or email metadata (or dedicated tables). |
| Needing to query or constrain by logo_url or contact_email | Add columns on `brand_profiles` or a small `brand_contact` table; avoid querying inside `identity` JSON. |
| Needing "all runs where error_signature = X" or "all escalations" | Add `job_failures` / `llm_escalations` tables or GIN index on `job_events.payload_json` with a strict schema; keep payload minimal. |
| Goal steps or acceptance criteria become first-class and queryable | Add `initiative_goals` (or similar) table; do not rely only on `initiatives.goal_metadata`. |
