# Brand footer URLs (design_tokens.footer_urls)

Footer components (e.g. Pharmacy Time staging footer) use placeholders like `{{popularWeightManagementUrl}}`, `{{howItWorksUrl}}`, `{{privacyUrl}}`. These are resolved from the **brand profile** when previewing or rendering.

**Schema:** No Supabase migration is required. `footer_urls`, `heading_highlight_color`, and `gradients` are stored inside the existing `brand_profiles.design_tokens` JSONB column.

## Where to store URLs

Store them in the brand’s **design_tokens** under **footer_urls**: a flat object mapping placeholder name → full URL.

Example (Pharmacy Time staging):

```json
{
  "footer_urls": {
    "popularWeightManagementUrl": "https://pharmac7dev.wpenginepowered.com/weight-management/",
    "popularHormoneReplacementUrl": "https://pharmac7dev.wpenginepowered.com/hormone-replacement/",
    "popularIvTherapyUrl": "https://pharmac7dev.wpenginepowered.com/iv-therapy-supplements/",
    "popularSexualWellnessUrl": "https://pharmac7dev.wpenginepowered.com/sexual-wellness/",
    "popularThyroidUrl": "https://pharmac7dev.wpenginepowered.com/thyroid/",
    "popularGlp1Url": "https://pharmac7dev.wpenginepowered.com/glp-1-treatments/",
    "popularOzempicUrl": "https://pharmac7dev.wpenginepowered.com/ozempic/",
    "popularWegovyUrl": "https://pharmac7dev.wpenginepowered.com/wegovy/",
    "popularSermorelinUrl": "https://pharmac7dev.wpenginepowered.com/sermorelin/",
    "popularNadUrl": "https://pharmac7dev.wpenginepowered.com/nad-plus/",
    "howItWorksUrl": "https://pharmac7dev.wpenginepowered.com/how-it-works/",
    "faqUrl": "https://pharmac7dev.wpenginepowered.com/faq/",
    "contactUrl": "https://pharmac7dev.wpenginepowered.com/contact-us/",
    "termsUrl": "https://pharmac7dev.wpenginepowered.com/terms-conditions/",
    "privacyUrl": "https://pharmac7dev.wpenginepowered.com/privacy-policy/",
    "hipaaUrl": "https://pharmac7dev.wpenginepowered.com/hipaa-privacy-statement/"
  }
}
```

You can add this in **Console → Brands → Edit [brand]** by merging `footer_urls` into the existing `design_tokens` (e.g. via a future “Footer links” section or raw token edit), or via **API** `PUT /v1/brand_profiles/:id` with `design_tokens` including `footer_urls`.

## Generating footer_urls from a sitemap

To build a `footer_urls` object from a site (and optionally its sitemap):

```bash
node scripts/fetch-pharmacytime-footer-urls.mjs [BASE_URL]
```

- **BASE_URL** default: `https://pharmac7dev.wpenginepowered.com`
- The script tries `BASE_URL/sitemap.xml` first. If the sitemap is missing or fails, it uses a **slug map** (Pharmacy Time–specific paths) so every placeholder still gets a URL.
- **Output**: JSON object to merge into `design_tokens.footer_urls`. Redirect to a file if needed:
  `node scripts/fetch-pharmacytime-footer-urls.mjs > footer_urls.json`

## Placeholder groups (for reference)

- **POPULAR**: WooCommerce product-category links (Weight Management, Hormone Replacement, IV Therapy & Supplements, Sexual Wellness, Thyroid, GLP-1, Ozempic®, Wegovy®, Sermorelin, NAD+). Defaults use the `/product-category/...` path; set `footer_urls.popular*Url` to override.
- **COMPANY**: How it works, FAQ, Contact Us, Support.
- **LEGAL**: Terms & Conditions, Privacy Policy, HIPAA Privacy Statement.

If a key is missing from `footer_urls`, the Control Plane falls back to `identity.website` + a default path (e.g. `/privacy-policy/`, `/weight-management/`).

## Title highlight color (optional)

Design touch on titles (H1/H2): a color sometimes applied to part of a title (e.g. the purple #c2b6f8 on pharmacytime). **Not for links.** When this color isn’t used, titles often **bold a keyword** instead, since H1/H2 are not bold weight.

- **design_tokens.heading_highlight_color** (e.g. `"#c2b6f8"`)

Exposed in the placeholder map as **headingHighlightColor** and **heading_highlight_color**. If unset, the Control Plane uses brand 400 or `#c2b6f8`. Set in Console → Brands → Edit → Colors (Title highlight color).

## Gradients (container backgrounds)

Linear gradients for hero/container backgrounds. Stored as **design_tokens.gradients**: an array of `{ name: string, type: "linear", stops: string[] }` (stops = hex colors in order).

- **Console:** Brand Edit → Gradients (container backgrounds). Add/remove gradients; each has a name and 2+ color stops.
- **Placeholder map:** Each gradient is exposed as CSS: `gradient_0`, `gradient_1`, …; `gradientContainer1`, `gradientContainer2` (first two); and `gradient_<Name>` (e.g. `gradient_Linear_2`). Use in templates as `background: {{gradientContainer1}};` or `{{gradient_Linear_2}}`.

## Logo text (optional)

For text logos like “pharmacy**time**” you can set:

- **design_tokens.logo_pharmacy_text** (e.g. `"pharmacy"`)
- **design_tokens.logo_time_text** (e.g. `"time"`)

If unset, they are derived from the brand **name** (first word / rest).
