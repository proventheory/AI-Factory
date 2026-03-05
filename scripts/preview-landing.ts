/**
 * Generate Pharmacytime (or other brand) landing page HTML and serve at a URL.
 * Usage: npx tsx scripts/preview-landing.ts [brand-slug]
 * Default brand: pharmacytime-com
 * Serves at http://localhost:3999/pharmacytime.html (or {slug}.html)
 */

import { createServer } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildLandingHtml } from "../runners/src/handlers/landing-page-generate.js";
import type { BrandContext } from "../runners/src/brand-context.js";

const PORT = 3999;
const BRANDS_DIR = join(process.cwd(), "scripts", "brands");

function loadBrandJson(slug: string): Record<string, unknown> {
  const path = join(BRANDS_DIR, `${slug}.brand.json`);
  if (!existsSync(path)) throw new Error(`Brand file not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8"));
}

function toBrandContext(raw: Record<string, unknown>): BrandContext {
  return {
    id: (raw.id as string) ?? "preview",
    name: (raw.name as string) ?? "Brand",
    slug: raw.slug as string | undefined,
    identity: (raw.identity as BrandContext["identity"]) ?? {},
    tone: (raw.tone as BrandContext["tone"]) ?? {},
    visual_style: (raw.visual_style as BrandContext["visual_style"]) ?? {},
    copy_style: (raw.copy_style as BrandContext["copy_style"]) ?? {},
    design_tokens: (raw.design_tokens as Record<string, unknown>) ?? {},
    deck_theme: (raw.deck_theme as BrandContext["deck_theme"]) ?? {},
    report_theme: (raw.report_theme as BrandContext["report_theme"]) ?? {},
  };
}

function generateHtml(slug: string): string {
  const raw = loadBrandJson(slug);
  const brand = toBrandContext(raw);
  const identity = brand.identity as Record<string, string> | undefined;
  const tagline = identity?.tagline ?? brand.name;
  return buildLandingHtml({
    brand,
    headline: tagline,
    body: (raw.identity as Record<string, string>)?.description ?? "Get started with us.",
    ctaText: "Get started",
    title: brand.name,
  });
}

function main() {
  const slug = process.argv[2] ?? "pharmacytime-com";
  const fileName = `${slug.replace(/\.brand\.json$/, "").replace(/^([^.]+)\.brand$/, "$1")}.html`;
  const safeSlug = slug.replace(/\.brand\.json$/, "").replace(/\.brand$/, "");
  const htmlFileName = `${safeSlug}.html`;

  console.log(`Generating landing page for brand: ${safeSlug}`);
  let html: string;
  try {
    html = generateHtml(safeSlug);
  } catch (e) {
    console.error("Generate failed:", (e as Error).message);
    process.exit(1);
  }

  const previewDir = join(process.cwd(), "preview");
  if (!existsSync(previewDir)) mkdirSync(previewDir, { recursive: true });
  const outPath = join(previewDir, htmlFileName);
  writeFileSync(outPath, html, "utf-8");
  console.log(`Wrote ${outPath}`);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
    const path = url.pathname === "/" ? `/${htmlFileName}` : url.pathname;
    const filePath = join(previewDir, path.replace(/^\//, "") || "index.html");
    if (!existsSync(filePath) || !filePath.startsWith(previewDir)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const content = readFileSync(filePath, "utf-8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(content);
  });

  server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/${htmlFileName}`;
    console.log(`Serving at ${url}`);
    console.log("Press Ctrl+C to stop.");
  });
}

main();
