/**
 * Fetch monthly search volume for keywords via Google Ads API (Keyword Planner).
 * Requires env: GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN,
 * GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN.
 * Customer ID should be the numeric ID without dashes (e.g. 1234567890).
 */

const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const API_VERSION = "v19";
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}`;
const BATCH_SIZE = 20;
const US_GEO = "geoTargetConstants/2840";
const EN_LANGUAGE = "languageConstants/1000";

export type KeywordVolumeResult = { keyword: string; monthly_search_volume: number };

function isConfigured(): boolean {
  return !!(
    process.env.GOOGLE_ADS_CLIENT_ID &&
    process.env.GOOGLE_ADS_CLIENT_SECRET &&
    process.env.GOOGLE_ADS_REFRESH_TOKEN &&
    process.env.GOOGLE_ADS_CUSTOMER_ID &&
    process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  );
}

function explainGoogleAdsAuthFailure(raw: string): string {
  const t = raw.toLowerCase();
  if (t.includes("invalid_client")) {
    return (
      "Google Ads OAuth invalid_client: the Client ID and Client Secret on the control plane do not match a valid Google Cloud OAuth client, " +
      "or the client secret was rotated. Set GOOGLE_ADS_CLIENT_ID and GOOGLE_ADS_CLIENT_SECRET where the API runs (e.g. Render), " +
      "using the same OAuth client that was used to create GOOGLE_ADS_REFRESH_TOKEN. If you reset the secret in Google Cloud, generate a new refresh token."
    );
  }
  if (t.includes("invalid_grant")) {
    return (
      "Google Ads OAuth invalid_grant: refresh token expired or revoked. Generate a new refresh token for the Ads API scope and update GOOGLE_ADS_REFRESH_TOKEN."
    );
  }
  return raw.slice(0, 500);
}

async function getAccessToken(): Promise<string> {
  const { OAuth2Client } = await import("google-auth-library");
  const client = new OAuth2Client(
    process.env.GOOGLE_ADS_CLIENT_ID,
    process.env.GOOGLE_ADS_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  );
  client.setCredentials({ refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN });
  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new Error("Failed to get Google Ads access token");
    return credentials.access_token;
  } catch (e) {
    const raw =
      (e as { response?: { data?: unknown } })?.response?.data != null
        ? JSON.stringify((e as { response: { data: unknown } }).response.data)
        : ((e as Error).message ?? String(e));
    throw new Error(explainGoogleAdsAuthFailure(raw));
  }
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
      error: "Google Ads not configured. Set GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN, GOOGLE_ADS_CUSTOMER_ID, GOOGLE_ADS_DEVELOPER_TOKEN.",
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
