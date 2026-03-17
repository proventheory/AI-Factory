import { pool } from "../../db.js";

/** Flatten design_tokens for brand_design_tokens_flat. Returns { path, value_text, value_json, type, group }[] */
export function flattenDesignTokens(
  obj: unknown,
  prefix = ""
): { path: string; value_text: string | null; value_json: unknown; type: string; group: string }[] {
  const out: { path: string; value_text: string | null; value_json: unknown; type: string; group: string }[] = [];
  if (obj == null) return out;
  const group = prefix ? prefix.split(".")[0] : "";
  if (typeof obj === "string") {
    out.push({ path: prefix, value_text: obj, value_json: null, type: "string", group });
    return out;
  }
  if (typeof obj === "number" || typeof obj === "boolean") {
    out.push({ path: prefix, value_text: String(obj), value_json: obj, type: typeof obj, group });
    return out;
  }
  if (Array.isArray(obj)) {
    out.push({ path: prefix, value_text: null, value_json: obj, type: "array", group });
    return out;
  }
  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      out.push(...flattenDesignTokens(v, prefix ? `${prefix}.${k}` : k));
    }
  }
  return out;
}

/** Sync design_tokens to brand_design_tokens_flat. No-op if table does not exist. */
export async function syncDesignTokensFlat(brandId: string, designTokens: unknown): Promise<void> {
  const flat = flattenDesignTokens(designTokens);
  if (flat.length === 0) return;
  try {
    await pool.query("DELETE FROM brand_design_tokens_flat WHERE brand_id = $1", [brandId]);
    for (const row of flat) {
      await pool.query(
        `INSERT INTO brand_design_tokens_flat (brand_id, path, value, value_json, type, "group", updated_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, now())
         ON CONFLICT (brand_id, path) DO UPDATE SET value = $3, value_json = $4::jsonb, type = $5, "group" = $6, updated_at = now()`,
        [
          brandId,
          row.path,
          row.value_text,
          row.value_json != null ? JSON.stringify(row.value_json) : null,
          row.type,
          row.group || "root",
        ]
      );
    }
  } catch (e) {
    if ((e as { code?: string }).code !== "42P01") throw e;
    // 42P01 = undefined_table; ignore if migration not run
  }
}
