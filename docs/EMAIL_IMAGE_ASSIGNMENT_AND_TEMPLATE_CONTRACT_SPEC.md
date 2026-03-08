# Email image assignment and template contract spec

This doc is the **single reference** for image placement (deterministic, inspectable, lintable). Implement incrementally. **Artifacts:** types/rule codes in `runners/src/handlers/email-image-contract.ts`; JSON Schema in `schemas/image_assignment.schema.json`; DB in `supabase/migrations/20250307100000_image_assignment_and_template_contracts.sql`; QA checklist in `docs/TEMPLATE_IMAGE_QA_CHECKLIST.md`. See also `.cursor/plans/log_mirror_and_template_proofing_*.plan.md` (formal image contract section).

**Core principle:** A template should request images **by role**, not by hope: hero modules ask for hero, editorial for content, commerce for product; optional modules collapse cleanly.

---

## 1. Image assignment schema

### 1.1 Canonical asset roles

- **hero** – primary top-of-email banner or lead visual  
- **content** – editorial/supporting visuals in body sections  
- **product** – commerce/product-specific visuals  
- **logo** – brand identity; never treated as normal hero unless template explicitly supports logo fallback  

### 1.2 Run-time pools (v2)

Every run builds these **before** rendering:

- `hero_pool` – candidates for hero (campaign hero, brand default, optionally logo)  
- `content_pool` – editorial images (remaining campaign + optionally product if mixed)  
- `product_pool` – product images only  
- `logo_pool` – brand logo(s)  

Types: `AssetKind = "campaign" | "product" | "logo" | "brand_default"`; `ResolvedAsset` includes `source_url`, `source_kind`, `role_hint`, `is_usable`, `rejection_reason`, `alt_text`, optional `width`/`height`/`asset_id`/`product_id`. See `email-image-contract.ts` for `ResolvedAsset` and `ImagePools`.

### 1.3 Assignment result (persist on every run)

Persist `ImageAssignment` (or equivalent) so logs, proofing, preview, and validations share one source of truth. Fields:

- **version** – e.g. `"v1"`
- **run_id**, **template_id**, **brand_profile_id**
- **inputs** – selected_campaign_assets, selected_product_assets, selected_logo_assets, selected_brand_default_assets (as ResolvedAsset[])
- **pools** – hero_pool, content_pool, product_pool, logo_pool
- **assignment** – hero (one), content (ordered), products (ordered)
- **resolution** – hero_strategy (`manual_override` | `first_campaign_image` | `best_scored_campaign_image` | `brand_default` | `logo_fallback` | `none`), logo_fallback_used, collapsed_modules[], duplicated_asset_ids[], rejected_asset_ids[]
- **diagnostics** – usable_*_count, warnings[]

### 1.4 Default assignment algorithm (v1)

- **Step A:** Normalize and validate (valid URL, supported type, reachable, min dimensions, non-empty, dedupe).  
- **Step B:** Classify into pools: first usable campaign → hero_pool then hero; remaining campaign → content_pool; product images → product_pool; logo → logo_pool; optional brand default → hero_pool.  
- **Step C:** Assign hero: manual override → first campaign → brand default → logo only if template logo_safe_hero → none.  
- **Step D:** Assign content: remaining campaign, then product (if template allows mixed).  
- **Step E:** Keep product_pool separate for product-specific placeholders.

### 1.5 Placeholder contract (canonical fields)

Internal schema only; aliases at parse time.

**Canonical:** `hero_image_url`, `hero_image_alt`, `content_images[]` (url + alt), `product_images[]` (url + alt + product_id?), `logo_url`, `logo_alt`.

**Approved aliases:**

- `[hero]`, `[hero image]`, `[banner]` → hero_image_url  
- `[image 1]`, `[image 2]`, ... → content_images[n-1]  
- `[product image 1]`, `[product image 2]`, ... → product_images[n-1]  
- `{{hero_image}}`, `{{hero_image_url}}` → hero_image_url  

Do not allow templates to invent new image aliases casually.

---

## 2. Template lint rules (static)

Run on save, publish, and before proof-run start.

**Wiring:** Call `GET /v1/email_templates/:id/lint` before starting a proof run; if any error-severity issues exist, fail the run so bad templates don’t burn runner cycles. On template save, use `PATCH /v1/email_templates/:id` with `lint_on_save: true` in the body to run L001–L010 after update and reject the save when there are error-severity issues.

### 2.1 Lint categories

