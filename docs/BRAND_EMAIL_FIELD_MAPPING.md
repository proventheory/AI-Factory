# Brand → Email Field Mapping and Product URL Contract

This document defines how brand-edit UI fields map to storage and to the email runner (`sectionJson`), the product payload contract, and how products are pulled from XML sitemaps vs JSON URLs.

## 1. Field mapping (UI → storage → runner)

| UI section / field | Stored in | Runner / sectionJson key | Notes |
|--------------------|-----------|--------------------------|--------|
| **Basic info** | | | |
| Name | `brand_profiles.name` | `brandName`, `brand_name` | Mapped. |
| Logo URL | `design_tokens.logo.url`, `design_tokens.logo_url` | `logoUrl`, `logo_url`, `logo`, `brandLogo`, etc. | Mapped. |
| Wordmark (bold/light) | `design_tokens.logo.wordmark_bold`, `wordmark_light` | `wordmark_bold`, `wordmark_light` | Mapped. |
| Asset URLs | `design_tokens.asset_urls` | `asset_urls`, `assetUrls` (comma-separated string) | Mapped. |
| Primary / secondary color | `design_tokens.colors.brand["500"]` / `["600"]` | `brandColor`, `primaryColor`, `secondaryColor`, `brand_secondary` | Mapped. |
| Font (Headline/Body) | `design_tokens.typography.fonts` | `fontFamily`, `fonts`, `font_headings`, `font_body` (from typography) | Mapped. |
| **Identity** | | | |
| Industry, tagline, mission, website, contact email, location | `identity` (JSONB) | `tagline`, `mission`, `website`/`siteUrl`/`site_url`, `contact_email`/`contactEmail`, `contactInfo` (merged), `location`, `address`, `archetype`, `industry` | **Contact:** Email only in `identity.contact_email`. Other contact in `design_tokens.contact_info`; runner merges into `contactInfo`. |
| **Brand sitemap & products** | | | |
| Brand sitemap type / URL | `design_tokens.sitemap_url`, `sitemap_type` | `sitemap_url`, `sitemap_type` in sectionJson; campaign uses for product fetch | XML sitemap or JSON URL (e.g. shopify_json) supported. |
| **Social & contact** | | | |
| Social links | `design_tokens.social_media` | `sectionJson.socialMedia` | Mapped. |
| Contact email (single field) | `identity.contact_email` | `sectionJson.contactInfo` (merged), `sectionJson.contact_email`, `sectionJson.contactEmail` | Single source of truth; no duplicate in contact_info. |
| Other contact (phone, address, etc.) | `design_tokens.contact_info` | `sectionJson.contactInfo` (merged with email above) | No email entries; email lives in identity only. |
| **CTA/Button content + CTA link** | `design_tokens.cta_text`, `cta_link` | `cta_text`, `cta_label`, `cta_url`, `cta_link` from mergedTokens as fallback; LLM can override | Mapped. |

## 2. Product payload contract

All product sources (sitemap XML, JSON URL, or campaign metadata) must normalize to this shape for the email runner:

```ts
{
  src: string;        // image URL (required)
  title: string;     // product name (required)
  product_url: string; // link to product page (required)
  description?: string; // optional; empty when from XML unless enriched by LLM
}
```

- **Runner usage:** `product_N_image`, `product_N_title`, `product_N_url`, `product_N_description` (and letter variants productA, productB, …).
- **Missing description:** When products come from XML sitemap, `description` is empty unless an optional LLM enrichment step runs.

## 3. What is pulled from each product source

### XML sitemap path

- **Endpoint:** `POST /v1/sitemap/products`
- **Input:** `sitemap_url` (XML URL), `sitemap_type` (drupal | ecommerce | bigcommerce | shopify), optional `page`, `limit`.
- **Output:** `{ items: Array<{ src, title, product_url }>, has_more, total? }`. **No `description`** is returned; runner uses `""` or optional LLM-generated description.

### JSON URL path (Brand content URL)

- **Endpoint:** `POST /v1/products/from_url`
- **Input:** `url` (JSON URL), `type: "shopify_json"`, optional `limit`.
- **Output:** Same as sitemap: `{ items: Array<{ src, title, product_url, description? }>, has_more?, total? }`.

**Expected Shopify collection JSON schema (typical):**

- Root may be `{ products: [...] }` or array of products.
- Each product: `image` (object with `src` or `url`), or `images[0].src`; `title` or `name`; `url` or `handle` (base URL + handle); optional `body` or `description` for description.
- We map to: `src` = first image URL, `title` = title/name, `product_url` = full product URL, `description` = body/description if present.

Fields are **required** in our contract: `src`, `title`, `product_url`. `description` is optional; if the JSON has it we use it, otherwise leave empty or use optional LLM enrich.

## 4. Optional LLM for product descriptions

When products have no description (e.g. from XML sitemap or JSON without body), the runner can optionally call an LLM with `title` and `product_url` to generate a short `description` (1–2 sentences). This is gated by the **ENRICH_PRODUCT_DESCRIPTIONS** environment variable: set `ENRICH_PRODUCT_DESCRIPTIONS=true` (or `1`) in the runner to enable. Only products with an empty description are sent to the LLM; existing descriptions are left unchanged.

