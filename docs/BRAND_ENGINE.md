# Brand Engine — Tokenized Brand Identity for the AI Factory

## Overview

The Brand Engine extends the AI Factory's design token system into a full **brand identity platform**: brand profiles with archetype, tone, voice, copy style, visual style, and design tokens; brand embeddings via pgvector for semantic retrieval; document generation (decks via PptxGenJS, reports via HTML); and brand context injection into every AI pipeline step.

## Architecture

BrandOS layers:
1. **Brand Schema (DB)** — `brand_profiles` stores full brand identity + design tokens + deck/report themes
2. **Design Tokens (portable)** — Style Dictionary exports tokens to CSS, JS, iOS, Android, Tailwind, deck theme, report theme
3. **Component Library** — `packages/doc-kit` provides document components (KPI card, table, chart, callout, timeline, etc.) with HTML renderers
4. **Generators** — `deck_generate` (PptxGenJS), `report_generate` (HTML), `copy_generate`, `email_generate`, `ui_scaffold`, `brand_compile`
5. **Brand Context Pipeline** — initiative → brand_profile → runner → LLM system prompt injection

## Schema

### brand_profiles
Full brand identity record. Columns: id, name, slug, brand_theme_id (FK brand_themes), identity (jsonb: archetype, industry, tagline, mission, values), tone (jsonb: voice_descriptors, reading_level, formality), visual_style (jsonb: density, style_description), copy_style (jsonb: voice, banned_words, preferred_phrases, cta_style), design_tokens (jsonb: full token set matching tokens.ts), deck_theme (jsonb), report_theme (jsonb), style_dimensions (jsonb), status, created_at, updated_at.

### brand_embeddings
pgvector store for semantic brand retrieval. Columns: id, brand_profile_id (FK), embedding_type, content, embedding vector(1536), metadata, created_at. Types: brand_description, copy_example, visual_guidelines, sample_ad, sample_email, tone_description. RPC: match_brand_embeddings(query_embedding, brand_id, threshold, count).

### document_templates
Reusable document templates. Types: pitch_deck, financial_deck, seo_report, ops_report, investor_update, analytics_report, marketing_deck, custom. Contains component_sequence (ordered list of document components).

### document_components
Individual components within a template: kpi_card, table_block, chart_block, callout, timeline, pricing_table, cover_slide, divider, text_block, image_block, two_column, header_block, footer_block.

### brand_assets
Brand visual assets: logo, icon, favicon, og_image, watermark, etc. Stored as URIs (Supabase Storage).

### FK on initiatives
initiatives.brand_profile_id (nullable) — every initiative can reference a brand.

### FK on llm_calls
llm_calls.brand_profile_id — per-brand cost tracking.

## Brand Context Flow

1. Initiative created with brand_profile_id
2. Plan compiler includes brand context in plan metadata
3. Runner loads brand context via `loadBrandContext(initiativeId)` from `runners/src/brand-context.ts`
4. `brandContextToSystemPrompt(ctx)` formats identity/tone/copy_style into LLM system prompt
5. LLM client sends `x-brand-profile-id` header for cost tracking
6. Handler produces brand-aware artifacts with brand_profile_id in metadata

## Style Dictionary Pipeline

`packages/ui/scripts/build-tokens.ts` reads tokens (default or brand override), exports:
- `generated/css-vars.css` — CSS custom properties
- `generated/tokens.json` — JSON (Figma/Tokens Studio compatible)
- `generated/tailwind-theme.js` — Tailwind theme.extend object
- `generated/deck-theme.json` — deck generation theme
- `generated/report-theme.css` — report styling

Run: `npx ts-node packages/ui/scripts/build-tokens.ts [--brand path/to/brand.json]`

## Document Generation

`packages/doc-kit` provides 13 document component types with HTML renderers. `html-renderer.ts` generates full branded HTML reports. Deck generation (PptxGenJS) is available via `deck-generate` handler.

## Control Plane API

- `GET/POST/PUT/DELETE /v1/brand_profiles` — CRUD for brand profiles
- `GET/POST/DELETE /v1/brand_profiles/:id/embeddings` — manage brand embeddings
- `POST /v1/brand_profiles/:id/embeddings/search` — semantic search
- `GET/POST/DELETE /v1/brand_profiles/:id/assets` — manage brand assets
- `GET/POST/PUT/DELETE /v1/document_templates` — CRUD for document templates
- `POST/PUT/DELETE /v1/document_templates/:id/components` — manage template components

## Console Pages

- `/brands` — list, create, detail, edit, archive brand profiles
- `/brands/[id]/embeddings` — manage brand embeddings
- `/document-templates` — list, create document templates
- Initiative create/edit — brand_profile_id selector

## Factory Job Types

| Job Type | Input | Output | Brand-Aware |
|---|---|---|---|
| brand_compile | brand_profile | tokens.json, css-vars.css, tailwind-theme.js | Yes |
| copy_generate | topic, content_type | copy text artifact | Yes (tone, copy_style) |
| email_generate | subject_hint, audience | email template artifact | Yes (design_tokens, copy_style) |
| deck_generate | template, data | PPTX artifact | Yes (deck_theme) |
| report_generate | template, data | HTML artifact | Yes (report_theme) |
| ui_scaffold | (initiative) | tailwind.config.ts, CSS vars | Yes (design_tokens) |

## GitHub References

- [Style Dictionary](https://github.com/style-dictionary/style-dictionary) — multi-platform token export
- [Tokens Studio](https://github.com/tokens-studio/figma-plugin) — Figma ↔ JSON ↔ GitHub sync
- [Telekom Design Tokens](https://github.com/telekom/design-tokens) — enterprise token structure
- [Primer/brand](https://github.com/primer/brand) — GitHub's brand tokens + voice/tone
- [pgvector](https://github.com/pgvector/pgvector) — vector similarity search in Postgres
- [PptxGenJS](https://github.com/gitbrent/PptxGenJS) — PowerPoint generation
- [Quarto](https://quarto.org) — technical publishing (future)

## Future

- Brand latent space (style_dimensions: serious↔playful, luxury↔accessible)
- Figma sync via Tokens Studio
- Report → Deck bridge (auto-summarize report into slides)
- Brand analytics (cost/runs/quality per brand)
- Multi-tenant brand isolation (RLS by org_id)
- Brand versioning (version history, diff, rollback)
- Brand-aware illustration/video/social generation
