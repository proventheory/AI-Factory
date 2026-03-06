import { loadBrandContext, brandContextToDesignTokens } from "../brand-context.js";
import { tokens } from "../tokens.js";
export async function handleUiScaffold(request) {
    const brandCtx = request.initiative_id ? await loadBrandContext(request.initiative_id) : null;
    const merged = brandCtx ? brandContextToDesignTokens(brandCtx, tokens) : tokens;
    const tailwindConfig = `/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: ${JSON.stringify(merged?.color ?? {}, null, 6)},
      fontFamily: ${JSON.stringify(merged?.typography?.fontFamily ?? {}, null, 6)},
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
//# sourceMappingURL=ui-scaffold.js.map