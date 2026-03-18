/**
 * Shopify connector at brand level: store shop_domain + client_id + encrypted client_secret.
 * Exchange for short-lived Admin API tokens via client credentials grant.
 * Used by SEO migration, MCP, and other tools that need Admin API under the brand.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { PoolClient } from "pg";

const SHOPIFY_TOKEN_PATH = "/admin/oauth/access_token";

/** 32-byte key from env (hex or raw). */
function getEncryptionKey(): Buffer {
  const raw = process.env.SHOPIFY_CONNECTOR_ENCRYPTION_KEY;
  if (!raw) throw new Error("SHOPIFY_CONNECTOR_ENCRYPTION_KEY is required to store client secrets");
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
  client_id: string;
  client_secret: string;
  scopes?: string[];
};

/** Save or update Shopify credentials for a brand. Client secret is encrypted at rest. */
export async function saveShopifyCredentialsForBrand(
  client: PoolClient,
  brandId: string,
  input: ShopifyCredentialsInput
): Promise<void> {
  const shop_domain = input.shop_domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (!shop_domain) throw new Error("shop_domain is required");
  if (!input.client_id?.trim()) throw new Error("client_id is required");
  if (!input.client_secret?.trim()) throw new Error("client_secret is required");
  const encrypted = encrypt(input.client_secret.trim());
  const scopes = input.scopes ?? [];
  await client.query(
    `INSERT INTO brand_shopify_credentials (brand_profile_id, shop_domain, client_id, encrypted_client_secret, scopes, updated_at)
     VALUES ($1, $2, $3, $4, $5::text[], now())
     ON CONFLICT (brand_profile_id) DO UPDATE SET
       shop_domain = EXCLUDED.shop_domain,
       client_id = EXCLUDED.client_id,
       encrypted_client_secret = EXCLUDED.encrypted_client_secret,
       scopes = EXCLUDED.scopes,
       updated_at = now()`,
    [brandId, shop_domain, input.client_id.trim(), encrypted, scopes]
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

/** Get shop_domain for brand (no secret). */
export async function getShopifyShopForBrand(
  client: PoolClient,
  brandId: string
): Promise<{ shop_domain: string; client_id: string } | null> {
  const r = await client.query<{ shop_domain: string; client_id: string }>(
    "SELECT shop_domain, client_id FROM brand_shopify_credentials WHERE brand_profile_id = $1",
    [brandId]
  );
  const row = r.rows[0];
  return row ? { shop_domain: row.shop_domain, client_id: row.client_id } : null;
}

/** Fetch short-lived access token via Shopify client credentials grant. Token expires in 24h. */
export async function getShopifyAccessTokenForBrand(
  client: PoolClient,
  brandId: string
): Promise<{ access_token: string; expires_in: number } | null> {
  const row = await client.query<{ shop_domain: string; client_id: string; encrypted_client_secret: string }>(
    "SELECT shop_domain, client_id, encrypted_client_secret FROM brand_shopify_credentials WHERE brand_profile_id = $1",
    [brandId]
  );
  const r = row.rows[0];
  if (!r) return null;
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
    throw new Error(`Shopify token exchange failed (${res.status}): ${text}`);
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  const access_token = data.access_token;
  const expires_in = typeof data.expires_in === "number" ? data.expires_in : 86400;
  if (!access_token) throw new Error("Shopify did not return access_token");
  return { access_token, expires_in };
}
