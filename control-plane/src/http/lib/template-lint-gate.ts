/**
 * Template lint gate for plan start: blocks starting a run when the template fails lint.
 * Used by POST /v1/plans/:id/start. Shared so api.ts and plans controller can use it.
 */
export function isTemplateImageContractsMissing(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /relation\s+["']?template_image_contracts["']?\s+does not exist/i.test(msg);
}

export async function runTemplateLintGate(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> },
  templateId: string,
): Promise<{ ok: boolean; errors: Array<{ code: string; message: string }> }> {
  let q: { rows: Record<string, unknown>[] };
  try {
    q = await db.query(
      "SELECT t.id, t.mjml, c.hero_required, c.logo_safe_hero, c.product_hero_allowed, c.mixed_content_and_product_pool, c.collapses_empty_modules, c.max_content_slots, c.max_product_slots, c.supports_content_images, c.supports_product_images, c.optional_modules FROM email_templates t LEFT JOIN template_image_contracts c ON c.template_id = t.id AND c.version = 'v1' WHERE t.id = $1",
      [templateId],
    );
  } catch (err) {
    if (isTemplateImageContractsMissing(err)) return { ok: true, errors: [] };
    throw err;
  }
  if (q.rows.length === 0) return { ok: true, errors: [] };
  const row = q.rows[0];
  const contract = row.hero_required != null ? row : null;
  if (!contract) {
    return { ok: true, errors: [] };
  }
  const mjml = (row.mjml as string) ?? "";
  const { lintTemplateMjml } = await import("../../template-image-linter.js");
  const results = lintTemplateMjml(mjml, contract, templateId);
  const errors = results.filter((r: { severity: string }) => r.severity === "error").map((r: { code: string; message: string }) => ({ code: r.code, message: r.message }));
  return { ok: errors.length === 0, errors };
}
