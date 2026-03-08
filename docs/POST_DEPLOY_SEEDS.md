# Post-deploy seeds (Component Library + Sticky Green template)

After the **Control Plane** is deployed with the email component library API and **migrations** have been run, seed the component library and the Sticky Green brand/template so the Console shows them.

**Prerequisites**

- Migrations run (including `email_component_library` and `email_templates_component_sequence`).

**Run against staging API** (replace with your staging Control Plane URL if different):

```bash
export STAGING=https://ai-factory-api-staging.onrender.com

# Sticky Green brand: upserts (creates if missing, updates if exists). Safe to run repeatedly.
# Sets: full design_tokens (palette 50–900, neutral, typography scale, contact_info, social_media,
# cta_text/link, sitemap), identity, tone, visual_style, copy_style, deck_theme, report_theme.
node scripts/seed-brand-sticky-green.mjs "$STAGING"

# Seed the 8 email components (header, heroes, product blocks, footer):
node scripts/seed-email-component-library.mjs "$STAGING"

# Create "Sticky Green - Composed" template from those components:
node scripts/seed-sticky-green-composed-template.mjs "$STAGING"
```

**Sticky Green seed payload (summary):** Identity (tagline, mission, website, contact_email, location), tone (voice_descriptors, reading_level, formality), visual_style, copy_style, design_tokens (color scale + neutral, typography families + heading/body/caption scale + fontWeight, logo_url, cta_text/link, contact_info, social_media, sitemap_url/type), deck_theme (chart_color_sequence, slide_master), report_theme (header_style, section_spacing). Source: https://stickygreenflower.com/

Then in the Console you should see:

- **BRAND & DESIGN → Brands** — Sticky Green with full Brand System View (diagnostics, palette, typography specimens, usage).
- **BRAND & DESIGN → Component Registry** — 8 components.
- **BRAND & DESIGN → Document Templates** — "Sticky Green - Composed" (and other templates).
- **BRAND & DESIGN → Template Proofing** — in the sidebar (run proof for Sticky Green there).
