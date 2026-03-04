# Design Tokens — Brand UI/UX (Fully Tokenized)

Everything about the brand is tokenized so the same system drives the **Console**, **emails**, **landing pages**, and **PDFs**. No hard-coded hex or pixel values in UI; all values come from the token source of truth. **Colors are fully tokenized** (brand, surface, text, state, border, neutral)—no raw hex in components.

## Schema: storing themes

The **`brand_themes`** table (migration `20250303000003_brand_themes.sql`) stores theme variants: `name`, `token_overrides` (jsonb), `component_variants` (jsonb), `mode` (light/dark). Keys in `token_overrides` match paths in `tokens.ts` (e.g. `color.brand.500`, `typography.heading.h1.size`). Use this for multi-tenant or website-generator themes; the Console can resolve theme by id and merge overrides with default tokens.

## Source of truth

- **`console/src/design-tokens/tokens.ts`** — Single source. TypeScript object defining:
  - **Colors:** brand (50–900), surface (base/raised/sunken), text (primary/secondary/muted/inverse), state (success/warning/danger/info + muted), border, neutral
  - **Typography:** fontFamily (sans, mono), fontSize (xs → 5xl), **heading** (h1–h6: size, weight, lineHeight), **subheading**, **body** (default, small), **caption**, **small**, fontWeight, lineHeight
  - **Spacing:** 4px grid (0, 1–6, 8, 10, 12, 16, 20, 24). For page layout (PageFrame, Stack, CardSection), use the **8px grid** convention (gap-2, gap-4, gap-6, gap-8 only); see [UI_AND_CURSOR.md](UI_AND_CURSOR.md).
  - **Layout:** container widths (sm, md, lg, xl, 2xl)
  - **Radius:** none, sm, default, md, lg, xl, full
  - **Shadow:** sm, default, md, lg, xl
  - **Motion:** duration (fast/normal/slow), easing (standard/emphasized)
  - **Border:** width (thin, default, thick)

## Outputs

1. **Tailwind theme** — `console/tailwind.config.ts` extends `theme` from `tokens`. Use classes like `text-heading-1`, `font-bold`, `text-brand-600`, `rounded-md`, `shadow-default`, `text-surface-base`.
2. **CSS custom properties** — `console/src/design-tokens/generated.css` exposes every token as `--brand-*` variables (e.g. `--brand-color-brand-600`, `--brand-typography-heading-h1-size`). Import this file in:
   - **Web:** already imported in `app/globals.css`
   - **Emails:** inline or `<style>` with `:root { ... }` from generated.css
   - **Landing pages:** same CSS vars in the page’s stylesheet
   - **PDFs:** use the same variable values (or export tokens to JSON and feed your PDF generator)

## Using tokens

### In the Console (Tailwind)

- **Headings:** `text-heading-1 font-bold`, `text-heading-2 font-bold`, `text-heading-3 font-semibold`, … `text-heading-6 font-semibold`
- **Subheading:** `text-subheading font-medium`
- **Body:** `text-body-default`, `text-body-small`
- **Caption:** `text-caption`, `text-caption-small`
- **Colors:** `text-brand-600`, `bg-surface-raised`, `text-state-success`, `border-border-default`
- **Spacing:** `p-4`, `gap-6` (from tokens.spacing)
- **Radius / shadow:** `rounded-md`, `shadow-default`

### In emails / landing pages / PDFs

1. **CSS:** Use `generated.css` (or a copy) so that `var(--brand-color-brand-600)`, `var(--brand-typography-heading-h1-size)`, etc. are available.
2. **JSON/TS:** Import or read `tokens` from `tokens.ts` (or export `tokens` to JSON) and pass values into your email template engine or PDF generator so every font size, color, and spacing comes from tokens.

## Regenerating generated.css

If you add or change tokens in `tokens.ts`, update `generated.css` to match. You can:
- Manually keep them in sync, or
- Add a small script that runs `tokensToCssVars()` from `tokens.ts` and writes the `:root { ... }` block to `generated.css`.

## Configurable / white-label

To support multiple brands or themes, keep the same token *structure* and swap values (e.g. different `tokens.color.brand`, different `tokens.typography.fontFamily.sans`). The Tailwind config and generated CSS can be built per theme from the same codebase.

## Brand Profiles as token source

Brand profiles (`brand_profiles.design_tokens`) can override the default tokens for per-brand customization. The `packages/ui/scripts/build-tokens.ts` script accepts a `--brand` flag to merge brand overrides with defaults and produce all platform outputs (CSS, JSON, Tailwind, deck theme, report theme). See [BRAND_ENGINE.md](BRAND_ENGINE.md) for the full architecture.

### Deck and Report themes

`brand_profiles.deck_theme` drives slide generation (chart colors, KPI card style, table style, slide master). `brand_profiles.report_theme` drives HTML/PDF report styling (header, footer, callouts, tables). Both are exported by the Style Dictionary build script.
