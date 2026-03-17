/** Keys that must not be written into email_design_generator_metadata.metadata_json; use columns or child table. See docs/SCHEMA_JSON_GUARDRAILS.md. */
export const EMAIL_DESIGN_METADATA_JSON_BLOCKLIST = ["scheduled_at", "segment_id", "proof_status"] as const;

export function checkEmailDesignMetadataJsonBlocklist(meta: Record<string, unknown>): string | null {
  for (const key of EMAIL_DESIGN_METADATA_JSON_BLOCKLIST) {
    if (Object.prototype.hasOwnProperty.call(meta, key)) return key;
  }
  return null;
}

/** Documented allowed top-level keys for artifacts.metadata_json. See docs/SCHEMA_JSON_GUARDRAILS.md. */
export const ARTIFACT_METADATA_JSON_ALLOWLIST = new Set(["content", "mjml", "error_signature", "type"]);

/** design_tokens keys that are campaign/asset refs and should live in initiative or email metadata. See docs/SCHEMA_JSON_GUARDRAILS.md. */
export const DESIGN_TOKENS_NON_TOKEN_KEYS = ["products", "selected_images"] as const;
