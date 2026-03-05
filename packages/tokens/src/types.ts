/**
 * Canonical brand design token shape (DTCG-aligned).
 * Top-level groups: identity, voice, colors, typography, spacing, layout, components, email, marketing, seo, documents, image_generation, motion.
 */

export type DesignTokens = {
  identity?: Record<string, unknown>;
  voice?: Record<string, unknown>;
  colors?: {
    brand?: Record<string, string>;
    text?: Record<string, string>;
    surface?: Record<string, string>;
    state?: Record<string, string>;
    border?: Record<string, string>;
    button?: Record<string, Record<string, string>>;
    [key: string]: unknown;
  };
  typography?: {
    fonts?: { heading?: string; body?: string; mono?: string };
    scale?: Record<string, string>;
    weight?: Record<string, string | number>;
    [key: string]: unknown;
  };
  spacing?: Record<string, string | number>;
  layout?: Record<string, string | number>;
  components?: Record<string, unknown>;
  email?: Record<string, unknown>;
  marketing?: Record<string, unknown>;
  seo?: Record<string, unknown>;
  documents?: Record<string, unknown>;
  image_generation?: Record<string, unknown>;
  motion?: Record<string, unknown>;
  // Legacy / compatibility
  logo?: { url?: string };
  logo_url?: string;
};

export type TokenValue = string | number | boolean | Record<string, unknown> | unknown[];
