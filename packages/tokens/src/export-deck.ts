/**
 * Export tokens to deck template config (e.g. for doc-kit / deck-generate). Stub shape.
 */

import type { DesignTokens } from "./types.js";

export type DeckTemplateConfig = {
  typography?: { heading?: string; body?: string; scale?: Record<string, string> };
  colors?: Record<string, unknown>;
  spacing?: Record<string, string | number>;
  motion?: Record<string, unknown>;
};

export function exportToDeckConfig(tokens: DesignTokens): DeckTemplateConfig {
  const config: DeckTemplateConfig = {};
  if (tokens.typography) {
    config.typography = {
      heading: tokens.typography.fonts?.heading,
      body: tokens.typography.fonts?.body,
      scale: tokens.typography.scale as Record<string, string> | undefined,
    };
  }
  if (tokens.colors) config.colors = tokens.colors as Record<string, unknown>;
  if (tokens.spacing) config.spacing = tokens.spacing;
  if (tokens.motion) config.motion = tokens.motion as Record<string, unknown>;
  return config;
}
