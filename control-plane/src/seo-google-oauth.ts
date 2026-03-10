/**
 * OAuth 2.0 for SEO: Connect Google (GSC/GA4) per brand (or legacy per initiative).
 * Credentials stored in brand_google_credentials (by brand_profile_id) or initiative_google_credentials (legacy).
 * Runner gets token for an initiative via initiative.brand_profile_id → brand credentials, or initiative credentials.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import type { PoolClient } from "pg";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

let _OAuth2Client: typeof import("google-auth-library").OAuth2Client | null = null;
async function getOAuth2Constructor(): Promise<typeof import("google-auth-library").OAuth2Client> {
  if (!_OAuth2Client) {
    const { OAuth2Client } = await import("google-auth-library");
    _OAuth2Client = OAuth2Client;
  }
  return _OAuth2Client;
}

async function getOAuthClient(redirectUri: string): Promise<InstanceType<import("google-auth-library").OAuth2Client>> {
  const OAuth2Client = await getOAuth2Constructor();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required for OAuth");
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

/** 32-byte key from env (hex or raw). */
function getEncryptionKey(): Buffer {
  const raw = process.env.GOOGLE_OAUTH_ENCRYPTION_KEY;
  if (!raw) throw new Error("GOOGLE_OAUTH_ENCRYPTION_KEY is required to store refresh tokens");
  if (raw.length === 64 && /^[0-9a-fA-F]+$/.test(raw)) return Buffer.from(raw, "hex");
  if (raw.length >= 32) return Buffer.from(raw.slice(0, 32), "utf8");
  return Buffer.from(scryptSync(raw, "seo-google-oauth-salt", 32));
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

/** State: brand_id (preferred) or initiative_id (legacy), plus redirect_uri. */
export type OAuthState = { brand_id?: string; initiative_id?: string; redirect_uri: string };

export function encodeState(payload: OAuthState): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeState(state: string): OAuthState {
  const json = Buffer.from(state, "base64url").toString("utf8");
  const o = JSON.parse(json) as OAuthState;
  if (!o?.redirect_uri) throw new Error("Invalid state: missing redirect_uri");
  if (!o.brand_id && !o.initiative_id) throw new Error("Invalid state: need brand_id or initiative_id");
  return { brand_id: o.brand_id, initiative_id: o.initiative_id, redirect_uri: o.redirect_uri };
}

/**
 * Return the URL to send the user to for Google consent.
 * Pass either brandId (preferred: store per brand) or initiativeId (legacy: store per initiative).
 */
export async function getGoogleAuthUrl(
  redirectUriForCallback: string,
  redirectUriAfter: string,
  options: { brand_id?: string; initiative_id?: string },
): Promise<string> {
  const { brand_id, initiative_id } = options;
  if (!brand_id && !initiative_id) throw new Error("Either brand_id or initiative_id is required");
  const client = await getOAuthClient(redirectUriForCallback);
  const state = encodeState({ brand_id, initiative_id, redirect_uri: redirectUriAfter });
  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "select_account consent",
    scope: SCOPES,
    state,
  });
}

/**
 * Exchange code for tokens, store encrypted refresh_token by brand_id or initiative_id, return redirect_uri.
 */
export async function handleOAuthCallback(
  client: PoolClient,
  code: string,
  state: string,
  callbackRedirectUri: string,
): Promise<{ redirect_uri: string; error?: string }> {
  const { brand_id, initiative_id, redirect_uri } = decodeState(state);
  const oauth = await getOAuthClient(callbackRedirectUri);
  const { tokens } = await oauth.getToken(code);
  const refresh = tokens.refresh_token;
  if (!refresh) return { redirect_uri, error: "No refresh_token returned by Google (user may have already granted; try revoking app access and reconnecting)." };

  const encrypted = encrypt(refresh);
  if (brand_id) {
    await client.query(
      `INSERT INTO brand_google_credentials (brand_profile_id, encrypted_refresh_token, scopes, updated_at)
       VALUES ($1, $2, $3::text[], now())
       ON CONFLICT (brand_profile_id) DO UPDATE SET encrypted_refresh_token = EXCLUDED.encrypted_refresh_token, scopes = EXCLUDED.scopes, updated_at = now()`,
      [brand_id, encrypted, SCOPES],
    );
  } else if (initiative_id) {
    await client.query(
      `INSERT INTO initiative_google_credentials (initiative_id, encrypted_refresh_token, scopes, updated_at)
       VALUES ($1, $2, $3::text[], now())
       ON CONFLICT (initiative_id) DO UPDATE SET encrypted_refresh_token = EXCLUDED.encrypted_refresh_token, scopes = EXCLUDED.scopes, updated_at = now()`,
      [initiative_id, encrypted, SCOPES],
    );
  }
  return { redirect_uri };
}

