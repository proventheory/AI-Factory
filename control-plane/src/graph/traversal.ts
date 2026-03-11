/**
 * Minimal stub for plan-compiler: cycle detection on template edges.
 * Full implementation lives in graph engine when available.
 */

export interface TemplateEdge {
  from_key: string;
  to_key: string;
  condition?: string;
}

export function detectCycleFromTemplate(edges: TemplateEdge[]): boolean {
  const fromTo = new Map<string, string[]>();
  for (const e of edges) {
    let list = fromTo.get(e.from_key);
    if (!list) {
      list = [];
      fromTo.set(e.from_key, list);
    }
    list.push(e.to_key);
  }
  const visited = new Set<string>();
  const stack = new Set<string>();
  function visit(key: string): boolean {
    if (stack.has(key)) return true;
    if (visited.has(key)) return false;
    visited.add(key);
    stack.add(key);
    for (const to of fromTo.get(key) ?? []) {
      if (visit(to)) return true;
    }
    stack.delete(key);
    return false;
  }
  for (const key of fromTo.keys()) {
    if (visit(key)) return true;
  }
  return false;
}
