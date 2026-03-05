# Brand design tokens — taxonomy (tree)

Top-level groups aligned to W3C DTCG and enterprise use (emails, web, decks, SEO, image/motion). See [BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md).

## Tree

```
identity          — philosophical (archetype, mission, values)
voice             — tone controls (reading_level, formality, descriptors)
colors            — semantic + stateful
  .brand          — primary, secondary, accent
  .text           — primary, secondary, muted, inverse
  .surface        — base, raised, sunken
  .state          — success, warning, danger, info (+ muted variants)
  .border         — subtle, default, strong
  .button.*       — default/hover/active/focus/disabled (bg, text, border)
typography        — families, scales, weights, line-heights, letter-spacing
  .fonts          — heading, body, mono
  .scale          — size scale (e.g. xs–4xl)
  .weight         — heading, body
spacing           — scale (e.g. 0–16), container, section, grid
layout            — container max-width, columns, gap
components        — button, card, input, badge, link (+ states)
email             — container width, padding, button, divider, footer (email-safe)
marketing         — CTA styles, headline rules, offer formatting, urgency lexicon
seo               — meta title/description lengths, heading structure, internal linking
documents         — slide typography, padding, tables, charts, diagram style
image_generation  — style, lighting, background, aspect
motion            — transitions, speed, easing
```

## Naming rules

- Semantic over raw: `color.text.primary`, `color.button.primary.bg`.
- States: `default`, `hover`, `active`, `focus`, `disabled` where applicable.
- Email tokens: no reliance on unsupported CSS in email clients.
