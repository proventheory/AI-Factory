/**
 * TokenService: get/set by path, merge, validate, compute derived tokens.
 */

import type { DesignTokens, TokenValue } from "./types.js";

export function getToken(tokens: DesignTokens, path: string): TokenValue | undefined {
  const parts = path.split(".");
  let current: unknown = tokens;
  for (const p of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[p];
  }
  return current as TokenValue;
}

export function setToken(tokens: DesignTokens, path: string, value: TokenValue): void {
  const parts = path.split(".");
  let current = tokens as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    if (!(key in current) || typeof current[key] !== "object") {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

/** Deep merge: overrides win. Mutates base. */
export function mergeTokens(base: DesignTokens, overrides: DesignTokens): DesignTokens {
  function merge(a: unknown, b: unknown): unknown {
    if (b == null) return a;
    if (typeof b !== "object" || Array.isArray(b)) return b;
    if (typeof a !== "object" || a == null || Array.isArray(a)) return b;
    const out = { ...(a as Record<string, unknown>) };
    for (const k of Object.keys(b as Record<string, unknown>)) {
      out[k] = merge(out[k], (b as Record<string, unknown>)[k]);
    }
    return out;
  }
  return merge(base, overrides) as DesignTokens;
}

const HEX = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;

export function validateTokens(tokens: DesignTokens): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (tokens.colors) {
    const visit = (obj: unknown, prefix: string) => {
      if (typeof obj === "string" && prefix.includes("color")) {
        if (!HEX.test(obj)) errors.push(`${prefix}: expected hex color, got ${obj}`);
      }
      if (obj && typeof obj === "object" && !Array.isArray(obj)) {
        for (const [k, v] of Object.entries(obj)) visit(v, prefix ? `${prefix}.${k}` : k);
      }
    };
    visit(tokens.colors, "colors");
  }
  return { valid: errors.length === 0, errors };
}

/** Derive hover/active from base if not set. Deterministic. */
export function computeDerivedTokens(tokens: DesignTokens): DesignTokens {
  const out = JSON.parse(JSON.stringify(tokens)) as DesignTokens;
  if (out.colors?.button) {
    for (const [name, states] of Object.entries(out.colors.button)) {
      if (typeof states !== "object" || Array.isArray(states)) continue;
      const s = states as Record<string, string>;
      if (!s.hover && s.default) s.hover = s.default;
      if (!s.active && s.default) s.active = s.default;
    }
  }
  return out;
}
