/**
 * Internal link graph: nodes = URLs, edges = internal links (from inventory discovered_from or placeholder).
 */

export interface GraphNode {
  url: string;
  type: string;
}

export interface GraphEdge {
  from_url: string;
  to_url: string;
  anchor_text?: string | null;
  link_context?: "nav" | "footer" | "contextual" | "unknown";
}

export interface InternalLinkGraph {
  site_role: "source" | "target";
  base_url: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Build graph from inventory URLs. Edges from discovered_from when present (crawl stores parent page).
 */
export function buildGraphFromInventory(
  records: Array<{ url: string; normalized_url: string; path?: string; type?: string; discovered_from?: string | null }>,
  siteRole: "source" | "target",
  baseUrl: string,
): InternalLinkGraph {
  const nodes: GraphNode[] = records.map((r) => ({
    url: r.normalized_url || r.url,
    type: (r.type as string) || "page",
  }));
  const edges: GraphEdge[] = [];
  const urlSet = new Set(records.map((r) => (r.normalized_url || r.url).replace(/\/$/, "")));
  for (const r of records) {
    const from = (r.discovered_from as string)?.trim();
    if (from && urlSet.has(from.replace(/\/$/, ""))) {
      edges.push({
        from_url: from,
        to_url: r.normalized_url || r.url,
        link_context: "unknown",
      });
    }
  }
  return { site_role: siteRole, base_url: baseUrl, nodes, edges };
}

/**
 * Count inlinks per URL from edges.
 */
export function inlinkCounts(edges: GraphEdge[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of edges) {
    const to = e.to_url.replace(/\/$/, "");
    counts.set(to, (counts.get(to) ?? 0) + 1);
  }
  return counts;
}