- **A. Placeholder correctness** – only approved placeholders; no malformed brackets; no unsupported hero/product aliases (e.g. fail `[hero-image]`, `[img1]`).  
- **B. Hero section** – top hero block must use hero placeholder, not `[image 1]`; no product in hero; if hero_required, must reference hero; if logo_safe_hero=false, cannot rely on logo-only hero.  
- **C. Content section** – content blocks may use `[image n]`; must not repeat `[hero]` unless allowed; editorial sections should not use product placeholders unless commerce-compatible.  
- **D. Product section** – product cards use product placeholders; product modules don’t pull generic content unless mixed_mode; if product title/price/button present, use product image or image_optional=true.  
- **E. Optionality/collapse** – each image module: required | optional | repeatable; required = fallback behavior; optional = collapse-on-empty; repeatable = max slot count.  
- **F. Template metadata** – each template must have (or lint fails): hero_required, logo_safe_hero, hero_mode, supports_content_images, supports_product_images, mixed_content_and_product_pool, collapses_empty_modules, max_content_slots, max_product_slots.

### 2.2 Lint rule codes (L001–L010)

- **L001** – Unsupported image placeholder  
- **L002** – Hero section uses generic content placeholder (`[image 1]` instead of hero)  
- **L003** – Hero depends on logo but template not logo-safe  
- **L004** – Missing hero in hero-required template  
- **L005** – Repeated hero leakage (hero placeholder > once outside allowed)  
- **L006** – Product module missing product image binding  
- **L007** – Content slot exceeds max_content_slots  
- **L008** – Product slot exceeds max_product_slots  
- **L009** – Optional module lacks collapse behavior  
- **L010** – Mixed pool usage without mixed_content_and_product_pool  

---

## 3. Validation rules (per-run)

### 3.1 Categories

- **Assignment** – hero_assigned, content_pool_nonempty, product_pool_nonempty, logo_fallback_used, asset_rejections_present  
- **Render** – hero resolved, no unresolved placeholders, optional empty collapsed, required rendered, no broken src, no accidental duplicate hero/content beyond threshold  
- **Semantic** – hero from allowed source, no product in forbidden hero, logo fallback only when logo_safe, gallery from correct pool, commerce from product pool  
- **Proof** – artifact generated, no critical image failures, no unresolved placeholders, no blocked/empty hero unless allowed  

### 3.2 Validation record

`RunValidation`: run_id, template_id, validator_type, code, status (pass|warn|fail), message, details.

### 3.3 Validation rule codes (V001–V012)

- **V001** – Hero missing (template requires hero, none resolved) – **critical**  
- **V002** – Hero used disallowed source (e.g. product pool) – **critical**  
- **V003** – Logo fallback on non-logo-safe template – **critical**  
- **V004** – Unresolved image placeholder – **critical**  
- **V005** – Empty required image module – **critical**  
- **V006** – Optional empty module not collapsed – warn  
- **V007** – Content slot filled with duplicate hero unexpectedly – warn  
- **V008** – Product section without product image when products existed – warn  
- **V009** – Excessive asset rejection – warn  
- **V010** – Hero aspect mismatch – warn  
- **V011** – Broken remote image – **critical**  
- **V012** – Placeholder over-allocation (requested more slots than available, collapse not honored) – **critical**  

### 3.4 Log messages (run_log_entries / validations)

- `hero_selected strategy=... asset_id=...`  
- `hero_fallback strategy=brand_default|logo_fallback`  
- `content_pool_built count=...`  
- `asset_rejected asset_id=... reason=...`  
- `module_collapsed module_id=... reason=...`  
- `validation_fail code=V00x template_id=...`  

---

## 4. Fallback matrix (10 template archetypes)

Map your 10 templates to these archetypes and apply the listed fallbacks and validations.

| Archetype | hero_required | logo_safe_hero | product_hero_allowed | Fallback hero | Fallback content | Validations |
|-----------|---------------|----------------|----------------------|---------------|------------------|-------------|
| **T1** Full-bleed editorial | yes | no | no | campaign → brand default → fail | campaign → product → collapse optional | V001, V010 warn |
| **T2** Contained mixed | yes | yes | no | campaign → brand default → logo | campaign → product | warn logo fallback |
| **T3** Product promo | yes | no | no | campaign → brand default → fail | campaign only (no product in editorial) | fail product in hero; fail product module empty |
| **T4** Product grid | no | n/a | no | brand banner or collapse | n/a | fail product grid empty; fail campaign in product slots |
| **T5** Editorial story | yes | yes | no | campaign → brand default → logo (contained) | campaign only | fail product in editorial |
| **T6** Lifestyle + products | yes | no | no | campaign → brand default → fail | lifestyle: campaign; product: product only | fail product as hero; warn editorial from product pool |
| **T7** Minimal announcement | no | yes | no | campaign → logo → collapse | campaign → product | fail only unresolved/broken |
| **T8** Featured product hero | yes | no | **yes** | featured product → campaign → brand default → fail | campaign → remaining products | V002 not applied; fail no hero |
| **T9** Gallery showcase | yes | maybe | no | campaign → brand default → logo if contained | campaign → product; collapse trailing rows | warn duplicate hero; fail required gallery not met |
| **T10** Commerce reminder | no | yes | no | logo or no hero | minimal | product only; fail product block empty |

