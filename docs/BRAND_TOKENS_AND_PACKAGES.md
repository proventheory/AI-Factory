# Brand tokens: Console write-through and packages/tokens

**Console** persists brand design tokens via the Control Plane API (`brand_profiles.design_tokens` JSONB). The **packages/tokens** package is the canonical place for token get/set/merge/validate and for exporting to CSS, email, and deck config.

---

## Current wiring

| Layer | What it does |
|-------|----------------|
| **Console** (`console/app/brands/`, `token-helpers.ts`) | Builds `design_tokens` from Basic Info (colors, fonts, logo) and sends them on create/update. **Brand System View** (`/brands/[id]`): diagnostics (completeness + missing tokens), palette scale vs roles, typography specimens (h1–h6, body in brand colors), resolved tokens, preview surfaces (email, deck, report, product card), usage (from `GET /v1/brand_profiles/:id/usage`). **Edit** (`/brands/[id]/edit`): "Design tokens (advanced)" with palette scale (50–900), typography scale/weights; `validateDesignTokens` + `mergeDesignTokensExtended` before save. See [BRAND_TOKENS_MIGRATION_MAPPING.md](BRAND_TOKENS_MIGRATION_MAPPING.md), [BRAND_DECK_REFERENCE_SCHEMA.md](BRAND_DECK_REFERENCE_SCHEMA.md), [BRAND_TOKEN_VALIDATION.md](BRAND_TOKEN_VALIDATION.md). |
| **packages/tokens** | `TokenService`: getToken, setToken, mergeTokens, validateTokens, computeDerivedTokens. Exports: `exportToCssVariables`, `exportToEmailJson`, `exportToDeckConfig`. Used by runners (e.g. brand-context) and by build scripts. |
| **Control Plane** | Syncs `design_tokens` to `brand_design_tokens_flat` when a brand is updated (for search). Exposes `GET /v1/brand_profiles/:id/usage` for Console Brand System View. |

---

## Aligning with the upgrade plan

For the full [BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md) (W3C DTCG, ~150–400 tokens):

1. **Console** can keep using `buildDesignTokens` for the current Basic Info fields; extend it to write through to the canonical paths defined in the upgrade plan.
2. **packages/tokens** should remain the single place for merge, validate, and derive. Console (or a shared lib) can call `mergeTokens(base, overrides)` and `validateTokens(tokens)` before sending to the API.
3. **Runners** already load brand via `runners/src/brand-context.ts`; they can use `packages/tokens` for export (CSS vars, email-safe JSON) when generating landing pages, emails, or decks.

No change is required for existing flows; this doc is the reference for where token logic lives and how to extend it.
