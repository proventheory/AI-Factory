/**
 * Parse POST body for POST /v1/wp-shopify-migration/wizard_job into a pipeline payload.
 */

import { WIZARD_JOB_KINDS, type WpShopifyWizardJobPayload } from "./wp-shopify-migration-pipeline.js";

export function parseWizardJobPayload(body: Record<string, unknown>): WpShopifyWizardJobPayload {
  const kind = String(body.kind ?? "").trim();
  if (!WIZARD_JOB_KINDS.has(kind)) {
    throw new Error(`Unknown wizard job kind: ${kind || "(missing)"}. Valid: ${[...WIZARD_JOB_KINDS].join(", ")}`);
  }
  const brand_id = String(body.brand_id ?? "").trim();
  if (!brand_id) {
    throw new Error("brand_id is required for orchestrated wizard actions (ties runs to a WP → Shopify initiative).");
  }

  switch (kind) {
    case "source_crawl": {
      const source_url = String(body.source_url ?? "").trim();
      if (!source_url || !/^https?:\/\//i.test(source_url)) {
        throw new Error("source_url is required and must be http(s)");
      }
      return {
        kind,
        brand_id,
        source_url,
        use_link_crawl: Boolean(body.use_link_crawl),
        max_urls: Math.min(5000, Math.max(1, Number(body.max_urls) || 2000)),
        crawl_delay_ms: Number.isFinite(Number(body.crawl_delay_ms)) ? Math.max(0, Number(body.crawl_delay_ms)) : 500,
        fetch_page_details: Boolean(body.fetch_page_details),
      };
    }
    case "seo_gsc_report": {
      const site_url = String(body.site_url ?? "").trim();
      if (!site_url) throw new Error("site_url is required");
      return {
        kind,
        brand_id,
        site_url,
        date_range: String(body.date_range ?? "last28days"),
        row_limit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
      };
    }
    case "seo_ga4_report": {
      return {
        kind,
        brand_id,
        row_limit: Math.min(1000, Math.max(1, Number(body.row_limit) || 500)),
        ...(body.property_id != null && String(body.property_id).trim()
          ? { property_id: String(body.property_id).trim() }
          : {}),
      };
    }
    case "seo_keyword_volume": {
      const keywords = Array.isArray(body.keywords) ? body.keywords.map((k) => String(k)).filter(Boolean) : [];
      if (keywords.length === 0) throw new Error("keywords array is required (non-empty)");
      if (keywords.length > 5000) throw new Error("At most 5000 keywords per job");
      return { kind, brand_id, keywords };
    }
    case "migration_preview": {
      const entity = String(body.entity ?? "").trim();
      const allowed = new Set([
        "products",
        "categories",
        "customers",
        "discounts",
        "blogs",
        "pages",
        "blog_tags",
        "pdfs",
        "redirects",
      ]);
      if (!allowed.has(entity)) {
        throw new Error(`entity must be one of: ${[...allowed].join(", ")}`);
      }
      const page = Math.max(1, Math.min(500, Number(body.page) || 1));
      const per_page = Math.max(5, Math.min(100, Number(body.per_page) || 50));
      const out: WpShopifyWizardJobPayload = {
        kind,
        brand_id,
        entity,
        page,
        per_page,
      };
      if (body.wp_username != null && String(body.wp_username).trim()) {
        out.wp_username = String(body.wp_username).trim();
      }
      if (body.wp_application_password != null && String(body.wp_application_password).trim()) {
        out.wp_application_password = String(body.wp_application_password).trim();
      }
      if (body.woo_server != null && String(body.woo_server).trim()) {
        out.woo_server = String(body.woo_server).trim();
      }
      if (body.woo_consumer_key != null && String(body.woo_consumer_key).trim()) {
        out.woo_consumer_key = String(body.woo_consumer_key).trim();
      }
      if (body.woo_consumer_secret != null && String(body.woo_consumer_secret).trim()) {
        out.woo_consumer_secret = String(body.woo_consumer_secret).trim();
      }
      return out;
    }
    case "migration_run_placeholder": {
      const entities = Array.isArray(body.entities) ? body.entities.map((e) => String(e)) : [];
      const ex = body.excluded_ids_by_entity;
      const excluded_ids_by_entity: Record<string, string[]> = {};
      if (ex && typeof ex === "object" && !Array.isArray(ex)) {
        for (const [k, v] of Object.entries(ex as Record<string, unknown>)) {
          if (Array.isArray(v)) excluded_ids_by_entity[k] = v.map((x) => String(x));
        }
      }
      const maxRaw = Number(body.max_files);
      const max_files = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
      const out: WpShopifyWizardJobPayload = {
        kind,
        brand_id,
        entities,
        excluded_ids_by_entity,
        max_files,
        create_redirects: body.create_redirects !== false,
        skip_if_exists_in_shopify: body.skip_if_exists_in_shopify === true,
      };
      const targetStore = String(body.target_store_url ?? "").trim();
      if (targetStore) out.target_store_url = targetStore;
      const blogH = String(body.shopify_blog_handle ?? "").trim();
      if (blogH) out.shopify_blog_handle = blogH;
      if (body.wp_username != null && String(body.wp_username).trim() && body.wp_application_password != null && String(body.wp_application_password).trim()) {
        out.wp_username = String(body.wp_username).trim();
        out.wp_application_password = String(body.wp_application_password).trim();
      }
      if (body.woo_server != null && String(body.woo_server).trim()) {
        out.woo_server = String(body.woo_server).trim();
      }
      if (body.woo_consumer_key != null && String(body.woo_consumer_key).trim()) {
        out.woo_consumer_key = String(body.woo_consumer_key).trim();
      }
      if (body.woo_consumer_secret != null && String(body.woo_consumer_secret).trim()) {
        out.woo_consumer_secret = String(body.woo_consumer_secret).trim();
      }
      return out;
    }
    case "wizard_state_snapshot": {
      const wizard_step = Number(body.wizard_step);
      if (!Number.isFinite(wizard_step) || wizard_step < 1 || wizard_step > 9) {
        throw new Error("wizard_step must be a number 1–9");
      }
      const summary = body.summary;
      if (summary == null || typeof summary !== "object" || Array.isArray(summary)) {
        throw new Error("summary must be an object");
      }
      const out: WpShopifyWizardJobPayload = {
        kind,
        brand_id,
        wizard_step,
        summary: summary as Record<string, unknown>,
      };
      if (body.previous_step != null && Number.isFinite(Number(body.previous_step))) {
        out.previous_step = Number(body.previous_step);
      }
      if (body.state_json !== undefined) {
        out.state_json = body.state_json;
      }
      const b = body as Record<string, unknown>;
      const suSnap = String(b.source_url ?? "").trim();
      if (suSnap && /^https?:\/\//i.test(suSnap)) (out as Record<string, unknown>).source_url = suSnap;
      const tuSnap = String(b.target_store_url ?? "").trim();
      if (tuSnap && /^https?:\/\//i.test(tuSnap)) (out as Record<string, unknown>).target_store_url = tuSnap;
      const gscSnap = String(b.gsc_site_url ?? "").trim();
      if (gscSnap && /^https?:\/\//i.test(gscSnap)) (out as Record<string, unknown>).gsc_site_url = gscSnap;
      const ga4Snap = String(b.ga4_property_id ?? "").trim();
      if (ga4Snap) (out as Record<string, unknown>).ga4_property_id = ga4Snap;
      return out;
    }
    case "dry_run": {
      const entities = Array.isArray(body.entities) ? body.entities.map((e) => String(e)) : ["products", "categories"];
      const out: WpShopifyWizardJobPayload = { kind, brand_id, entities };
      if (body.wp_username != null && String(body.wp_username).trim() && body.wp_application_password != null && String(body.wp_application_password).trim()) {
        out.wp_username = String(body.wp_username).trim();
        out.wp_application_password = String(body.wp_application_password).trim();
      }
      return out;
    }
    case "pdf_import": {
      const maxRaw = Number(body.max_files);
      const max_files = Number.isFinite(maxRaw) ? Math.min(2000, Math.max(1, maxRaw)) : 500;
      const out: WpShopifyWizardJobPayload = {
        kind,
        brand_id,
        excluded_ids: Array.isArray(body.excluded_ids) ? body.excluded_ids.map((x) => String(x)) : [],
        create_redirects: body.create_redirects !== false,
        skip_if_exists_in_shopify: body.skip_if_exists_in_shopify === true,
        max_files,
      };
      if (body.wp_username != null && String(body.wp_username).trim() && body.wp_application_password != null && String(body.wp_application_password).trim()) {
        out.wp_username = String(body.wp_username).trim();
        out.wp_application_password = String(body.wp_application_password).trim();
      }
      return out;
    }
    case "pdf_resolve": {
      const wordpress_ids = Array.isArray(body.wordpress_ids) ? body.wordpress_ids.map((x) => String(x)) : [];
      if (wordpress_ids.length === 0) throw new Error("wordpress_ids is required");
      if (wordpress_ids.length > 2000) throw new Error("At most 2000 wordpress_ids");
      const out: WpShopifyWizardJobPayload = {
        kind,
        brand_id,
        wordpress_ids,
        create_redirects: body.create_redirects !== false,
      };
      if (body.wp_username != null && String(body.wp_username).trim() && body.wp_application_password != null && String(body.wp_application_password).trim()) {
        out.wp_username = String(body.wp_username).trim();
        out.wp_application_password = String(body.wp_application_password).trim();
      }
      return out;
    }
    default:
      throw new Error(`Unhandled kind: ${kind}`);
  }
}