### Template fallback profile (DB/config)

Store per template: `template_id`, `template_name`, `archetype` (enum above), `hero_required`, `logo_safe_hero`, `product_hero_allowed`, `collapses_empty_modules`, `mixed_content_and_product_pool`, `max_content_slots`, `max_product_slots`. Proof runner validates against this profile.

---

## 5. Implementation sequence

1. **A. Image assignment persistence** – Every run stores `image_assignment_json` (or equivalent).  
2. **B. Template image contract metadata** – Add/store per-template flags (hero_required, logo_safe_hero, max_content_slots, etc.); without this, lint and validation stay weak.  
3. **C. Static lint pass** – Run on template save and before proofing (L001–L010).  
4. **D. Per-run validations** – Emit V001–V012 into validations table.  
5. **E. Proofing summary** – Per template proof run: hero_strategy_used, logo_fallback_used, content_slots_filled, product_slots_filled, collapsed_modules_count, critical_validation_count.  

---

## 6. Gaps vs current repo (as of this spec)

- **Persistence:** Assignment is built in runner but not yet persisted on run (metadata or artifact).  
- **ResolvedAsset / pools:** We have `Asset` and flat assignment; spec adds `ImagePools`, `is_usable`, `rejection_reason`, and explicit pool build before assign.  
- **Template metadata:** No `TemplateImageContract` or `TemplateFallbackProfile` in DB yet; `email_templates` has no image_contract_json or archetype.  
- **Lint:** No static template linter (L001–L010) yet.  
- **Validations:** No V001–V012 written to validations table from runner.  
- **Product pool separate:** We merge products into content; spec keeps product_pool separate and lets templates request `[product image 1]` explicitly.  
- **Hero strategy enum:** Not yet logged (e.g. first_campaign_image vs logo_fallback).  
- **10-template mapping:** No table of template_id → archetype/fallback profile in config or DB.  

Implementing A→B→C→D→E and the “template requests by role” principle will close these gaps.

---

## 7. What we might have missed (before this spec)

- **Single persistable assignment object** – Without it, console/runner/proofing can drift. We now have the type; persistence is next.
- **Pre-assignment validation** – "First image = hero" is unsafe if that image is broken or wrong aspect. Normalize → validate → then assign.
- **Template metadata (image contract)** – Lint and validation stay weak without hero_required, logo_safe_hero, max_content_slots per template.
- **Separate product pool** – Merging products into one content pool can put product packshots in editorial slots; templates should request `[product image N]` from product_pool explicitly where needed.
- **Hero fallback tiers** – Not just "campaign or logo" but: campaign → brand default → logo (only if logo_safe_hero) → collapse. Templates need to know which tier was used.
- **Static lint before proof** – Catching L002 (hero uses [image 1]) and L004 (missing hero) before running saves time and makes proof results interpretable.
- **Per-run validations (V001–V012)** – Without writing to validations table, proofing only sees "succeeded/failed" not "hero from disallowed source" or "logo fallback on non-logo-safe template."
- **10-template archetype mapping** – Each template should map to one archetype (T1–T10) and get the right fallback and validation rules; otherwise behavior is ad hoc.

## 8. Recommended implementation order (concrete)

1. **Persist assignment** – Runner already builds `ImageAssignment`; add `image_assignment_json` to run payload or artifact; control plane stores it. Use `ImageAssignmentPersisted` when adding resolution/diagnostics.
2. **Add template image_contract / archetype** – New column or JSON on `email_templates`: `image_contract` (TemplateImageContract) or `fallback_profile` (TemplateFallbackProfile). Seed the 10 templates with the right archetype.
3. **Static lint (L001–L010)** – Script or API that parses MJML, checks placeholders and hero block; runs on template save and before proof. Emit rule codes.
4. **Runner validations (V001–V012)** – After render, check hero source, unresolved placeholders, empty required, etc.; write to validations table. Critical codes fail proof.
5. **Proof summary columns** – In template_proof_runs (or equivalent): hero_strategy_used, logo_fallback_used, content_slots_filled, critical_validation_count.
6. **Pre-assignment validation** – In runner or shared lib: validate URLs, dimensions, dedupe; fill `rejected` and `resolution.rejected_asset_ids`; then assign. Enables "rejected: C (invalid dimensions)" in console.
7. **Separate product_pool in render** – Keep product_pool distinct; add `[product image 1]` resolution; only merge into content when template has mixed_content_and_product_pool.
---

## 9. JSON Schema for image_assignment_json

The canonical object saved per run (on `runs.image_assignment_json` or as a linked artifact) MUST conform to the JSON Schema in **schemas/image_assignment.schema.json**.

