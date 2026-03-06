# Brand tokenization upgrade: enterprise design tokens (Cursor task)

## Context

We currently have a "Brand Profile" with minimal design-token fields:

- `logo_url`, `primary_color`, `secondary_color`, `font_heading`, `font_body` (mapped into `design_tokens` in the Console "New Brand" form).
- `brand_profiles.design_tokens` (JSONB) already exists; current shape is ad hoc (e.g. `color.brand.500`, `typography.font_headings`, `logo_url`).
- Other sections (Identity, Tone & Voice, Visual Style, Copy Style) exist in `identity`, `tone`, `visual_style`, `copy_style`.

**Goal:** Implement a structured `design_tokens` model with ~150–400 semantic tokens, using W3C DTCG format and seeded from proven OSS token repos, so tokens can drive:

- Emails (Klaviyo-compatible)
- Websites
- Dashboards/UI components
- Decks/reports (presentations)
- SEO templates
- Image/motion generation prompts

---

## Requirements

1. **Use W3C DTCG design token format** as the canonical JSON schema. Reference: https://github.com/design-tokens/community-group  
   Do not invent a custom format unless necessary; if so, document why.

2. **Seed / align token categories and naming** from these repos (reference only; use for taxonomy and coverage):
   - Adobe Spectrum: https://github.com/adobe/spectrum-design-data
   - Canopy (Legal & General): https://github.com/Legal-and-General/canopy-design-tokens
   - OpenTable: https://github.com/opentable/design-tokens
   - Sage: https://github.com/Sage/design-tokens
   - Optional: Shopify Polaris tokens (archived): https://github.com/Shopify/polaris-tokens

3. **Token domains the system MUST support:**
   - **A.** identity (philosophical)
   - **B.** voice (tone controls)
   - **C.** colors (semantic + stateful)
   - **D.** typography (families, scales, weights, line-heights, letter-spacing)
   - **E.** spacing + layout (scale, container, section, grid)
   - **F.** component tokens (button/card/input/badge/link + states)
   - **G.** email tokens (email-safe: container width, padding, button, divider, footer)
   - **H.** marketing tokens (CTA styles, headline rules, offer formatting, urgency/scarcity lexicon)
   - **I.** SEO tokens (meta lengths, heading structure, internal linking defaults)
   - **J.** document/deck tokens (slide typography, padding, tables, charts, diagram style)
   - **K.** image + motion tokens (style/lighting/background/aspect; motion transitions/speed/easing)

4. **Storage:**
   - Keep storing full tokens in `brand_profiles.design_tokens` (JSONB).
   - Add a normalized searchable representation: e.g. table `brand_design_tokens_flat` (brand_id, path, value, type, group, updated_at) with index on (brand_id, path).
   - Existing brand profile fields (identity, tone, etc.) unchanged; Basic Info UI continues to write-through into `design_tokens` (e.g. `logo.url`, `colors.primary`, `typography.fonts.heading`, `typography.fonts.body`).

5. **Backwards compatibility:**
   - Current UI fields (logo_url, primary_color, etc.) continue to work.
   - New enterprise token set is additive; no breaking changes to existing APIs or consumers (e.g. [runners/src/brand-context.ts](runners/src/brand-context.ts), [control-plane/src/api.ts](control-plane/src/api.ts) brand_profiles CRUD).

6. **Deliverables:**
   - a) Canonical `brand_tokens.schema.json` (or TS type) for the token object.
   - b) Seed token set `brand_tokens.default.json` (sensible defaults).
   - c) Migration mapping doc: old fields → new token paths.
   - d) Validation rules (e.g. color hex, required font tokens).
   - e) Example brand file `brand_tokens.example.<brand>.json`.

---

## Token naming rules

- Prefer semantic names: e.g. `color.text.primary`, `color.button.primary.bg`.
- Primitives OK where needed: `color.base.blue.500`, `space.400`.
- Interactive components must have state tokens: default, hover, active, focus, disabled.
- Email tokens must be email-safe (no reliance on unsupported CSS in email clients).

---

## Implementation plan

### 1. Token structure (DTCG-compatible)

Create design token document with top-level groups:

- `identity`
- `voice`
- `colors`
- `typography`
- `spacing`
- `layout`
- `components`
- `email`
- `marketing`
- `seo`
- `documents`
- `image_generation`
- `motion`

### 2. TokenService

Implement a service (e.g. in `packages/tokens` or `control-plane/src/services/TokenService.ts`) with:

- `getToken(path)` — get value by path (e.g. "colors.primary").
- `setToken(path, value)` — set value at path.
- `mergeTokens(base, overrides)` — deep merge; overrides win.
- `validateTokens(tokens)` — run validation rules (hex, required keys, etc.).
- `computeDerivedTokens(tokens)` — e.g. derive hover/active from base where not provided; keep deterministic and documented.

### 3. DB schema

- **Existing:** `brand_profiles` with `design_tokens` JSONB (keep).
- **New:** `brand_design_tokens_flat` (brand_id uuid, path text, value text/jsonb, type text, group text, updated_at timestamptz). Index: (brand_id, path). Optional: `brand_design_tokens` table (brand_id, tokens_json, version, created_at, updated_at) if we want versioned snapshots; otherwise keep single source in `brand_profiles.design_tokens` and use `brand_design_tokens_flat` only for search/index.
- Migration: Supabase-friendly SQL in `supabase/migrations/` or `schemas/`.

### 4. UI changes

