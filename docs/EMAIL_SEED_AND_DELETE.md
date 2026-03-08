# Email templates: delete and seed for console

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
