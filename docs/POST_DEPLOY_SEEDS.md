# Post-deploy seeds (Component Library + Sticky Green template)

After the **Control Plane** is deployed with the email component library API and **migrations** have been run, seed the component library and the Sticky Green composed template so the Console shows them.

**Prerequisites**

- Migrations run (including `email_component_library` and `email_templates_component_sequence`).
- Sticky Green brand exists (create once with `seed-brand-sticky-green.mjs` if needed).

**Run against staging API** (replace with your staging Control Plane URL if different):

```bash
export STAGING=https://ai-factory-api-staging.onrender.com

# Only if Sticky Green brand doesn't exist yet (otherwise you'll get duplicate slug):
node scripts/seed-brand-sticky-green.mjs "$STAGING"

# Seed the 8 email components (header, heroes, product blocks, footer):
node scripts/seed-email-component-library.mjs "$STAGING"

# Create "Sticky Green - Composed" template from those components:
node scripts/seed-sticky-green-composed-template.mjs "$STAGING"
```

Then in the Console you should see:

- **BRAND & DESIGN → Component Registry** — 8 components.
- **BRAND & DESIGN → Document Templates** — "Sticky Green - Composed" (and other templates).
- **BRAND & DESIGN → Template Proofing** — in the sidebar (run proof for Sticky Green there).