## 5. Template placeholders (bracket vs Handlebars)

Templates can use **Handlebars** `{{key}}` or **bracket** `[key]` placeholders. The runner compiles Handlebars first (on the MJML source), then compiles MJML to HTML, then replaces **all** `[placeholder]` tokens in the HTML with values from `sectionJson`.

### Bracket placeholders (recommended for multi-template support)

- **Logo / site:** `[logo]`, `[siteUrl]`, `[site_url]`, `[product productUrl]` (footer CTA → site URL).
- **Products (any letter A–Z, mapped to product 1–11):** `[product P src]`, `[product P title]`, `[product P productUrl]`, `[product P description]`, `[product P short info]`. Letter maps to index: A=1, B=2, …, K=11, L=1, M=2, … (wraps).
- **Value blocks (hero / value props):** `[A title]`, `[A description]` → headline/body (LLM copy); `[B title]`, `[B description]` → product 1; `[C title]`, `[C description]` → product 2.
- **Social:** `[social media link]`, `[social media icon]` (first entry); `[social media 2 link]`, `[social media 2 icon]`, etc.
- **Copy / direct keys:** `[headline]`, `[body]`, `[brandName]`, `[footerRights]`, etc. (from sectionJson).
- **Contact:** `[contactInfo]` (merged string: e.g. "email: x@y.com, phone: (210) 593-8426"); Handlebars `{{contact_email}}` or `{{contactEmail}}` for the raw email only.

For **LLM-generated copy and logo** to appear, the template must use placeholders (e.g. `[headline]`, `[body]`, `[logo]`) in the hero/header; static text in the MJML will not be replaced.

### Template UI/UX checklist

- Use `[logo]` in the header image `src` so the brand logo appears; avoid static or empty `src`.
- Use `[headline]` and `[body]` in the hero so campaign/LLM copy is shown.
- Use `[product X src]`, `[product X productUrl]` (with brackets) in `href` and `src`; broken links like `href="product productUrl"` (no brackets) are fixed by the runner when possible, but templates should use `[product productUrl]` or `[product P productUrl]`.
- Footer: use `[footerRights]`, `[siteUrl]`, and `***unsubscribe***` or design_tokens for legal/copyright.
- Social: use `[social media link]` and `[social media icon]` (or numbered variants); ensure design_tokens include `social_media` with `url` (and optional `icon`) per entry.

## 6. Full token reference (sectionJson keys)

Every key below is set by the runner and available to Handlebars `{{key}}` and bracket `[key]` placeholders.

| sectionJson key | Source | Notes |
|-----------------|--------|--------|
| **Identity (brand_profiles.identity)** | | |
| `brandName`, `brand_name` | `brand_profiles.name` | Brand display name. |
| `tagline` | `identity.tagline` | |
| `mission` | `identity.mission` | |
| `website`, `siteUrl`, `site_url` | `identity.website` | Main site URL. |
| `location`, `address` | `identity.location` | Footer/location; `address` used in brandFooter. |
| `archetype` | `identity.archetype` | |
| `industry` | `identity.industry` | |
| `contact_email`, `contactEmail` | `identity.contact_email` | Single canonical email. |
| `contactInfo` | Merged | `"email: x@y.com, phone: ..."` from identity.contact_email + design_tokens.contact_info. |
| **Design tokens (design_tokens)** | | |
| `logoUrl`, `logo_url`, `logo`, `brandLogo`, `brand_logo`, `logo_src`, `logoSrc` | `design_tokens.logo.url` / `logo_url` | Logo image URL. |
| `brandColor`, `color`, `primaryColor`, `brand_color` | `design_tokens.color.brand["500"]` | Primary brand color. |
| `secondaryColor`, `brand_secondary` | `design_tokens.color.brand["600"]` | Secondary color. |
| `fontFamily`, `fonts` | `design_tokens.typography.fonts.heading` or `font_headings` | Resolved to a single font string. |
| `font_headings`, `font_body` | `design_tokens.typography.fonts` | Heading and body font names. |
| `wordmark_bold`, `wordmark_light` | `design_tokens.logo` | Wordmark text parts. |
| `sitemap_url`, `sitemap_type` | `design_tokens` | Product sitemap URL and type. |
| `socialMedia` | `design_tokens.social_media` | Array; also `social_media_1_link`, `social_media_1_icon`, etc. |
| `cta_text`, `cta_label`, `cta_url`, `cta_link` | `design_tokens.cta_text`, `cta_link` | CTA button; LLM can override. |
| `asset_urls`, `assetUrls` | `design_tokens.asset_urls` | Comma-separated string in sectionJson. |
| **Computed / campaign** | | |
| `tokens` | `mergedTokens` | Full merged design_tokens for dot paths (e.g. `[colors.brand.500]`). |
| `voicetone` | `tone.voice_descriptors[0]` | First voice descriptor. |
| `footerRights`, `footer` | Computed | Year and brand name. |
| `imageUrl`, `hero_image`, `hero_image_url`, etc. | Hero/campaign | Hero image or logo fallback. |
| `headline`, `body`, `campaignPrompt`, etc. | LLM or campaign | Copy keys; LLM can override. |