- **Use for:** render decisions, logs, validations, proofing UI, debugging.
- **Schema:** JSON Schema draft 2020-12; `$id`: `https://ai-factory.local/schemas/image_assignment.schema.json`.
- **Required top-level:** version, run_id, template_id, brand_profile_id, inputs, pools, assignment, resolution, diagnostics.
- **resolution.hero_strategy** enum includes: `manual_override`, `first_campaign_image`, `best_scored_campaign_image`, `brand_default`, `logo_fallback`, `featured_product`, `none`.

---

## 10. Runtime companion object (what templates consume)

The render layer should receive a **simple** object derived from assignment, not the full diagnostic payload:

- `hero_image_url`, `hero_image_alt`
- `content_images`: `[{ url, alt? }]`
- `product_images`: `[{ url, alt?, product_id? }]`
- `logo_url`, `logo_alt`

This is **TemplateImageContext** in `email-image-contract.ts`. Build it from `assignment` after resolution; keep the full `image_assignment_json` for logs/validations/proofing.

---

## 11. DB schema: template_image_contracts

A **real table**, not loose JSON on the template. See migration **supabase/migrations/20250307100000_image_assignment_and_template_contracts.sql**.

**Columns:** template_id (FK email_templates), version; hero_required, logo_safe_hero, product_hero_allowed; hero_mode (full_bleed | contained | none); supports_content_images, supports_product_images, mixed_content_and_product_pool, collapses_empty_modules; max_content_slots, max_product_slots; allowed_hero_sources (jsonb), required_modules, optional_modules, repeatable_modules (jsonb); approved_placeholder_aliases (jsonb), lint_profile, notes.

**Recommended JSON shapes:** allowed_hero_sources = `["campaign","brand_default","logo"]`; required_modules / optional_modules / repeatable_modules = arrays of `{ module_id, module_type, image_role?, max? }`; approved_placeholder_aliases = `{ "hero": ["[hero]", "[banner]", "{{hero_image_url}}"], "content": ["[image 1]", ...], "product": ["[product image 1]", ...], "logo": ["{{logo_url}}","[logo]"] }`.

**Join for proofing/lint:** `SELECT t.id, t.name, t.mjml, c.* FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1'`. If `c` is null, lint fails immediately.

---

## 12. Validation-to-contract logic

Connect contract flags directly to runtime validators:

| Condition | Action |
|-----------|--------|
| `hero_required=true` and `assignment.hero=null` | Fail **V001** |
| `logo_safe_hero=false` and `resolution.hero_strategy='logo_fallback'` | Fail **V003** |
| `product_hero_allowed=false` and `assignment.hero.source_kind='product'` | Fail **V002** |
| Template references `[image 5]` and `max_content_slots=4` | Lint fail **L007** |

This keeps the system coherent end-to-end.

---

## 13. Universal lint checklist (14 items per template)

**Contract presence:** (1) Has a `template_image_contracts` row. (2) Declares hero_required, logo_safe_hero, product_hero_allowed. (3) Declares max_content_slots and max_product_slots.

**Hero correctness:** (4) Top visual block uses `[hero]`, `[banner]`, or canonical hero variable. (5) Top visual block does NOT use `[image 1]`. (6) Top visual block does NOT use product placeholder unless product_hero_allowed=true.

**Content correctness:** (7) Body editorial/gallery sections use `[image n]` only. (8) Editorial sections do not accidentally use `[hero]` repeatedly.

**Product correctness:** (9) Product modules use `[product image n]` where appropriate. (10) Product title/price/button modules aligned with product image modules.

**Collapse behavior:** (11) Empty optional sections can collapse cleanly. (12) Required sections fail clearly if unresolved.

**Alias hygiene:** (13) No unsupported aliases (e.g. `[img1]`, `[hero-image]`). (14) No unresolved placeholders after a proof run.

---

## 14. QA sheet format (per template)

Use this as a QA checklist per template (see also docs/TEMPLATE_IMAGE_QA_CHECKLIST.md if created):

- [ ] Contract row exists in template_image_contracts
- [ ] hero_required set correctly
- [ ] logo_safe_hero set correctly
- [ ] product_hero_allowed set correctly
- [ ] max_content_slots matches actual template
- [ ] max_product_slots matches actual template
- [ ] Hero block uses [hero] / canonical hero variable
- [ ] Hero block does not use [image 1]
- [ ] Hero block does not use product image placeholder unless allowed
- [ ] Editorial blocks use [image n]
- [ ] Product blocks use [product image n]
- [ ] Empty optional blocks collapse cleanly
- [ ] No unsupported placeholder aliases
- [ ] No unresolved placeholders in proof run
- [ ] No logo-stretch issue in fallback mode
- [ ] No accidental hero duplication in gallery
- [ ] Proof run passes with campaign images present
- [ ] Proof run passes/fails as expected with no campaign images
- [ ] Proof run passes/fails as expected with no product images
