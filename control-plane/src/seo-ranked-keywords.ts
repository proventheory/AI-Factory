/**
 * DataForSEO Labs: ranked keywords per URL with DB cache.
 * Env: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD.
 * Cache TTL: 7 days (DataForSEO updates weekly).
 */

import type { PoolClient } from "pg";
import { pool } from "./db.js";

const API_URL = "https://api.dataforseo.com/v3/dataforseo_labs/google/ranked_keywords/live";
const CACHE_TTL_DAYS = 7;
const DEFAULT_LIMIT_PER_URL = 200;

export type RankedKeywordItem = {
  keyword: string;
  monthly_search_volume?: number;
  position?: number;
};

export type RankedKeywordsByUrl = {
  [url: string]: { keywords: RankedKeywordItem[]; cached: boolean };
};

function isConfigured(): boolean {
  return !!(process.env.DATAFORSEO_LOGIN && process.env.DATAFORSEO_PASSWORD);
}

/** Normalize URL for cache key: full URL with https, no trailing slash, lowercase host+path. */
export function normalizeUrlForCache(url: string): string {
  const raw = (url || "").trim().toLowerCase();
  if (!raw) return "";
  try {
    const withScheme = raw.startsWith("http") ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    const path = (u.pathname || "/").replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`;
  } catch {
    return raw;
  }
}

/** Get cached result if present and within TTL. */
export async function getCachedRankedKeywords(
  client: PoolClient,
  urlNormalized: string,
  ttlDays: number = CACHE_TTL_DAYS,
): Promise<RankedKeywordItem[] | null> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ttlDays);
  const r = await client.query<{ result_json: unknown }>(
    `SELECT result_json FROM seo_ranked_keywords_cache WHERE url_normalized = $1 AND fetched_at >= $2`,
    [urlNormalized, cutoff],
  );
  const row = r.rows[0];
  if (!row?.result_json) return null;
  const arr = Array.isArray(row.result_json) ? row.result_json : [];
  return arr as RankedKeywordItem[];
}

/** Store result in cache (upsert by url_normalized). */
export async function setCachedRankedKeywords(
  client: PoolClient,
  urlNormalized: string,
  keywords: RankedKeywordItem[],
): Promise<void> {
  await client.query(
    `INSERT INTO seo_ranked_keywords_cache (url_normalized, result_json, fetched_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (url_normalized) DO UPDATE SET result_json = $2::jsonb, fetched_at = now()`,
    [urlNormalized, JSON.stringify(keywords)],
  );
}

function parseApiItems(items: unknown[]): RankedKeywordItem[] {
  const result: RankedKeywordItem[] = [];
  for (const it of items) {
    const obj = it as Record<string, unknown>;
    const kd = obj?.keyword_data as Record<string, unknown> | undefined;
    const keyword = (kd?.keyword as string) ?? "";
    if (!keyword) continue;
    const ki = kd?.keyword_info as Record<string, unknown> | undefined;
    const searchVolume = typeof ki?.search_volume === "number" ? ki.search_volume : undefined;
    const rse = obj?.ranked_serp_element as Record<string, unknown> | undefined;
    const serpItem = rse?.serp_item as Record<string, unknown> | undefined;
    const position = typeof serpItem?.rank_group === "number" ? serpItem.rank_group : undefined;
    result.push({
      keyword,
      monthly_search_volume: searchVolume,
      position,
    });
  }
  return result;
}

/** Call DataForSEO API for one URL. Target must be full URL with https for page-level. */
export async function fetchRankedKeywordsFromDataForSeo(
  fullUrl: string,
  limit: number = DEFAULT_LIMIT_PER_URL,
): Promise<RankedKeywordItem[]> {
  if (!isConfigured()) return [];
  const auth = Buffer.from(
    `${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`,
    "utf8",
  ).toString("base64");
  // DataForSEO expects the POST body to be the task array directly, not { data: [...] }
  const task = {
    target: fullUrl.startsWith("http") ? fullUrl : `https://${fullUrl}`,
    limit: Math.min(1000, Math.max(1, limit)),
    item_types: ["organic"],
    include_clickstream_data: false,
  };
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify([task]),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DataForSEO API ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {
    tasks?: Array<{
      result?: Array<{ items?: unknown[] }>;
      status_code?: number;
      status_message?: string;
    }>;
    status_code?: number;
  };
  if (data.status_code && data.status_code !== 20000) {
    throw new Error(data.status_message ?? `DataForSEO status ${data.status_code}`);
  }
  const task = data.tasks?.[0];
  const statusCode = task?.status_code;
  if (statusCode && statusCode !== 20000) {
    throw new Error((task as { status_message?: string }).status_message ?? `Task status ${statusCode}`);
  }
  const resultList = task?.result ?? [];
  const firstResult = resultList[0] as { items?: unknown[] } | undefined;
  const items = firstResult?.items ?? [];
  return parseApiItems(Array.isArray(items) ? items : []);
}

/**
 * For each URL: return from cache if fresh, else fetch from DataForSEO and cache.
 * Limits concurrent API calls (one URL at a time to respect rate limits).
 */
export async function fetchRankedKeywordsForUrls(
  urls: string[],
  options: { limit_per_url?: number; cache_ttl_days?: number } = {},
): Promise<{ by_url: RankedKeywordsByUrl; error?: string }> {
  const limitPerUrl = options.limit_per_url ?? DEFAULT_LIMIT_PER_URL;
  const cacheTtlDays = options.cache_ttl_days ?? CACHE_TTL_DAYS;
  const byUrl: RankedKeywordsByUrl = {};

  if (!urls.length) return { by_url: byUrl };

  const uniqueUrls = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const normalizedToOriginal = new Map<string, string>();
  for (const u of uniqueUrls) {
    const norm = normalizeUrlForCache(u);
    if (norm && !normalizedToOriginal.has(norm)) normalizedToOriginal.set(norm, u);
  }
  const toFetch: string[] = [];
  const cutoff = new Date(Date.now() - cacheTtlDays * 24 * 60 * 60 * 1000);

  for (const [norm, original] of normalizedToOriginal) {
    const cached = await pool.query<{ result_json: unknown }>(
      `SELECT result_json FROM seo_ranked_keywords_cache WHERE url_normalized = $1 AND fetched_at >= $2`,
      [norm, cutoff],
    );
    const row = cached.rows[0];
    if (row?.result_json) {
      const arr = Array.isArray(row.result_json) ? row.result_json : [];
      byUrl[original] = { keywords: arr as RankedKeywordItem[], cached: true };
    } else {
      toFetch.push(original);
    }
  }

  if (!isConfigured()) {
    return {
      by_url: byUrl,
      error: "DataForSEO not configured. Set DATAFORSEO_LOGIN and DATAFORSEO_PASSWORD.",
    };
  }

  let lastError: string | undefined;
  for (const url of toFetch) {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const norm = normalizeUrlForCache(fullUrl);
    try {
      const keywords = await fetchRankedKeywordsFromDataForSeo(fullUrl, limitPerUrl);
      byUrl[url] = { keywords, cached: false };
      await pool.query(
        `INSERT INTO seo_ranked_keywords_cache (url_normalized, result_json, fetched_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (url_normalized) DO UPDATE SET result_json = $2::jsonb, fetched_at = now()`,
        [norm, JSON.stringify(keywords)],
      );
    } catch (e) {
      lastError = (e as Error).message;
      byUrl[url] = { keywords: [], cached: false };
    }
  }

  return { by_url: byUrl, error: lastError };
}
