/**
 * Fetch monthly search volume for keywords via Google Ads API (Keyword Planner).
 * Requires: GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN,
 * plus OAuth client credentials from either:
 * - GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET, or
 * - GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET (fallback if Ads-specific vars are unset).
 * The refresh token must have been issued for the same OAuth client (and include the Ads API scope).
 * Customer ID should be the numeric ID without dashes (e.g. 1234567890).
 */

const API_VERSION = "v19";
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;
const BATCH_SIZE = 20;
const US_GEO = "geoTargetConstants/2840";
const EN_LANGUAGE = "languageConstants/1000";

export type KeywordVolumeResult = { keyword: string; monthly_search_volume: number };

/**
 * Ordered OAuth client id+secret pairs to try for refreshing GOOGLE_ADS_REFRESH_TOKEN.
 * 1) GOOGLE_ADS_CLIENT_* first (when set).
 * 2) GOOGLE_OAUTH_CLIENT_* second (deduped if identical to pair #1).
 * If Render has a stale/wrong Ads-specific client but correct GSC/GA4 OAuth vars, invalid_client on #1 still allows #2.
 */
function buildGoogleAdsCredentialAttempts(): { clientId: string; clientSecret: string }[] {
  const seen = new Set<string>();
  const out: { clientId: string; clientSecret: string }[] = [];
  const pushPair = (clientId: string, clientSecret: string) => {
    const k = `${clientId}\0${clientSecret}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ clientId, clientSecret });
  };
  const adsId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const adsSec = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const oauthId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const oauthSec = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (adsId && adsSec) pushPair(adsId, adsSec);
  if (oauthId && oauthSec) pushPair(oauthId, oauthSec);
  return out;
}

function isConfigured(): boolean {
  return !!(
    buildGoogleAdsCredentialAttempts().length > 0 &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );
}

function explainGoogleAdsAuthFailure(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("invalid_client")) {
    return (
      "Google Ads OAuth invalid_client: none of the configured OAuth client id+secret pairs matched the client that issued GOOGLE_ADS_REFRESH_TOKEN. " +
      "Fix: in Render, delete or correct GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET (wrong pair often blocks the good one), " +
      "ensure GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET match the same Web client used to mint the refresh token, " +
      "trim values (no trailing newlines), and regenerate GOOGLE_ADS_REFRESH_TOKEN after any client secret rotation."
    );
  }
  if (t.includes("invalid_grant")) {
    return (
      "Google Ads OAuth invalid_grant: refresh token expired or revoked. Generate a new refresh token for the Ads API scope and update GOOGLE_ADS_REFRESH_TOKEN."
    );
  }
  return raw.slice(0, 500);
}

function isInvalidClientError(raw: string): boolean {
  return raw.toLowerCase().includes("invalid_client");
}

async function getAccessToken(): Promise<string> {
  const { OAuth2Client } = await import("google-auth-library");
  const attempts = buildGoogleAdsCredentialAttempts();
  if (attempts.length === 0) {
    throw new Error(
      "Google Ads OAuth: set GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET and/or GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET.",
    );
  }
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!refreshToken?.trim()) throw new Error("GOOGLE_ADS_REFRESH_TOKEN is missing");

  for (let i = 0; i < attempts.length; i++) {
    const { clientId, clientSecret } = attempts[i];
    const client = new OAuth2Client(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob");
    client.setCredentials({ refresh_token: refreshToken.trim() });
    try {
      const { credentials } = await client.refreshAccessToken();
      if (!credentials.access_token) throw new Error("Failed to get Google Ads access token");
      return credentials.access_token;
    } catch (e) {
      const raw =
        (e as { response?: { data?: unknown } })?.response?.data != null
          ? JSON.stringify((e as { response: { data: unknown } }).response.data)
          : ((e as Error).message ?? String(e));
      if (isInvalidClientError(raw) && i < attempts.length - 1) continue;
      throw new Error(explainGoogleAdsAuthFailure(raw));
    }
  }
  throw new Error("Google Ads OAuth: no credential attempts succeeded.");
}

/** Customer ID must be digits only (no dashes). */
function normalizeCustomerId(customerId: string): string {
  return customerId.replace(/-/g, "");
}

/**
 * Fetch monthly search volume for the given keywords using GenerateKeywordIdeas.
 * Returns one entry per requested keyword when the API returns a match (by text);
 * keywords not found get volume 0.
 */
export async function fetchKeywordVolumes(keywords: string[]): Promise<{
  volumes: KeywordVolumeResult[];
  error?: string;
}> {
  if (!isConfigured()) {
    return {
      volumes: keywords.map((k) => ({ keyword: k, monthly_search_volume: 0 })),
      error:
        "Google Ads not configured. Set GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN, " +
        "and either (GOOGLE_ADS_CLIENT_ID + GOOGLE_ADS_CLIENT_SECRET) or (GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET).",
    };
  }
  const unique = [...new Set(keywords)].filter((k) => k && k.trim().length > 0);
  if (unique.length === 0) return { volumes: [] };

  try {
    const accessToken = await getAccessToken();
    const customerId = normalizeCustomerId(process.env.GOOGLE_ADS_CUSTOMER_ID!);
    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN!;

    const volumeByKeyword = new Map<string, number>();
    for (let i = 0; i < unique.length; i += BATCH_SIZE) {
      const batch = unique.slice(i, i + BATCH_SIZE);
      const url = `${BASE_URL}/customers/${customerId}:generateKeywordIdeas`;
      const body = {
        seed: { keywordSeed: { keywords: batch } },
        language: EN_LANGUAGE,
        geoTargetConstants: [US_GEO],
        keywordPlanNetwork: "GOOGLE_SEARCH",
        includeAdultKeywords: false,
        pageSize: Math.min(100, batch.length * 5),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        return {
          volumes: keywords.map((k) => ({ keyword: k, monthly_search_volume: 0 })),
          error: `Google Ads API error: ${res.status} ${text.slice(0, 300)}`,
        };
      }
      const data = (await res.json()) as {
        results?: Array<{
          text?: string;
          keywordIdeaMetrics?: { avgMonthlySearches?: number };
        }>;
      };
      for (const r of data.results ?? []) {
        const text = (r.text ?? "").trim();
        const vol = Number(r.keywordIdeaMetrics?.avgMonthlySearches ?? 0);
        if (text) volumeByKeyword.set(text.toLowerCase(), vol);
      }
    }

    const volumes: KeywordVolumeResult[] = unique.map((keyword) => ({
      keyword,
      monthly_search_volume: volumeByKeyword.get(keyword.toLowerCase()) ?? 0,
    }));
    return { volumes };
  } catch (e) {
    const message = (e as Error).message ?? String(e);
    return {
      volumes: keywords.map((k) => ({ keyword: k, monthly_search_volume: 0 })),
      error: message,
    };
  }
}
