import { loadBrandContext, brandContextToDesignTokens } from "../brand-context.js";
import { tokens } from "../tokens.js";

export async function handleUiScaffold(request: {
  run_id: string;
  job_run_id: string;
  job_type: string;
  initiative_id?: string;
}) {
  const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
  const merged = brandCtx ? brandContextToDesignTokens(brandCtx, tokens as unknown as Record<string, unknown>) : tokens;

  const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify((merged as any)?.color ?? {}, null, 6)},
      fontFamily: ${JSON.stringify((merged as any)?.typography?.fontFamily ?? {}, null, 6)},
    },
  },
};`;

  return {
    artifact_type: "ui_scaffold",
    artifact_class: "docs",
    content: tailwindConfig,
    metadata: { brand_profile_id: brandCtx?.id },
  };
}
