import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";
export async function handleBrandCompile(request) {
    const profile = request.input?.brand_profile;
    if (!profile)
        return { error: "No brand_profile provided in input" };
    const outDir = resolve("/tmp", `brand-compile-${request.job_run_id}`);
    if (!existsSync(outDir))
        mkdirSync(outDir, { recursive: true });
    const designTokens = (profile.design_tokens ?? {});
    writeFileSync(resolve(outDir, "tokens.json"), JSON.stringify(designTokens, null, 2));
    const flat = flattenForCss(designTokens, "brand");
    const css = `:root {\n${Object.entries(flat).map(([k, v]) => `  --${k}: ${v};`).join("\n")}\n}\n`;
    writeFileSync(resolve(outDir, "css-vars.css"), css);
    return {
        artifacts: [
            { artifact_type: "tokens_json", artifact_class: "docs", uri: resolve(outDir, "tokens.json") },
            { artifact_type: "css_vars", artifact_class: "docs", uri: resolve(outDir, "css-vars.css") },
        ],
        metadata: { brand_profile_id: profile.id },
    };
}
function flattenForCss(obj, prefix) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        const path = `${prefix}-${key}`;
        if (value && typeof value === "object" && !Array.isArray(value)) {
            Object.assign(result, flattenForCss(value, path));
        }
        else {
            result[path] = String(value);
        }
    }
    return result;
}
//# sourceMappingURL=brand-compile.js.map