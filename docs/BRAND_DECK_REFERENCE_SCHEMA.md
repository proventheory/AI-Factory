# Brand Deck Reference Schema — Token Contract

This document defines the canonical token structure for the Brand System View and downstream consumers (emails, pitch decks, reports, graphics). It does not replace existing `design_tokens`; it describes how we **layer** and **interpret** them.

## Three-layer separation

Do not blend source-of-truth tokens, semantic roles, and channel usage in one bucket.

| Layer | Purpose | Lives in | Examples |
|-------|---------|----------|----------|
| **Layer 1 — Core tokens** | Pure values | `brand_profiles.design_tokens` | `color.brand.50`–`900`, typography families, type scale, weights |
| **Layer 2 — Semantic roles** | How tokens function | Role mapping in `design_tokens` or small config | primary, secondary, accent; heading, body, caption; CTA; chart_1, chart_2 |
| **Layer 3 — Channel mappings** | Where they apply | Usage data / telemetry | email, deck, report, image generation, social, web |

- **Source token:** e.g. `color.brand.500`
- **Usage mapping:** "Used in headings / CTA / decks" (data or static)
- **Derived presentation:** display-only (e.g. tint for preview) — not stored as core tokens

## design_tokens discipline

- **design_tokens** = canonical **cross-channel primitives only** (colors, typography, spacing, radius, etc.).
- **deck_theme** = slide/deck-specific rules (slide_master, chart_color_sequence, kpi_card_style, table_style).
- **report_theme** = report/PDF-specific rules (header_style, footer_style, section_spacing, callout_style).

Do not store deck layout, chart defaults, or report-only rules inside `design_tokens`.

## Alias policy

- **Canonical storage for palette:** scale keys only — `50, 100, 200, 300, 400, 500, 600, 700, 800, 900` plus optional `neutral` ramp. Legacy keys `primary`, `primary_dark` remain for backward compatibility.
- **Role mapping:** semantic roles (primary → 500, secondary → 600, accent → 400) resolve to scale keys. Can be stored as e.g. `roleMapping: { primary: "500", secondary: "600" }`.

## Fallback precedence

1. **Explicit** — value set on this brand.
2. **Inherited** — from brand_theme_id or default theme.
3. **Default** — from `console/src/design-tokens/tokens.ts` (system defaults).
4. **Missing** — no value; downstream skips or uses safe fallback.

Runners and Console use the same precedence.

## Completeness model

| Dimension | Levels | Meaning |
|-----------|--------|---------|
| **Color system** | Minimal / Standard / Complete | Minimal = 1–2 colors (e.g. 500, 600); Standard = 3+ scale keys or primary + secondary + one neutral; Complete = full scale (50–900) + optional semantic |
| **Typography system** | Minimal / Standard / Complete | Minimal = heading + body family only; Standard = families + basic scale; Complete = families + full scale + weights + role assignments |
| **Deck readiness** | Partial / Ready | Partial = missing chart colors or slide typography; Ready = deck_theme populated and validated |
| **Report readiness** | Partial / Ready | Partial = missing header/footer or type roles; Ready = report_theme populated and validated |
| **Email readiness** | Partial / Ready | Partial = missing CTA or safe contrast; Ready = required email tokens present |

Rules (single place for runners + UI):

- **Color Minimal:** at least one of `color.brand.500` or `color.brand.600` (or legacy `primary` / `primary_dark`).
- **Color Standard:** Minimal + (3+ numeric keys in `color.brand` OR presence of `color.neutral` with at least one key).
- **Color Complete:** 5+ scale keys (e.g. 50, 100, 500, 600, 900) or full 50–900.
- **Typography Minimal:** at least one of `typography.fonts.heading` or `typography.fonts.body` (or legacy font_headings / font_body).
- **Typography Standard:** both heading and body family + at least one of fontSize scale or heading.h1 size.
- **Typography Complete:** families + full type scale (heading h1–h6, body, caption) + fontWeight entries.
- **Deck Ready:** deck_theme exists and has at least chart_color_sequence or slide_master.
- **Report Ready:** report_theme exists and has at least header_style or section_spacing.
- **Email Ready:** design_tokens has cta_text (or default), and color.brand.500 (or primary) for CTA.

## Mapping to existing storage

- `brand_profiles.design_tokens` (JSONB) holds Layer 1 and optionally Layer 2 (role mapping).
- `brand_profiles.deck_theme` (JSONB) holds deck-specific application.
- `brand_profiles.report_theme` (JSONB) holds report-specific application.
- Layer 3 (channel mappings) is served by **usage telemetry**: `GET /v1/brand_profiles/:id/usage` returns `initiatives_count`, `runs_count`, `last_run_at`, `document_templates_count`, `email_templates_count`. Console Brand System View displays these as clickable counts and links.

## Console Brand System View

The brand detail page (`/brands/[id]`) is the **Brand System View**: a diagnostic and navigation surface for the design token pipeline.

- **Diagnostic panel:** Completeness (Color, Typography, Deck, Report, Email) with "Why?" expandable reason and missing-token list; suggestions for what to configure next.
- **Palette:** Visually separated into Scale (50–900) and Role aliases (primary, primary_dark, accent); optional usage labels (CTA, headings, charts) from `PALETTE_ROLE_USAGE`.
- **Typography:** Three layers (families, scale table with size/weight/line-height, weights); Specimens & in-context shows h1–h6 and body paragraph in **brand colors** (heading color from palette.brand.700/600/500, body from neutral).
- **Resolved tokens:** Expanded path set; Explicit / Default / Missing with fallback-chain copy for debugging.
- **Preview surfaces:** Email header, deck title slide, report cover, product card (mini mockups using brand tokens).
- **Usage:** Data from usage API; clickable counts to initiatives, runs, document templates.

## Normalization table (reference deck extraction)

When extracting from reference PDFs or brand guidelines, fill:

| Field | Notes |
|-------|--------|
| Core colors count | Number of distinct brand colors |
| Tonal ramps vs flat | 50–900 scale vs primary/secondary only |
| Typography presentation | Families only / scale / weights |
| Weights shown | Yes/No; which (400, 500, 600, 700) |
| Usage explicit/implied | Is "used in emails/decks" stated? |
| Surfaces grouped by medium | email, deck, report, social |
| Specimen vs mockup | Type samples only vs full screens |

Schema and example JSON should be derived from recurring structure across decks.
