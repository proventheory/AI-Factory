/**
 * Unit tests for SEO lib: normalize, classify, matcher.
 * Run: npm test (or npx tsx --test runners/tests/seo-lib.test.ts)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl, getPath } from "../src/lib/seo/normalize-url.js";
import { classifyUrlType } from "../src/lib/seo/classify-url.js";
import { matchSourceToTarget } from "../src/lib/seo/matcher.js";
import type { SeoUrlRecord } from "../src/lib/seo/crawl.js";

describe("normalizeUrl", () => {
  it("strips hash and query", () => {
    assert.strictEqual(normalizeUrl("https://example.com/path?q=1#x"), "https://example.com/path");
  });
  it("normalizes trailing slash to no slash for path", () => {
    assert.strictEqual(normalizeUrl("https://example.com/foo/"), "https://example.com/foo");
  });
  it("keeps single slash as path", () => {
    assert.strictEqual(normalizeUrl("https://example.com/"), "https://example.com/");
  });
});

describe("getPath", () => {
  it("returns pathname", () => {
    assert.strictEqual(getPath("https://example.com/products/abc"), "/products/abc");
  });
});

describe("classifyUrlType", () => {
  it("classifies product path", () => {
    assert.strictEqual(classifyUrlType("/product/foo"), "product");
    assert.strictEqual(classifyUrlType("/products/bar"), "product");
  });
  it("classifies collection path", () => {
    assert.strictEqual(classifyUrlType("/collections/sale"), "collection");
  });
  it("classifies blog/post path", () => {
    assert.strictEqual(classifyUrlType("/blog/my-post"), "post");
  });
  it("classifies homepage", () => {
    assert.strictEqual(classifyUrlType("/"), "homepage");
    assert.strictEqual(classifyUrlType(""), "homepage");
  });
  it("classifies page as default", () => {
    assert.strictEqual(classifyUrlType("/about"), "page");
  });
});

describe("matchSourceToTarget", () => {
  const sourceRecords: SeoUrlRecord[] = [
    { url: "https://src.com/product/a", normalized_url: "https://src.com/product/a", path: "/product/a", status: 200, type: "product", source: "sitemap" },
    { url: "https://src.com/collections/x", normalized_url: "https://src.com/collections/x", path: "/collections/x", status: 200, type: "collection", source: "sitemap" },
    { url: "https://src.com/no-match", normalized_url: "https://src.com/no-match", path: "/no-match", status: 200, type: "page", source: "sitemap" },
  ];
  const targetRecords: SeoUrlRecord[] = [
    { url: "https://tgt.com/products/a", normalized_url: "https://tgt.com/products/a", path: "/products/a", status: 200, type: "product", source: "sitemap" },
    { url: "https://tgt.com/collections/x", normalized_url: "https://tgt.com/collections/x", path: "/collections/x", status: 200, type: "collection", source: "sitemap" },
  ];

  it("produces rule match when path maps via rule to target", () => {
    const { matches, by_match_type } = matchSourceToTarget(
      [sourceRecords[0]],
      [targetRecords[0]],
      "https://tgt.com",
    );
    assert.strictEqual(matches.length, 1);
    assert.strictEqual(matches[0].match_type, "rule");
    assert.strictEqual(matches[0].target_path, "/products/a");
    assert.strictEqual(by_match_type.rule, 1);
  });

  it("produces rule match for /product/ -> /products/", () => {
    const { matches } = matchSourceToTarget(sourceRecords, targetRecords, "https://tgt.com");
    const productMatch = matches.find((m) => m.source_path === "/product/a");
    assert.ok(productMatch);
    assert.strictEqual(productMatch.match_type, "rule");
    assert.strictEqual(productMatch.target_url, "https://tgt.com/products/a");
  });

  it("produces none for unmatched source path", () => {
    const { matches, by_match_type } = matchSourceToTarget(sourceRecords, targetRecords, "https://tgt.com");
    const noMatch = matches.find((m) => m.source_path === "/no-match");
    assert.ok(noMatch);
    assert.strictEqual(noMatch.match_type, "none");
    assert.strictEqual(noMatch.target_url, null);
    assert.ok(by_match_type.none >= 1);
  });
});
