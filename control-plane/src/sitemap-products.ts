/**
 * Sitemap → products: fetch sitemap XML, parse, fetch product pages, scrape image/title.
 * Ported from email-marketing-factory/src/app/api/campaigns/route.ts.
 */

import axios from "axios";
import { Parser } from "xml2js";
import * as cheerio from "cheerio";

export type SitemapType = "drupal" | "ecommerce" | "bigcommerce" | "shopify";

export interface SitemapProduct {
  src: string;
  title: string;
  product_url: string;
}

export interface FetchSitemapProductsOptions {
  sitemap_url: string;
  sitemap_type: SitemapType;
  page?: number;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function getLoc(urlEntry: { loc?: string[] }): string | null {
  const loc = urlEntry?.loc;
  if (!loc || !Array.isArray(loc) || loc.length === 0) return null;
  return loc[0];
}

function getImageLoc(urlEntry: Record<string, unknown>): string[] {
  const img = urlEntry["image:image"];
  if (!img || !Array.isArray(img)) return [];
  return img
    .map((ele: unknown) => {
      const o = ele as Record<string, string[] | undefined>;
      const loc = o?.["image:loc"];
      return loc?.[0];
    })
    .filter(Boolean) as string[];
}

/** Validate URL is HTTP/HTTPS. */
function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Fetch sitemap XML, parse, and return product items (image, title, url).
 * Throws on fetch/parse errors.
 */
export async function fetchSitemapProducts(
  options: FetchSitemapProductsOptions
): Promise<{ items: SitemapProduct[]; has_more: boolean; total?: number }> {
  const { sitemap_url, sitemap_type, page = 1, limit = DEFAULT_LIMIT } = options;
  if (!sitemap_url || !sitemap_type) {
    throw new Error("sitemap_url and sitemap_type are required");
  }
  if (!isValidUrl(sitemap_url)) {
    throw new Error("sitemap_url must be http or https");
  }

  const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);
  const safePage = Math.max(1, page);

  const response = await axios.get(sitemap_url, {
    timeout: 15000,
    maxRedirects: 3,
    validateStatus: (status) => status === 200,
  });

  const domain = new URL(sitemap_url).hostname.replace("www.", "");
  const parser = new Parser();
  const jsonData = (await parser.parseStringPromise(response.data)) as {
    urlset?: { url?: Array<Record<string, unknown>> };
  };

  const urlList = jsonData?.urlset?.url;
  if (!urlList || !Array.isArray(urlList)) {
    return { items: [], has_more: false, total: 0 };
  }
  const total = urlList.length;

  const updateLimit = sitemap_type === "shopify" ? 100 : safeLimit;
  const start = (safePage - 1) * updateLimit;
  const paginated = urlList.slice(start, start + updateLimit);
  const has_more = start + paginated.length < urlList.length;

  const pattern = "products";
  const patternAlt = "product";

  if (sitemap_type === "drupal" || sitemap_type === "ecommerce") {
    const others: SitemapProduct[] = [];
    const productDataPromises = paginated.map(async (url: Record<string, unknown>) => {
      const loc = getLoc(url as { loc?: string[] });
      if (!loc) return null;
      const usedPattern = loc.includes(pattern) ? pattern : patternAlt;
      if (loc.includes(usedPattern) && getImageLoc(url).length > 0) {
        getImageLoc(url).forEach((src) => {
          others.push({
            src,
            title: loc.split(usedPattern)[1]?.replace(/-/g, " ").replace(/\//g, "") ?? "",
            product_url: loc,
          });
        });
      }
      try {
        const productResponse = await axios.get(loc, { timeout: 10000 });
        if (!productResponse?.data) return null;
        const $ = cheerio.load(productResponse.data);
        const imgSrc =
          $('img[loading="eager"]').attr("src") ?? $('img[loading="lazy"]').attr("src");
        if (!imgSrc || imgSrc.includes(".gif") || imgSrc.includes("gif;")) return null;
        const fullImgSrc =
          imgSrc.includes(domain.split(".")[0]) ||
          imgSrc.includes("bigcommerce") ||
          imgSrc.includes(".com/")
            ? imgSrc
            : domain + (imgSrc.startsWith("/") ? imgSrc : `/${imgSrc}`);
        return {
          src: fullImgSrc,
          title:
            loc
              .split(domain)[1]
              ?.replace(`/${usedPattern}/`, "")
              .replace(/-/g, " ")
              .replace(/\//g, "") ?? "",
          product_url: loc,
        };
      } catch {
        return null;
      }
    });

    const productData = await Promise.all(productDataPromises);
    const productList = productData.filter((item): item is SitemapProduct => item !== null);
    const combined = productList.concat(others).length ? productList.concat(others) : [];
    return { items: combined, has_more, total };
  }

  if (sitemap_type === "bigcommerce") {
    const productDataPromises = paginated.map(async (url: Record<string, unknown>) => {
      const loc = getLoc(url as { loc?: string[] });
      if (!loc) return null;
      try {
        const productResponse = await axios.get(loc, { timeout: 10000 });
        if (!productResponse?.data) return null;
        const $ = cheerio.load(productResponse.data);
        const ogImage = $('meta[property="og:image"]').attr("content");
        if (!ogImage) return null;
        return {
          src: ogImage,
          title:
            loc
              .split(domain)[1]
              ?.replaceAll("-", " ")
              .replaceAll("/", "") ?? "",
          product_url: loc,
        };
      } catch {
        return null;
      }
    });
    const productData = await Promise.all(productDataPromises);
    const productList = productData.filter((item): item is SitemapProduct => item !== null);
    return { items: productList, has_more, total };
  }

  if (sitemap_type === "shopify") {
    const slugToTitle = (productUrl: string): string => {
      const match = productUrl.match(/\/products\/?([^?#]*)/i);
      const slug = match?.[1]?.replace(/\/$/, "") ?? "";
      return slug.replace(/-/g, " ").replace(/\//g, " ").trim() || "Product";
    };
    const productDataPromises = paginated.map(async (url: Record<string, unknown>) => {
      const loc = getLoc(url as { loc?: string[] });
      if (!loc || !/\/products\//i.test(loc)) return null;
      const imageLocs = getImageLoc(url);
      if (imageLocs.length === 0) return null;
      let title = slugToTitle(loc);
      try {
        const productResponse = await axios.get(loc, { timeout: 10000 });
        if (productResponse?.data) {
          const $ = cheerio.load(productResponse.data);
          const ogTitle = $('meta[property="og:title"]').attr("content")?.trim();
          if (ogTitle) title = ogTitle;
          else {
            const h1 = $("h1").first().text().trim();
            if (h1) title = h1;
          }
        }
      } catch {
        // keep slug-derived title
      }
      return {
        src: imageLocs[0],
        title,
        product_url: loc,
      };
    });
    const productData = await Promise.all(productDataPromises);
    const productList = productData.filter((item): item is SitemapProduct => item !== null);
    return { items: productList, has_more, total };
  }

  return { items: [], has_more: false, total: 0 };
}
