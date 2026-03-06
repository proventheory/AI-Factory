"use client";

import { useState, useMemo } from "react";

type TokenEntry = { path: string; value: unknown };

/** Human-friendly labels for common design token paths (products, brand sitemap used by email, decks, reports). */
const PATH_LABELS: Record<string, string> = {
  products: "Products",
  sitemap_url: "Brand sitemap URL",
  sitemap_type: "Brand sitemap type",
  brand_sitemap_url: "Brand sitemap URL",
  brand_sitemap_type: "Brand sitemap type",
  email_sitemap_url: "Brand sitemap URL",
  email_sitemap_type: "Brand sitemap type",
};

function pathDisplay(path: string): string {
  return PATH_LABELS[path] ?? path;
}

function flattenTokens(obj: unknown, prefix = ""): TokenEntry[] {
  const out: TokenEntry[] = [];
  if (obj == null) return out;
  if (typeof obj === "string" || typeof obj === "number" || typeof obj === "boolean") {
    out.push({ path: prefix, value: obj });
    return out;
  }
  if (Array.isArray(obj)) {
    out.push({ path: prefix, value: JSON.stringify(obj) });
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...flattenTokens(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

export function TokenTreeView({
  tokens,
  className = "",
}: {
  tokens: Record<string, unknown> | null | undefined;
  className?: string;
}) {
  const [filter, setFilter] = useState("");

  const entries = useMemo(() => {
    const flat = flattenTokens(tokens ?? {});
    if (!filter.trim()) return flat;
    const q = filter.toLowerCase();
    return flat.filter((e) => e.path.toLowerCase().includes(q) || String(e.value).toLowerCase().includes(q));
  }, [tokens, filter]);

  if (!tokens || Object.keys(tokens).length === 0) {
    return (
      <p className="text-body-small text-text-muted">No design tokens. They are set when you save Basic Info.</p>
    );
  }

  return (
    <div className={className}>
      <input
        type="search"
        placeholder="Filter by path or value..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-3 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-body-small text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        aria-label="Filter tokens"
      />
      <div className="max-h-[320px] overflow-y-auto rounded border border-slate-200 bg-slate-50">
        <table className="w-full text-body-small">
          <thead className="sticky top-0 bg-slate-100">
            <tr>
              <th className="text-left p-2 font-medium text-slate-600">Path</th>
              <th className="text-left p-2 font-medium text-slate-600">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ path, value }) => (
              <tr key={path} className="border-t border-slate-200">
                <td className="p-2 font-mono text-xs text-slate-700 break-all">{pathDisplay(path)}</td>
                <td className="p-2 text-slate-900 break-all">
                  {typeof value === "string" && value.startsWith("#") ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="inline-block h-4 w-4 rounded border border-slate-300" style={{ backgroundColor: value }} />
                      {value}
                    </span>
                  ) : (
                    String(value)
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-caption text-text-muted">{entries.length} token(s)</p>
    </div>
  );
}