/**
 * Get a short-lived access_token for the initiative (for the runner). Resolves via initiative.brand_profile_id → brand credentials, else initiative credentials (legacy).
 */
export async function getAccessTokenForInitiative(client: PoolClient, initiativeId: string): Promise<{ access_token: string; expires_in: number } | null> {
  const initRow = await client.query<{ brand_profile_id: string | null }>("SELECT brand_profile_id FROM initiatives WHERE id = $1", [initiativeId]);
  const brandId = initRow.rows[0]?.brand_profile_id ?? null;

  let encrypted: string | null = null;
  if (brandId) {
    const br = await client.query<{ encrypted_refresh_token: string }>(
      "SELECT encrypted_refresh_token FROM brand_google_credentials WHERE brand_profile_id = $1",
      [brandId],
    );
    encrypted = br.rows[0]?.encrypted_refresh_token ?? null;
  }
  if (!encrypted) {
    const ir = await client.query<{ encrypted_refresh_token: string }>(
      "SELECT encrypted_refresh_token FROM initiative_google_credentials WHERE initiative_id = $1",
      [initiativeId],
    );
    encrypted = ir.rows[0]?.encrypted_refresh_token ?? null;
  }
  if (!encrypted) return null;

  const redirectUri = (process.env.CONTROL_PLANE_URL ?? "http://localhost:3001").replace(/\/$/, "") + "/v1/seo/google/callback";
  const oauth = await getOAuthClient(redirectUri);
  const refresh = decrypt(encrypted);
  oauth.setCredentials({ refresh_token: refresh });
  const { credentials } = await oauth.refreshAccessToken();
  const access_token = credentials.access_token;
  const expires_in = credentials.expiry_date ? Math.max(0, Math.floor((credentials.expiry_date - Date.now()) / 1000)) : 3600;
  if (!access_token) return null;
  return { access_token, expires_in };
}

/** Check if initiative has Google credentials (via brand or legacy initiative row). */
export async function hasGoogleCredentials(client: PoolClient, initiativeId: string): Promise<boolean> {
  const initRow = await client.query<{ brand_profile_id: string | null }>("SELECT brand_profile_id FROM initiatives WHERE id = $1", [initiativeId]);
  const brandId = initRow.rows[0]?.brand_profile_id ?? null;
  if (brandId) {
    const r = await client.query("SELECT 1 FROM brand_google_credentials WHERE brand_profile_id = $1", [brandId]);
    if (r.rows.length > 0) return true;
  }
  const r = await client.query("SELECT 1 FROM initiative_google_credentials WHERE initiative_id = $1", [initiativeId]);
  return r.rows.length > 0;
}

/** Remove stored credentials for the initiative (legacy only; brand credentials are removed via brand endpoint). */
export async function deleteGoogleCredentials(client: PoolClient, initiativeId: string): Promise<void> {
  await client.query("DELETE FROM initiative_google_credentials WHERE initiative_id = $1", [initiativeId]);
}

/** Check if brand has Google credentials. */
export async function hasGoogleCredentialsForBrand(client: PoolClient, brandId: string): Promise<boolean> {
  const r = await client.query("SELECT 1 FROM brand_google_credentials WHERE brand_profile_id = $1", [brandId]);
  return r.rows.length > 0;
}

/** Remove stored credentials for the brand. */
export async function deleteGoogleCredentialsForBrand(client: PoolClient, brandId: string): Promise<void> {
  await client.query("DELETE FROM brand_google_credentials WHERE brand_profile_id = $1", [brandId]);
}
