/**
 * landing_page_generate: brand + copy → full HTML landing page.
 * Uses brand design_tokens (colors, typography) and optional copy artifact from predecessor.
 */

import type { BrandContext } from "../brand-context.js";

function cssVarsFromBrand(ctx: BrandContext | null): string {
  if (!ctx?.design_tokens) return "";
  const dt = ctx.design_tokens as Record<string, unknown>;
  const colors = dt.colors as Record<string, Record<string, string>> | undefined;
  const typography = dt.typography as Record<string, unknown> | undefined;
  const fonts = typography?.fonts as Record<string, string> | undefined;

  const vars: string[] = [];
  const primary = colors?.brand?.primary ?? colors?.brand?.["500"] ?? "#2563eb";
  const primaryDark = colors?.brand?.primary_dark ?? colors?.brand?.["600"] ?? "#1d4ed8";
  const textPrimary = colors?.text?.primary ?? "#1a1a1a";
  const textSecondary = colors?.text?.secondary ?? "#666666";
  const bg = colors?.surface?.base ?? "#ffffff";
  const headingFont = fonts?.heading ?? "system-ui, sans-serif";
  const bodyFont = fonts?.body ?? "system-ui, sans-serif";

  vars.push(`--lp-primary: ${primary};`);
  vars.push(`--lp-primary-dark: ${primaryDark};`);
  vars.push(`--lp-text: ${textPrimary};`);
  vars.push(`--lp-text-secondary: ${textSecondary};`);
  vars.push(`--lp-bg: ${bg};`);
  vars.push(`--lp-font-heading: ${headingFont};`);
  vars.push(`--lp-font-body: ${bodyFont};`);
  return vars.join("\n  ");
}

function buildLogoHtml(brand: BrandContext | null): string {
  if (!brand?.design_tokens) return "";
  const logo = (brand.design_tokens as Record<string, unknown>)?.logo as Record<string, string> | undefined;
  if (!logo) return "";

  const bold = (logo.wordmark_bold ?? "").trim();
  const light = (logo.wordmark_light ?? "").trim();
  const siteUrl = (brand.identity as Record<string, string> | undefined)?.website ?? "#";

  if (bold || light) {
    return `<header class="lp-header">
  <a href="${escapeHtml(siteUrl)}" class="lp-logo-link">
    <span class="lp-logo-bold">${escapeHtml(bold)}</span><span class="lp-logo-light">${escapeHtml(light)}</span>
  </a>
</header>`;
  }

  const wordmark = (logo.wordmark ?? "").trim();
  if (wordmark) {
    return `<header class="lp-header">
  <a href="${escapeHtml(siteUrl)}" class="lp-logo-link">${escapeHtml(wordmark)}</a>
</header>`;
  }

  const url = logo.url ?? (brand.design_tokens as Record<string, string>)?.logo_url;
  if (url) {
    return `<header class="lp-header">
  <a href="${escapeHtml(siteUrl)}" class="lp-logo-link"><img src="${escapeHtml(url)}" alt="${escapeHtml(brand.name ?? "Logo")}" class="lp-logo-img" /></a>
</header>`;
  }

  return "";
}

