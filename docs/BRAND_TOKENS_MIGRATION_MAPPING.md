# Brand tokens — migration mapping (old fields → new paths)

Map existing Brand Profile / Basic Info fields into DTCG-aligned token paths so current UI continues to work and new tokens are additive.

| Old field (UI / API) | New token path | Notes |
|----------------------|----------------|-------|
| `logo_url` | `identity.logo.url` or `logo.url` | Single logo URL. |
| `primary_color` | `colors.brand.500` or `colors.primary` | Keep `colors.brand.500` for compatibility with existing `design_tokens.color.brand.500`. |
| `secondary_color` | `colors.brand.600` or `colors.secondary` | Same as above. |
| `font_heading` / `font_headings` | `typography.fonts.heading` | |
| `font_body` | `typography.fonts.body` | |
| (identity) | `identity.*` | archetype, industry, tagline, mission → identity. |
| (tone) | `voice.*` | reading_level, formality, voice_descriptors → voice. |
| (visual_style) | `colors.*`, `layout.*`, `components.*` | style_description, density → map into semantic tokens where applicable. |
| (copy_style) | `marketing.*`, `voice.*` | voice, banned_words, cta_style → marketing + voice. |

## Backwards compatibility

- When reading: if `design_tokens` has legacy keys (`color.brand.500`, `typography.font_headings`, `logo_url`), treat them as if at the new paths so runners and Console see a single shape.
- When writing from “New Brand” / Basic Info: write both legacy keys and new paths during transition, or only new paths and have TokenService/API normalize for old consumers.
