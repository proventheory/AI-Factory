# Brand tokens: legacy / UI fields → canonical paths

This doc maps **old or UI-only field names** to the **canonical design token paths** used in `packages/tokens` (DTCG-aligned). Use it when reading/writing `brand_profiles.design_tokens` or when syncing to `brand_design_tokens_flat`.

---

## Console "Basic Info" → token paths

| UI / legacy field | Canonical path(s) | Notes |
|-------------------|-------------------|--------|
| `primary_color` (form) | `colors.brand.500`, `colors.brand.primary` | Primary brand color; prefer `colors.brand.500` for scale. |
| `secondary_color` (form) | `colors.brand.600`, `colors.brand.primary_dark` | Secondary / darker primary. |
| `font_headings` | `typography.fonts.heading` | Heading font family. |
| `font_body` | `typography.fonts.body` | Body font family. |
| `logo_url` | `logo.url`, `identity.logo_url` | Logo image URL; `logo.url` is the canonical path in types. |
| Two-part wordmark (e.g. Pharmacy **bold** + time *light*) | `logo.wordmark_bold`, `logo.wordmark_light` | Use with `logo.type: "wordmark"`; landing page header renders `.lp-logo-bold` (700) and `.lp-logo-light` (300). |

The Console **New Brand** form already write-through to both legacy and canonical paths (e.g. `typography.font_headings` and `typography.fonts.heading`) for backwards compatibility.

---

## Legacy `design_tokens` shapes

Some consumers still expect:

- `color.brand["500"]` (singular `color`) → treat as `colors.brand.500`.
- `typography.font_headings` / `typography.font_body` → treat as `typography.fonts.heading` / `typography.fonts.body`.

**Canonical (DTCG-style) paths to use in new code:**

- `colors.brand.500`, `colors.brand.600`, `colors.brand.primary`, `colors.brand.primary_dark`
- `colors.text.primary`, `colors.text.secondary`, `colors.surface.base`
- `typography.fonts.heading`, `typography.fonts.body`, `typography.fonts.mono`
- `logo.url`
- `identity.tagline`, `identity.website`
- `voice.reading_level`, `voice.formality`

---

## Reading in runners / generators

When generating copy, decks, or landing pages:

1. Prefer **TokenService.getToken(tokens, path)** with canonical paths (e.g. `colors.brand.500`, `typography.fonts.heading`).
2. Fallback: if `getToken(tokens, "typography.fonts.heading")` is missing, try `typography.font_headings` or `typography.fonts?.heading`.
3. Merge with **TokenService.mergeTokens(brandTokensDefault, brand.design_tokens)** so missing keys use platform defaults.

---

## Sync to `brand_design_tokens_flat`

When persisting `design_tokens`, the Control Plane flattens to `brand_design_tokens_flat` (path, value, type, group). Paths are dot-separated (e.g. `colors.brand.500`). Legacy keys like `logo_url` at root are stored as `logo_url`; prefer storing under `logo.url` so both `logo` and `logo.url` exist in the flat table for search.

---

## Reference

- **Types:** `packages/tokens/src/types.ts` (`DesignTokens`)
- **Defaults:** `packages/tokens/src/defaults.json` and `brandTokensDefault`
- **Service:** `packages/tokens/src/TokenService.ts` (getToken, setToken, mergeTokens, validateTokens, computeDerivedTokens)
- **Upgrade plan:** `docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md`
