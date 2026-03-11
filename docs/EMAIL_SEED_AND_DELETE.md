# Email templates: delete and seed for console

## Restoring the full template set (Simple Newsletter, Stitch, Dark hero, etc.)

The repo defines **8 templates** in `scripts/seed-email-templates.mjs`: Simple Newsletter, Promo / Product Grid, Single CTA, Hero + CTA (Cultura-style), Two-column product spotlight, Minimal announcement, Dark hero (1 image), Stitch (1 image, 2 products). To repopulate the Document Templates list with all of them (in addition to any you already have, e.g. Sticky Green - Composed):

```bash
node scripts/seed-email-templates.mjs <CONTROL_PLANE_URL>
```

Example: `node scripts/seed-email-templates.mjs https://ai-factory-api-staging.onrender.com`

This **creates** templates; it does not delete existing ones. So you can run it after `seed-email-for-console.mjs` to get both Sticky Green - Composed and the full set. If you previously saw only one template (e.g. after a one-shot seed), running this restores the rest.

**Emma / "Product - Emma":** The "Introducing Emma" template (later renamed "Product - Emma" by migration) is **not** in `seed-email-templates.mjs`. It was a separate template (contract and fixes are in migrations `20250309100000_introducing_emma_contract.sql`, `20250310100000_fix_introducing_emma_hero_placeholder.sql`, `20250311100000_email_templates_generic_builder_names.sql`). The runner has special handling for Emma (footer, hero, product links). To get it back you need either a DB backup that contains that row or the original MJML; there is no Emma MJML in the repo seed. If you have the MJML, create the template via the API or Document Templates UI, then run the migrations (or re-apply the contract) so `template_image_contracts` has the 1 image / 5 product slots for that template.

---

## Delete generic templates

To remove the default set of email templates (so the Document Templates list is clean):

```bash
node scripts/delete-email-templates-by-name.mjs <CONTROL_PLANE_URL>
```

Default names deleted: Dark hero (1 image), Minimal announcement, Two-column product spotlight, Hero + CTA (Cultura-style), Single CTA, Promo / Product Grid, Simple Newsletter.

To delete specific names only:

```bash
node scripts/delete-email-templates-by-name.mjs <CONTROL_PLANE_URL> "Simple Newsletter" "Single CTA"
```

## One-shot: delete + seed for console

Use the **same** Control Plane URL as your console (Vercel env `NEXT_PUBLIC_CONTROL_PLANE_API`, e.g. `https://ai-factory-api-staging.onrender.com`):

```bash
node scripts/seed-email-for-console.mjs https://ai-factory-api-staging.onrender.com
```

This will:

1. Delete the default generic templates above.
2. Upsert email components (centered header/footer logo, footer white logo in Component Registry).
3. Create or update **Sticky Green - Composed** (0 content images, 2 products, hero_1).

**Before running:** Ensure Sticky Green brand exists (`node scripts/seed-brand-sticky-green.mjs <CONTROL_PLANE_URL>`).

After running, refresh Document Templates and Component Registry in the console. Sticky Green - Composed should show **0 img, 2 prod** and a live preview thumbnail (no stored `image_url`). Components should show centered logos and footer using the white logo when the brand has one.
