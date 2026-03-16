/**
 * Match source URLs to target URLs by path rules (e.g. /product/ → /products/, /collections/ → /collection/).
 */
import type { SeoUrlRecord } from "./crawl.js";
import { normalizeUrl, getPath } from "./normalize-url.js";

export interface MatchingRule {
  source_pattern: string; // path prefix or regex string
  target_replacement?: string;
  path_suffix?: "keep" | "strip_slash";
}

export const DEFAULT_MATCHING_RULES: MatchingRule[] = [
  { source_pattern: "/product/", target_replacement: "/products/", path_suffix: "keep" },
  { source_pattern: "/products/", target_replacement: "/products/", path_suffix: "keep" },
  { source_pattern: "/collection/", target_replacement: "/collections/", path_suffix: "keep" },
  { source_pattern: "/collections/", target_replacement: "/collections/", path_suffix: "keep" },
  { source_pattern: "/blog/", target_replacement: "/blogs/", path_suffix: "keep" },
  { source_pattern: "/blogs/", target_replacement: "/blogs/", path_suffix: "keep" },
  { source_pattern: "/page/", target_replacement: "/pages/", path_suffix: "keep" },
  { source_pattern: "/pages/", target_replacement: "/pages/", path_suffix: "keep" },
];

export interface UrlMatch {
  source_url: string;
  source_path: string;
  target_url: string | null;
  target_path: string | null;
  match_type: "exact" | "rule" | "none";
  rule_used?: string;
}

/**
 * Build target path from source path using rules and target origin.
 */
function applyRules(
  sourcePath: string,
  targetOrigin: string,
  rules: MatchingRule[]
): { path: string; rule: MatchingRule } | null {
  const normalizedPath = sourcePath.replace(/\/+/g, "/") || "/";
  for (const rule of rules) {
    const prefix = rule.source_pattern.replace(/\/+/g, "/");
    const match = normalizedPath === prefix || normalizedPath.startsWith(prefix + "/") || (prefix !== "/" && normalizedPath.startsWith(prefix));
    if (match) {
      const suffix = normalizedPath.slice(prefix.length).replace(/^\/+/, "") || "";
      const replacement = (rule.target_replacement ?? prefix).replace(/\/+/g, "/").replace(/\/$/, "");
      const newPath = replacement ? (replacement + (suffix ? "/" + suffix : "")).replace(/\/+/g, "/") : "/" + suffix;
      return { path: newPath || "/", rule };
    }
  }
  return null;
}

/**
 * Match source inventory URLs to target inventory; produce match report.
 */
export function matchSourceToTarget(
  sourceRecords: SeoUrlRecord[],
  targetRecords: SeoUrlRecord[],
  targetOrigin: string,
  rules: MatchingRule[] = DEFAULT_MATCHING_RULES
): {
  matches: UrlMatch[];
  by_match_type: { exact: number; rule: number; none: number };
  target_url_to_path: Map<string, string>;
} {
  const targetByPath = new Map<string, SeoUrlRecord>();
  for (const r of targetRecords) {
    const p = (r.path || getPath(r.url)).replace(/\/+/g, "/") || "/";
    targetByPath.set(p, r);
    const noTrailing = p.replace(/\/$/, "") || "/";
    if (noTrailing !== p) targetByPath.set(noTrailing, r);
  }

  const matches: UrlMatch[] = [];
  const by_match_type = { exact: 0, rule: 0, none: 0 };
  const target_url_to_path = new Map<string, string>();

  for (const rec of targetRecords) {
    target_url_to_path.set(rec.normalized_url, rec.path || getPath(rec.url));
  }

  for (const src of sourceRecords) {
    const sourcePath = (src.path || getPath(src.url)).replace(/\/+/g, "/") || "/";
    const sourcePathNoTrailing = sourcePath.replace(/\/$/, "") || "/";

    let targetPath: string | null = null;
    let match_type: "exact" | "rule" | "none" = "none";
    let rule_used: string | undefined;

    if (targetByPath.has(sourcePath) || targetByPath.has(sourcePathNoTrailing)) {
      targetPath = targetByPath.get(sourcePath)?.path ?? targetByPath.get(sourcePathNoTrailing)?.path ?? sourcePath;
      match_type = "exact";
      by_match_type.exact++;
    } else {
      const applied = applyRules(sourcePath, targetOrigin, rules);
      if (applied) {
        const candidatePath = applied.path;
        const candNoTrailing = candidatePath.replace(/\/$/, "") || "/";
        const targetRec = targetByPath.get(candidatePath) ?? targetByPath.get(candNoTrailing);
        if (targetRec) {
          targetPath = targetRec.path || getPath(targetRec.url);
          match_type = "rule";
          rule_used = applied.rule.source_pattern;
          by_match_type.rule++;
        } else {
          by_match_type.none++;
        }
      } else {
        by_match_type.none++;
      }
    }

    const targetUrl = targetPath ? `${targetOrigin}${targetPath.startsWith("/") ? "" : "/"}${targetPath}` : null;
    matches.push({
      source_url: src.normalized_url,
      source_path: sourcePath,
      target_url: targetUrl,
      target_path: targetPath,
      match_type: match_type as "exact" | "rule" | "none",
      rule_used,
    });
  }

  return { matches, by_match_type, target_url_to_path };
}
