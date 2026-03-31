/**
 * Shopify connector at brand level: store shop_domain plus either
 * (1) client_id + encrypted client_secret → OAuth client_credentials exchange, or
 * (2) encrypted Admin API access token (shpat_...) for custom apps where client_credentials is not permitted.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { PoolClient } from "pg";

/** 32-byte key from env (hex or raw). Matches Woo: either connector env, same secret if one key for both. */
function getEncryptionKey(): Buffer {
  const raw =
    process.env.SHOPIFY_CONNECTOR_ENCRYPTION_KEY?.trim() ||
    process.env.WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "SHOPIFY_CONNECTOR_ENCRYPTION_KEY (or WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY with the same secret) is required to encrypt or decrypt Shopify credentials for brands — set on the API and on job runners that read tokens.",
    );
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length >= 32) return Buffer.from(raw.slice(0, 32), "utf8");
  return Buffer.from(scryptSync(raw, "shopify-brand-connector-salt", 32));
}

function encrypt(plain: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(encrypted, "base64url");
  const iv = buf.subarray(0, 16);
  const tag = buf.subarray(16, 32);
  const data = buf.subarray(32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final("utf8");
}

export type ShopifyCredentialsInput = {
  shop_domain: string;
  scopes?: string[];
  /** Partner / Dev Dashboard app: OAuth client credentials. */
  client_id?: string;
  client_secret?: string;
  /** Custom app (Settings → Develop apps): static Admin API token (shpat_...). */
  admin_access_token?: string;
};

/** Save or update Shopify credentials for a brand. Secrets/tokens encrypted at rest. */
export async function saveShopifyCredentialsForBrand(
  client: PoolClient,
  brandId: string,
  input: ShopifyCredentialsInput
): Promise<void> {
  const shop_domain = input.shop_domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!shop_domain) throw new Error("shop_domain is required");
  const scopes = input.scopes ?? [];

  const adminTok = input.admin_access_token?.trim();
  const cid = input.client_id?.trim();
  const csec = input.client_secret?.trim();

  if (adminTok) {
    const encAdmin = encrypt(adminTok);
    await client.query(
      `INSERT INTO brand_shopify_credentials (brand_profile_id, shop_domain, client_id, encrypted_client_secret, encrypted_admin_access_token, scopes, updated_at)
       VALUES ($1, $2, NULL, NULL, $3, $4::text[], now())
       ON CONFLICT (brand_profile_id) DO UPDATE SET
         shop_domain = EXCLUDED.shop_domain,
         client_id = NULL,
         encrypted_client_secret = NULL,
         encrypted_admin_access_token = EXCLUDED.encrypted_admin_access_token,
         scopes = EXCLUDED.scopes,
         updated_at = now()`,
      [brandId, shop_domain, encAdmin, scopes]
    );
    return;
  }

  if (!cid || !csec) {
    throw new Error(
      "Provide either admin_access_token (custom app / shpat_) or both client_id and client_secret (Partner OAuth app).",
    );
  }
  const encrypted = encrypt(csec);
  await client.query(
    `INSERT INTO brand_shopify_credentials (brand_profile_id, shop_domain, client_id, encrypted_client_secret, encrypted_admin_access_token, scopes, updated_at)
     VALUES ($1, $2, $3, $4, NULL, $5::text[], now())
     ON CONFLICT (brand_profile_id) DO UPDATE SET
       shop_domain = EXCLUDED.shop_domain,
       client_id = EXCLUDED.client_id,
       encrypted_client_secret = EXCLUDED.encrypted_client_secret,
       encrypted_admin_access_token = NULL,
       scopes = EXCLUDED.scopes,
       updated_at = now()`,
    [brandId, shop_domain, cid, encrypted, scopes]
  );
}

/** Remove Shopify credentials for a brand. */
export async function deleteShopifyCredentialsForBrand(client: PoolClient, brandId: string): Promise<void> {
  await client.query("DELETE FROM brand_shopify_credentials WHERE brand_profile_id = $1", [brandId]);
}

/** Check if brand has Shopify credentials. */
export async function hasShopifyCredentialsForBrand(client: PoolClient, brandId: string): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM brand_shopify_credentials WHERE brand_profile_id = $1", [brandId]);
  return (r.rowCount ?? 0) > 0;
}

/** Get shop_domain for brand (no secret). client_id is null when using Admin API token only. */
export async function getShopifyShopForBrand(
  client: PoolClient,
  brandId: string
): Promise<{ shop_domain: string; client_id: string | null } | null> {
  const r = await client.query<{ shop_domain: string; client_id: string | null }>(
    "SELECT shop_domain, client_id FROM brand_shopify_credentials WHERE brand_profile_id = $1",
    [brandId]
  );
  const row = r.rows[0];
  return row ? { shop_domain: row.shop_domain, client_id: row.client_id } : null;
}

function explainShopifyTokenError(status: number, text: string): string {
  const lower = text.toLowerCase();
  const isShopNotPermitted =
    lower.includes("shop_not_permitted") ||
    lower.includes("client credentials cannot be performed on this shop") ||
    /oauth\s+error[^a-z0-9]*shop[_\s-]*not[_\s-]*permitted/i.test(text);
  if (isShopNotPermitted) {
    return (
      `Shopify OAuth client_credentials is not allowed on this shop (shop_not_permitted). ` +
      `Store-created custom apps must use the Admin API access token instead: ` +
      `disconnect Shopify on the brand, choose “Custom app (Admin API token)”, and paste the shpat_ token from Shopify Admin → Settings → Apps and sales channels → Develop apps → your app → API credentials.`
    );
  }
  const snippet = text.replace(/\s+/g, " ").trim().slice(0, 320);
  return `Shopify token exchange failed (${status}): ${snippet || "(empty response body)"}`;
}

/**
 * Returns a Bearer token for Shopify Admin API (GraphQL/REST).
 * Uses stored shpat_ token when present; otherwise client_credentials exchange.
 */
export async function getShopifyAccessTokenForBrand(
  client: PoolClient,
  brandId: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const row = await client.query<{
    shop_domain: string;
    client_id: string | null;
    encrypted_client_secret: string | null;
    encrypted_admin_access_token: string | null;
  }>(
    "SELECT shop_domain, client_id, encrypted_client_secret, encrypted_admin_access_token FROM brand_shopify_credentials WHERE brand_profile_id = $1",
    [brandId]
  );
  const r = row.rows[0];
  if (!r) return null;

  if (r.encrypted_admin_access_token?.trim()) {
    const access_token = decrypt(r.encrypted_admin_access_token);
    if (!access_token) throw new Error("Shopify Admin API token could not be decrypted");
    return { access_token, expires_in: 86400 };
  }

  if (!r.client_id?.trim() || !r.encrypted_client_secret?.trim()) {
    throw new Error("Shopify credentials incomplete: add OAuth client id/secret or Admin API token.");
  }

  const shop = r.shop_domain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const client_secret = decrypt(r.encrypted_client_secret);
  const url = `https://${shop}/admin/oauth/access_token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: r.client_id,
    client_secret,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(explainShopifyTokenError(res.status, text));
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const access_token = data.access_token;
  const expires_in = typeof data.expires_in === "number" ? data.expires_in : 86400;
  if (!access_token) throw new Error("Shopify did not return access_token");
  return { access_token, expires_in };
}
