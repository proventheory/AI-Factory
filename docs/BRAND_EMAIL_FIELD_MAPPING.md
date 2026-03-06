# Brand → Email Field Mapping and Product URL Contract

This document defines how brand-edit UI fields map to storage and to the email runner (`sectionJson`), the product payload contract, and how products are pulled from XML sitemaps vs JSON URLs.

## 1. Field mapping (UI → storage → runner)

| UI section / field | Stored in | Runner / sectionJson key | Notes |
|--------------------|-----------|--------------------------|--------|
| **Basic info** | | | |
| Name | `brand_profiles.name` | `brandName`, `brand_name` | Mapped. |
| Logo URL | `design_tokens.logo.url`, `design_tokens.logo_url` | `logoUrl`, `logo_url`, etc. (assets → dt → mergedTokens) | Mapped. |
| Primary / secondary color | `design_tokens.colors.brand["500"]` / `["600"]` | `brandColor`, `color`, `primaryColor` via mergedTokens | Mapped. |
| Font (Headline/Body) | `design_tokens.typography.fonts` | `fontFamily`, `fonts` from mergedTokens | Mapped. |
| **Identity** | | | |
| Industry, tagline, mission, website, contact email, location | `identity` (JSONB) | `siteUrl` ← identity.website; `tagline`; `contactInfo` (identity.contact_email or design_tokens.contact_info); footer `address` ← identity.location | contact_info and social_media from design_tokens used when present. |
| **Brand sitemap & products** | | | |
| Brand sitemap type / URL | `design_tokens.sitemap_url`, `sitemap_type` | Campaign `metadata_json.sitemap_url` / `sitemap_type`; runner calls `POST /v1/sitemap/products` or `POST /v1/products/from_url` when no products | XML sitemap or JSON URL (e.g. shopify_json) supported. |
| **Social & contact** | | | |
| Social links, contact info (type + value) | `design_tokens.social_media`, `contact_info` | `sectionJson.socialMedia`, `sectionJson.contactInfo` from design_tokens when present | Mapped. |
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

For **LLM-generated copy and logo** to appear, the template must use placeholders (e.g. `[headline]`, `[body]`, `[logo]`) in the hero/header; static text in the MJML will not be replaced.

### Template UI/UX checklist

- Use `[logo]` in the header image `src` so the brand logo appears; avoid static or empty `src`.
- Use `[headline]` and `[body]` in the hero so campaign/LLM copy is shown.
- Use `[product X src]`, `[product X productUrl]` (with brackets) in `href` and `src`; broken links like `href="product productUrl"` (no brackets) are fixed by the runner when possible, but templates should use `[product productUrl]` or `[product P productUrl]`.
- Footer: use `[footerRights]`, `[siteUrl]`, and `***unsubscribe***` or design_tokens for legal/copyright.
- Social: use `[social media link]` and `[social media icon]` (or numbered variants); ensure design_tokens include `social_media` with `url` (and optional `icon`) per entry.