- **Console "New Brand Profile" / Basic Info** ([console/app/brands/new/page.tsx](console/app/brands/new/page.tsx)): Continue writing current form fields into token paths: `logo.url`, `colors.primary`, `colors.secondary`, `typography.fonts.heading`, `typography.fonts.body`. Ensure saved payload is DTCG-aligned where applicable.
- **Brand edit** ([console/app/brands/[id]/edit/page.tsx](console/app/brands/[id]/edit/page.tsx)): Add optional advanced view: tree view of tokens with search/filter (stub or full).

### 5. Export targets (design cleanly; stubs OK)

- Export tokens → CSS variables (web).
- Export tokens → JSON for email renderer (Klaviyo-compatible subset).
- Export tokens → deck template config (e.g. for [packages/doc-kit](packages/doc-kit) / [runners/src/handlers/deck-generate.ts](runners/src/handlers/deck-generate.ts)).

### 6. Testing

- Unit tests: validation, merge, derived tokens.
- Sample snapshots for export outputs (CSS vars, JSON, deck config).

---

## What to copy/learn from referenced repos

- **Spectrum:** Breadth of tokens, schema discipline, component schemas.
- **Canopy:** Pragmatic token organization (layout/typography/component themes).
- **OpenTable / Sage:** Central token repo patterns, release/versioning.

---

## Output format (implementation order)

1. **Proposed token taxonomy (tree)** — document in this file or `docs/BRAND_TOKENS_TAXONOMY.md`.
2. **`brand_tokens.schema.json`** (or TS type in repo) — canonical shape.
3. **`brand_tokens.default.json`** — seed defaults (~150–400 tokens).
4. **Migration mapping doc** — old fields → new token paths (e.g. `primary_color` → `colors.brand.500` or `colors.primary`).
5. **DB migration SQL** — `brand_design_tokens_flat` (and optional version table if needed); Supabase-friendly.
6. **Implementation checklist with file paths** — see below.

---

## Files touched (checklist)

| File / path | Action |
|-------------|--------|
| `docs/BRAND_TOKENS_TAXONOMY.md` | Create (token tree). |
| `packages/tokens/` or `control-plane/src/services/` | Create TokenService (getToken, setToken, mergeTokens, validateTokens, computeDerivedTokens). |
| `packages/tokens/brand_tokens.schema.json` or `.ts` | Create canonical schema / TS type. |
| `packages/tokens/brand_tokens.default.json` | Create seed default set. |
| `packages/tokens/brand_tokens.example.<brand>.json` | Create example brand file. |
| `docs/BRAND_TOKENS_MIGRATION_MAPPING.md` | Create (old fields → new paths). |
| `supabase/migrations/XXXXXX_brand_design_tokens_flat.sql` | Create (brand_design_tokens_flat table + index). |
| `console/app/brands/new/page.tsx` | Modify (write Basic Info into DTCG-aligned token paths). |
| `console/app/brands/[id]/edit/page.tsx` | Modify (optional advanced token tree editor). |
| `control-plane/src/api.ts` | If needed: ensure PUT/POST brand_profiles accept new token shape; optionally sync to flat table. |
| Export stubs (CSS vars, JSON, deck config) | Add under `packages/tokens/export/` or equivalent. |
| Unit tests (validation, merge, derived) | Add for TokenService; snapshot tests for exports. |

---

## Repo context (existing)

- **Brand profiles:** [supabase/migrations/20250303000007_brand_engine.sql](supabase/migrations/20250303000007_brand_engine.sql) — `brand_profiles.design_tokens` (JSONB).
- **Console new brand:** [console/app/brands/new/page.tsx](console/app/brands/new/page.tsx) — sends `design_tokens: { color: { brand: { "500": primaryColor, "600": secondaryColor } }, typography: { font_headings, font_body }, logo_url }`.
- **Control Plane:** [control-plane/src/api.ts](control-plane/src/api.ts) — GET/POST/PUT/DELETE `/v1/brand_profiles`; reads/writes `design_tokens` in INSERT/UPDATE.
- **Runners:** [runners/src/brand-context.ts](runners/src/brand-context.ts) — fetches brand profile from Control Plane; uses for report/email/deck generation.
- **Shared UI tokens:** [packages/ui/src/tokens.ts](packages/ui/src/tokens.ts) — current static tokens (color, typography, etc.); brand-specific tokens will live in brand_profiles.design_tokens and be merged/applied per brand.

---

## Email rendering and Token Registry

The **Token Registry** (platform defaults + per-brand overrides) is available to email generation. The runner merges platform tokens with `brand_profiles.design_tokens` and injects the result as `sectionJson.tokens` when rendering MJML/HTML.

**In templates you can use:**

- **Handlebars:** `{{tokens.colors.brand.500}}`, `{{tokens.email.containerWidth}}`, `{{tokens.typography.fonts.body}}`, etc. Any dot path into the merged token set works.
- **Bracket placeholders:** `[colors.text.primary]`, `[email.containerWidth]`, `[typography.fonts.heading]` are resolved by dot path from `tokens`. Use these for inline styles or attributes (e.g. `width="[email.containerWidth]"`).

So whatever appears in the Token Registry (Console → Token Registry, including "By brand" overrides) is what the email can render. Existing placeholders like `[logo]`, `[product A title]`, `[siteUrl]` continue to work; add token paths to drive layout, colors, and typography from the registry. See [runners/src/handlers/email-generate-mjml.ts](runners/src/handlers/email-generate-mjml.ts) (sectionJson.tokens, replaceBracketPlaceholders, getByPath).

---

This document is the Cursor-ready spec for the brand tokenization upgrade. Implement in-repo with minimal churn, clean diffs, and clear comments.
