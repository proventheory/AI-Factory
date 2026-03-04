/**
 * Build design tokens using Style Dictionary.
 * Usage: npx ts-node scripts/build-tokens.ts [--brand path/to/brand.json]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { tokens } from "../src/tokens.js";

const GENERATED_DIR = resolve(dirname(new URL(import.meta.url).pathname), "../generated");

function flattenTokens(obj: Record<string, unknown>, prefix = ""): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}-${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(result, flattenTokens(value as Record<string, unknown>, path));
    } else {
      result[path] = String(value);
    }
  }
  return result;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key]) && target[key] && typeof target[key] === "object" && !Array.isArray(target[key])) {
      result[key] = deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function main() {
  let mergedTokens: Record<string, unknown> = tokens as unknown as Record<string, unknown>;

  const brandArg = process.argv.indexOf("--brand");
  if (brandArg !== -1 && process.argv[brandArg + 1]) {
    const brandPath = resolve(process.argv[brandArg + 1]);
    const brandOverrides = JSON.parse(readFileSync(brandPath, "utf-8"));
    mergedTokens = deepMerge(mergedTokens, brandOverrides);
    console.log(`Merged brand overrides from ${brandPath}`);
  }

  if (!existsSync(GENERATED_DIR)) mkdirSync(GENERATED_DIR, { recursive: true });

  const flat = flattenTokens(mergedTokens, "brand");
  const cssVars = Object.entries(flat).map(([k, v]) => `  --${k}: ${v};`).join("\n");
  writeFileSync(resolve(GENERATED_DIR, "css-vars.css"), `:root {\n${cssVars}\n}\n`);

  writeFileSync(resolve(GENERATED_DIR, "tokens.json"), JSON.stringify(mergedTokens, null, 2));

  const tailwindTheme: Record<string, unknown> = {};
  const c = (mergedTokens as any).color;
  if (c) {
    tailwindTheme["colors"] = {};
    for (const [group, values] of Object.entries(c)) {
      (tailwindTheme["colors"] as any)[group] = values;
    }
  }
  const t = (mergedTokens as any).typography;
  if (t?.fontFamily) tailwindTheme["fontFamily"] = t.fontFamily;
  if (t?.fontSize) tailwindTheme["fontSize"] = t.fontSize;
  const sp = (mergedTokens as any).spacing;
  if (sp) tailwindTheme["spacing"] = sp;
  const r = (mergedTokens as any).radius;
  if (r) tailwindTheme["borderRadius"] = r;
  const s = (mergedTokens as any).shadow;
  if (s) tailwindTheme["boxShadow"] = s;

  writeFileSync(resolve(GENERATED_DIR, "tailwind-theme.js"), `module.exports = ${JSON.stringify(tailwindTheme, null, 2)};\n`);

  const deckTheme = {
    chart_color_sequence: c?.brand ? Object.values(c.brand).slice(3, 8) : [],
    font_config: { heading_font: t?.fontFamily?.sans ?? "system-ui", body_font: t?.fontFamily?.sans ?? "system-ui" },
    kpi_card_style: { bg_color: c?.surface?.raised ?? "#f8fafc", text_color: c?.text?.primary ?? "#0f172a" },
    table_style: { header_bg: c?.neutral?.["100"] ?? "#f1f5f9", border_color: c?.border?.default ?? "#cbd5e1" },
  };
  writeFileSync(resolve(GENERATED_DIR, "deck-theme.json"), JSON.stringify(deckTheme, null, 2));

  const reportCss = `:root {\n  --report-brand: ${c?.brand?.["500"] ?? "#3b82f6"};\n  --report-bg: ${c?.surface?.base ?? "#ffffff"};\n  --report-text: ${c?.text?.primary ?? "#0f172a"};\n  --report-heading-font: ${t?.fontFamily?.sans ?? "system-ui"};\n  --report-section-spacing: 24px;\n}\n`;
  writeFileSync(resolve(GENERATED_DIR, "report-theme.css"), reportCss);

  console.log(`Generated files in ${GENERATED_DIR}:`);
  console.log("  css-vars.css, tokens.json, tailwind-theme.js, deck-theme.json, report-theme.css");
}

main();
