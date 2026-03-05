/**
 * Export tokens to CSS variables (stub). Prefix: --brand-
 */

import type { DesignTokens } from "./types.js";

function flatten(obj: unknown, prefix: string): string[] {
  const lines: string[] = [];
  if (obj == null) return lines;
  if (typeof obj === "string" || typeof obj === "number") {
    lines.push(`${prefix}: ${obj};`);
    return lines;
  }
  if (typeof obj === "object" && !Array.isArray(obj)) {
    for (const [k, v] of Object.entries(obj)) {
      const key = k.replace(/([A-Z])/g, "-$1").toLowerCase();
      lines.push(...flatten(v, `${prefix}-${key}`));
    }
  }
  return lines;
}

export function exportToCssVariables(tokens: DesignTokens, prefix = "--brand"): string {
  const lines: string[] = [":root {"];
  if (tokens.colors) lines.push(...flatten(tokens.colors, `${prefix}-color`));
  if (tokens.typography) lines.push(...flatten(tokens.typography, `${prefix}-font`));
  if (tokens.spacing) lines.push(...flatten(tokens.spacing, `${prefix}-space`));
  lines.push("}");
  return lines.join("\n");
}