/** Exported for unit tests. */
export function buildLandingHtml(opts: {
  brand: BrandContext | null;
  headline: string;
  body: string;
  ctaText: string;
  title?: string;
}): string {
  const { brand, headline, body, ctaText, title } = opts;
  const pageTitle = title ?? brand?.identity?.tagline ?? brand?.name ?? "Landing";
  const cssVars = cssVarsFromBrand(brand);
  const logoHtml = buildLogoHtml(brand);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root {
  ${cssVars}
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--lp-font-body);
      color: var(--lp-text);
      background: var(--lp-bg);
      line-height: 1.6;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    .lp-header {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 1rem 2rem;
      text-align: left;
    }
    .lp-logo-link {
      font-family: var(--lp-font-heading);
      font-size: 1.4rem;
      color: var(--lp-text);
      text-decoration: none;
      letter-spacing: -0.02em;
    }
    .lp-logo-link:hover { color: var(--lp-primary); }
    .lp-logo-bold { font-weight: 700; }
    .lp-logo-light { font-weight: 300; }
    .lp-logo-img { height: 2rem; width: auto; vertical-align: middle; }
    main {
      max-width: 42rem;
      width: 100%;
      text-align: center;
      margin-top: 2rem;
    }
    h1 {
      font-family: var(--lp-font-heading);
      font-size: clamp(1.75rem, 4vw, 2.5rem);
      font-weight: 700;
      color: var(--lp-text);
      margin-bottom: 1rem;
    }
    .hero-body {
      color: var(--lp-text-secondary);
      font-size: 1.125rem;
      margin-bottom: 2rem;
      white-space: pre-line;
    }
    .cta {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: var(--lp-primary);
      color: white;
      text-decoration: none;
      font-weight: 600;
      border-radius: 0.5rem;
      transition: background 0.2s;
    }
    .cta:hover { background: var(--lp-primary-dark); }
  </style>
</head>
<body>
  ${logoHtml}
  <main>
    <h1>${escapeHtml(headline)}</h1>
    <p class="hero-body">${escapeHtml(body)}</p>
    <a href="#" class="cta">${escapeHtml(ctaText)}</a>
  </main>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export interface LandingPageGenerateParams {
  client: import("pg").PoolClient;
  context: import("../job-context.js").JobContext;
  params: { runId: string; jobRunId: string; planNodeId: string };
  writeArtifact: (
    client: import("pg").PoolClient,
    context: import("../job-context.js").JobContext,
    params: { runId: string; jobRunId: string; planNodeId: string },
    artifactType: string,
    content: string,
    artifactClass?: string
  ) => Promise<void>;
}

export async function handleLandingPageGenerate({
  client,
  context,
  params,
  writeArtifact,
}: LandingPageGenerateParams): Promise<void> {
  // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
  if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/handlers/landing-page-generate.ts:entry", message: "landing_page_generate start", data: { runId: params.runId }, timestamp: Date.now(), hypothesisId: "H3" }) }).catch(() => {});
  }
  // #endregion
  const { loadBrandContext } = await import("../brand-context.js");
  const brand = context.initiative_id ? await loadBrandContext(context.initiative_id) : null;

  let headline = "Welcome";
  let body = "Get started with us.";
  let ctaText = "Get started";

  const copyArtifact = context.predecessor_artifacts?.find((a) => a.artifact_type === "copy");
  if (copyArtifact?.id) {
    const row = await client.query<{ metadata_json: { content?: string } | null }>(
      "SELECT metadata_json FROM artifacts WHERE id = $1",
      [copyArtifact.id]
    );
    const content = row.rows[0]?.metadata_json?.content;
    if (typeof content === "string" && content.length > 0) {
      const firstLine = content.split(/\n/)[0]?.trim() ?? "";
      headline = firstLine.slice(0, 120) || headline;
      body = content.slice(0, 500).replace(firstLine, "").trim().slice(0, 400) || body;
    }
  }

  if (brand?.copy_style?.cta_style) {
    const cta = brand.copy_style.cta_style;
    if (typeof cta === "string" && cta.length < 50) ctaText = cta;
  }

  const title = brand?.identity?.tagline ?? brand?.name ?? undefined;
  const html = buildLandingHtml({
    brand,
    headline,
    body,
    ctaText,
    title: typeof title === "string" ? title : undefined,
  });

  // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
  if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/handlers/landing-page-generate.ts:before_write", message: "before writeArtifact landing_page", data: { htmlLen: html.length }, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
  }
  // #endregion
  await writeArtifact(client, context, params, "landing_page", html, "docs");
  // #region agent log (one-off debug: set DEBUG_ARTIFACTS_HYPOTHESES=1, see docs/DEBUG_ARTIFACTS_HYPOTHESES.md)
  if (process.env.DEBUG_ARTIFACTS_HYPOTHESES === "1") {
    fetch("http://127.0.0.1:7336/ingest/209875a1-5a0b-4fdf-a788-90bc785ce66f", { method: "POST", headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "24bf14" }, body: JSON.stringify({ sessionId: "24bf14", location: "runners/src/handlers/landing-page-generate.ts:after_write", message: "writeArtifact landing_page done", data: {}, timestamp: Date.now(), hypothesisId: "H4" }) }).catch(() => {});
  }
  // #endregion
}
