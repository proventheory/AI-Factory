/**
 * Export tokens to JSON for email renderer (Klaviyo-compatible subset). Email-safe values only.
 */

import type { DesignTokens } from "./types.js";

function pickEmailSafe(tokens: DesignTokens): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (tokens.colors) {
    out.colors = tokens.colors;
  }
  if (tokens.typography?.fonts) {
    out.typography = { fonts: tokens.typography.fonts };
  }
  if (tokens.email) {
    out.email = tokens.email;
  }
  if (tokens.spacing) {
    out.spacing = tokens.spacing;
  }
  return out;
}

export function exportToEmailJson(tokens: DesignTokens): string {
  return JSON.stringify(pickEmailSafe(tokens), null, 2);
}
