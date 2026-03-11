#!/usr/bin/env node
/**
 * WooCommerce sync for Pharmacy Time: fetch products, variations, categories from WordPress/WooCommerce,
 * store raw payloads, cross-reference with brand_catalog_products (Airtable import), and upsert into ads commerce.
 * Use with Pharmacy Repo .env (WOOCOMMERCE_URL, CONSUMER_KEY, CONSUMER_SECRET) and AI Factory DATABASE_URL.
 *
 * Prerequisites: Same DB as Pharmacy Airtable import (brand_profiles + Pharmacy Time). Run before first sync:
 *   npm run db:migrate:ads-commerce   (creates stores + products)
 *   (raw_woocommerce_snapshots from migration 20250331000005)
 *
 * Usage:
 *   npm run woocommerce:sync:pharmacy
 *   Or: export $(grep -E '^WOOCOMMERCE_|^CONSUMER_KEY=|^CONSUMER_SECRET=' "Pharmacy Repo/Pharmacy/.env" | xargs); node --env-file=.env scripts/woocommerce-sync-pharmacy.mjs
 */

import pg from "pg";
import { readFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const SCOPE_KEY = "pharmacy-time";
const BRAND_SLUG = "pharmacytime-com";

function getEnv(name, alt) {
  return process.env[name] || process.env[alt] || "";
}

/** Load WOOCOMMERCE_* and CONSUMER_KEY/SECRET from Pharmacy Repo .env if not already set. */
function loadPharmacyRepoEnv() {
  const need = !getEnv("WOOCOMMERCE_CONSUMER_KEY", "CONSUMER_KEY") || !getEnv("WOOCOMMERCE_CONSUMER_SECRET", "CONSUMER_SECRET");
  if (!need) return;
  const candidates = [
    process.env.PHARMACY_REPO_PATH,
    join(process.cwd(), "Pharmacy Repo", "Pharmacy", ".env"),
    join(process.cwd(), "..", "Pharmacy Repo", "Pharmacy", ".env"),
    join(__dirname, "..", "..", "Pharmacy Repo", "Pharmacy", ".env"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        const content = readFileSync(p, "utf8");
        for (const line of content.split("\n")) {
          const m = line.match(/^\s*(WOOCOMMERCE_[A-Z_]+|CONSUMER_KEY|CONSUMER_SECRET)\s*=\s*(.*)$/);
          if (m && process.env[m[1]] == null) {
            const val = m[2].replace(/^["']|["']$/g, "").trim();
            if (val) process.env[m[1]] = val;
          }
        }
        console.log("  Loaded WooCommerce credentials from", p);
        return;
      } catch (_) {
        /* ignore */
      }
    }
  }
}

loadPharmacyRepoEnv();

const WOO_URL = getEnv("WOOCOMMERCE_URL", "WOOCOMMERCE_URL").replace(/\/$/, "") || "https://pharmac7dev.wpenginepowered.com";
const CONSUMER_KEY = getEnv("WOOCOMMERCE_CONSUMER_KEY", "CONSUMER_KEY");
const CONSUMER_SECRET = getEnv("WOOCOMMERCE_CONSUMER_SECRET", "CONSUMER_SECRET");

function slugify(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function wcGet(path, params = {}) {
  const url = new URL(`${WOO_URL}/wp-json/wc/v3${path}`);
  url.searchParams.set("consumer_key", CONSUMER_KEY);
  url.searchParams.set("consumer_secret", CONSUMER_SECRET);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`WC ${res.status} ${path}: ${await res.text()}`);
  return res.json();
}

async function fetchAllProducts() {
  const products = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const list = await wcGet("/products", { page, per_page: perPage, status: "any" });
    if (!list.length) break;
    products.push(...list);
    if (list.length < perPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 400));
  }
  return products;
}

async function fetchVariations(productId) {
  const list = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const data = await wcGet(`/products/${productId}/variations`, { page, per_page: perPage });
    if (!data.length) break;
    list.push(...data);
    if (data.length < perPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 400));
  }
  return list;
}

async function fetchAllCategories() {
  const out = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const list = await wcGet("/products/categories", { page, per_page: perPage });
    if (!list.length) break;
    out.push(...list);
    if (list.length < perPage) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return out;
}

function getMeta(productOrVariation, key) {
  const meta = productOrVariation.meta_data || [];
  const row = meta.find((m) => m.key === key);
  return row ? row.value : null;
}

function wcVariationKey(product, variation) {
  const productKey = getMeta(product, "_product_key");
  if (!productKey) return null;
  const strengthKey = variation ? getMeta(variation, "_strength_key") : null;
  const size = variation ? getMeta(variation, "size") : null;
  const parts = [productKey];
  if (strengthKey) parts.push(strengthKey);
  if (size != null && size !== "") parts.push(slugify(String(size)));
  return parts.length > 1 ? parts.join("|") : productKey;
}

