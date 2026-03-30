/**
 * WooCommerce REST connector at brand level: store URL + encrypted consumer key/secret.
 * Encryption: WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY, or falls back to SHOPIFY_CONNECTOR_ENCRYPTION_KEY.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { PoolClient } from "pg";

function getEncryptionKey(): Buffer {
  const raw =
    process.env.WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY?.trim() ||
    process.env.SHOPIFY_CONNECTOR_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "WOO_COMMERCE_CONNECTOR_ENCRYPTION_KEY or SHOPIFY_CONNECTOR_ENCRYPTION_KEY is required to encrypt or decrypt WooCommerce API credentials (set on the Control Plane API service).",
    );
  }
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length >= 32) return Buffer.from(raw.slice(0, 32), "utf8");
  return Buffer.from(scryptSync(raw, "woocommerce-brand-connector-salt", 32));
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

export type WooCommerceCredentialsInput = {
  store_url: string;
  consumer_key: string;
  consumer_secret: string;
};

function normalizeStoreUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

export async function saveWooCommerceCredentialsForBrand(
  client: PoolClient,
  brandId: string,
  input: WooCommerceCredentialsInput,
): Promise<void> {
  const store_url = normalizeStoreUrl(input.store_url);
  const consumer_key = input.consumer_key.trim();
  const consumer_secret = input.consumer_secret.trim();
  if (!store_url || !/^https?:\/\//i.test(store_url)) {
    throw new Error("store_url must be a full http(s) URL");
  }
  if (!consumer_key || !consumer_secret) {
    throw new Error("consumer_key and consumer_secret are required");
  }
  const encK = encrypt(consumer_key);
  const encS = encrypt(consumer_secret);
  await client.query(
    `INSERT INTO brand_woocommerce_credentials (brand_profile_id, store_url, encrypted_consumer_key, encrypted_consumer_secret, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (brand_profile_id) DO UPDATE SET
       store_url = EXCLUDED.store_url,
       encrypted_consumer_key = EXCLUDED.encrypted_consumer_key,
       encrypted_consumer_secret = EXCLUDED.encrypted_consumer_secret,
       updated_at = now()`,
    [brandId, store_url, encK, encS],
  );
}

export async function deleteWooCommerceCredentialsForBrand(client: PoolClient, brandId: string): Promise<void> {
  await client.query("DELETE FROM brand_woocommerce_credentials WHERE brand_profile_id = $1", [brandId]);
}

export async function hasWooCommerceCredentialsForBrand(client: PoolClient, brandId: string): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM brand_woocommerce_credentials WHERE brand_profile_id = $1", [brandId]);
  return (r.rowCount ?? 0) > 0;
}

/** Public metadata (no secrets). */
export async function getWooCommerceStoreUrlForBrand(
  client: PoolClient,
  brandId: string,
): Promise<{ store_url: string } | null> {
  const r = await client.query<{ store_url: string }>(
    "SELECT store_url FROM brand_woocommerce_credentials WHERE brand_profile_id = $1",
    [brandId],
  );
  const row = r.rows[0];
  return row ? { store_url: row.store_url } : null;
}

/** Decrypted credentials for server-side WooCommerce API calls only. */
export async function getWooCommerceCredentialsForBrand(
  client: PoolClient,
  brandId: string,
): Promise<{ store_url: string; consumer_key: string; consumer_secret: string } | null> {
  const r = await client.query<{
    store_url: string;
    encrypted_consumer_key: string;
    encrypted_consumer_secret: string;
  }>(
    "SELECT store_url, encrypted_consumer_key, encrypted_consumer_secret FROM brand_woocommerce_credentials WHERE brand_profile_id = $1",
    [brandId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    store_url: row.store_url,
    consumer_key: decrypt(row.encrypted_consumer_key),
    consumer_secret: decrypt(row.encrypted_consumer_secret),
  };
}