function catalogVariationKey(metadata) {
  if (!metadata || typeof metadata !== "object") return null;
  const compound = metadata.compound_display || metadata["Compound Name"] || metadata.compound_name || "";
  const form = metadata.form_display || metadata.Form || metadata.form || "";
  const category = metadata.category || metadata.therapeutic_area || metadata["Therapeutic Area"] || metadata["Category"] || "";
  const strength = metadata["Strength (mg/g)"] || metadata.strength_mg_per_g || metadata.strength_mg || "";
  const size = metadata.Size || metadata.size;
  const productKeyParts = [slugify(compound), slugify(form), slugify(category)].filter(Boolean);
  const productKey = productKeyParts.join("|") || [slugify(compound), slugify(form)].filter(Boolean).join("|");
  if (!productKey) return null;
  const strengthKey = slugify(strength);
  const parts = [productKey];
  if (strengthKey) parts.push(strengthKey);
  if (size != null && size !== "") parts.push(slugify(String(size)));
  return parts.join("|") || productKey;
}

async function main() {
  if (!CONSUMER_KEY || !CONSUMER_SECRET) {
    console.error("Set WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET (or CONSUMER_KEY, CONSUMER_SECRET)");
    process.exit(1);
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  console.log("Fetching WooCommerce data from", WOO_URL);
  const products = await fetchAllProducts();
  console.log("  Products:", products.length);

  const productsWithVariations = [];
  for (const p of products) {
    const item = { ...p, variations: [] };
    if (p.type === "variable") {
      item.variations = await fetchVariations(p.id);
      await new Promise((r) => setTimeout(r, 300));
    }
    productsWithVariations.push(item);
  }

  const categories = await fetchAllCategories();
  console.log("  Categories:", categories.length);

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();

  try {
    let brandId = (await client.query("SELECT id FROM brand_profiles WHERE slug = $1", [BRAND_SLUG])).rows[0]?.id;
    if (!brandId) {
      const brandJsonPath = join(__dirname, "brands", "pharmacytime-com.brand.json");
      if (existsSync(brandJsonPath)) {
        const payload = JSON.parse(readFileSync(brandJsonPath, "utf8"));
        const ins = await client.query(
          `INSERT INTO brand_profiles (name, slug, status, identity, tone, visual_style, copy_style, design_tokens, deck_theme, report_theme)
           VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb) RETURNING id`,
          [
            payload.name || "Pharmacy Time",
            payload.slug || BRAND_SLUG,
            payload.status || "active",
            JSON.stringify(payload.identity || {}),
            JSON.stringify(payload.tone || {}),
            JSON.stringify(payload.visual_style || {}),
            JSON.stringify(payload.copy_style || {}),
            JSON.stringify(payload.design_tokens || {}),
            JSON.stringify(payload.deck_theme || {}),
            JSON.stringify(payload.report_theme || {}),
          ]
        );
        brandId = ins.rows[0].id;
        console.log("  Created Pharmacy Time brand from scripts/brands/pharmacytime-com.brand.json:", brandId);
      } else {
        console.error("Pharmacy Time brand (pharmacytime-com) not found. Create it first: node scripts/create-brand-from-json.mjs scripts/brands/pharmacytime-com.brand.json (with CONTROL_PLANE_API), or run npm run airtable:import:pharmacy.");
        process.exit(1);
      }
    }

    await client.query("BEGIN");
    const storeExtRef = WOO_URL;
    await client.query(
      `INSERT INTO stores (scope_key, channel, external_ref, name, brand_profile_id) VALUES ($1, 'woocommerce', $2, 'Pharmacy Time', $3)
       ON CONFLICT (channel, external_ref) DO UPDATE SET name = EXCLUDED.name, brand_profile_id = COALESCE(EXCLUDED.brand_profile_id, stores.brand_profile_id)`,
      [SCOPE_KEY, storeExtRef, brandId]
    );
    const storeRow = await client.query("SELECT id FROM stores WHERE channel = 'woocommerce' AND external_ref = $1", [storeExtRef]);
    const storeId = storeRow.rows[0]?.id;
    if (!storeId) throw new Error("Store insert/select failed — no store id.");

    await client.query(
      `INSERT INTO raw_woocommerce_snapshots (scope_key, store_url, entity_type, payload) VALUES ($1, $2, 'products', $3)`,
      [SCOPE_KEY, WOO_URL, JSON.stringify({ products: productsWithVariations, fetched_at: new Date().toISOString() })]
    );
    await client.query(
      `INSERT INTO raw_woocommerce_snapshots (scope_key, store_url, entity_type, payload) VALUES ($1, $2, 'categories', $3)`,
      [SCOPE_KEY, WOO_URL, JSON.stringify({ categories, fetched_at: new Date().toISOString() })]
    );
    console.log("  Raw snapshots stored.");
    await client.query("COMMIT");

    await client.query("BEGIN");
    const storeRowAgain = await client.query("SELECT id FROM stores WHERE channel = 'woocommerce' AND external_ref = $1", [storeExtRef]);
    let storeIdForProducts = storeRowAgain.rows[0]?.id;
    if (!storeIdForProducts) {
      await client.query("ROLLBACK");
      throw new Error("Store not found after commit. Check that DATABASE_URL is the same and stores row was committed.");
    }

    const wcKeyToIds = new Map();
    for (const p of productsWithVariations) {
      const productKey = getMeta(p, "_product_key");
      if (productKey && (!p.variations || !p.variations.length)) {
        wcKeyToIds.set(productKey, { productId: p.id, variationId: null, permalink: p.permalink });
      }
      for (const v of p.variations || []) {
        const key = wcVariationKey(p, v);
        if (key) wcKeyToIds.set(key, { productId: p.id, variationId: v.id, permalink: v.permalink || p.permalink });
      }
    }

    let catalogRows = { rows: [] };
    try {
      catalogRows = await client.query(
        `SELECT id, external_ref, metadata_json FROM brand_catalog_products WHERE brand_profile_id = $1 AND source_system = 'airtable'`,
        [brandId]
      );
    } catch (e) {
      if (e.code === "42P01") {
        console.warn("  brand_catalog_products table missing — run Airtable import (npm run airtable:import:pharmacy) for catalog cross-reference.");
        await client.query("ROLLBACK");
        await client.query("BEGIN");
        const storeRowAgain2 = await client.query("SELECT id FROM stores WHERE channel = 'woocommerce' AND external_ref = $1", [storeExtRef]);
        storeIdForProducts = storeRowAgain2.rows[0]?.id;
        if (!storeIdForProducts) throw new Error("Store not found after rollback.");
      } else throw e;
    }

    const wcKeys = [...wcKeyToIds.keys()];
    const catalogKeyToWc = new Map();
    for (const key of wcKeys) {
      const normalized = key.toLowerCase().replace(/\s/g, "");
      catalogKeyToWc.set(normalized, wcKeyToIds.get(key));
    }

    let linked = 0;
    for (const row of catalogRows.rows) {
      const key = catalogVariationKey(row.metadata_json);
      if (!key) continue;
      const normalized = key.toLowerCase().replace(/\s/g, "");
      let wc = wcKeyToIds.get(key) || catalogKeyToWc.get(normalized);
      if (!wc && key.includes("|")) {
        const parts = key.split("|");
        const twoPart = parts.slice(0, 2).join("|");
        wc = wcKeyToIds.get(twoPart) || catalogKeyToWc.get(twoPart.toLowerCase());
        if (!wc && parts.length >= 3) {
          const threePart = parts.slice(0, 3).join("|");
          wc = wcKeyToIds.get(threePart) || catalogKeyToWc.get(threePart.toLowerCase());
        }
      }
      if (!wc) continue;
      const nextMeta = { ...(row.metadata_json || {}), woocommerce_product_id: wc.productId, woocommerce_variation_id: wc.variationId, woocommerce_permalink: wc.permalink };
      try {
        await client.query(
          `UPDATE brand_catalog_products SET metadata_json = $2, updated_at = now() WHERE id = $1`,
          [row.id, JSON.stringify(nextMeta)]
        );
        linked++;
      } catch (e) {
        console.warn("  Catalog update skip:", row.id, e.message);
      }
    }
    console.log("  Catalog cross-reference: linked", linked, "of", catalogRows.rows.length);

    let productsUpserted = 0;
    let firstErr = null;
    for (const p of products) {
      try {
        const nameVal = p.name != null && typeof p.name === "string" ? p.name : "";
        await client.query(
          `INSERT INTO products (store_id, external_ref, name) VALUES ($1::uuid, $2::text, $3::text)
           ON CONFLICT (store_id, external_ref) DO UPDATE SET name = EXCLUDED.name`,
          [storeIdForProducts, String(p.id), nameVal]
        );
        productsUpserted++;
        const priceCents = p.price ? Math.round(parseFloat(p.price) * 100) : null;
        const imageUrl = (p.images && p.images[0] && p.images[0].src) || null;
        const desc = (p.short_description || p.description || "").slice(0, 10000);
        await client.query(
          `UPDATE products SET price_cents = COALESCE($4, price_cents), currency = COALESCE($5, currency), image_url = COALESCE($6, image_url), description = COALESCE($7, description) WHERE store_id = $1 AND external_ref = $2`,
          [storeIdForProducts, String(p.id), null, priceCents, p.currency || "USD", imageUrl, desc || null]
        );
      } catch (e) {
        if (!firstErr) {
          firstErr = e;
          console.error("  First product insert failed (productId=%s):", p.id, e.message);
        }
        console.warn("  Products row skip:", p.id, e.message);
      }
    }
    console.log("  Commerce products (stores):", productsUpserted);
    await client.query("COMMIT");

    console.log("\nWooCommerce sync succeeded.");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
