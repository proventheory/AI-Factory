import type { RenderContext, ComponentType, DocumentComponentConfig } from "./types.js";
import { renderKpiCardToHtml } from "./components/kpi-card.js";
import { renderTableBlockToHtml } from "./components/table-block.js";
import { renderChartBlockToHtml } from "./components/chart-block.js";
import { renderCalloutToHtml } from "./components/callout.js";
import { renderTextBlockToHtml } from "./components/text-block.js";
import { renderCoverSlideToHtml } from "./components/cover-slide.js";
import { renderDividerToHtml } from "./components/divider.js";
import { renderTimelineToHtml } from "./components/timeline.js";

type Renderer = (config: any, ctx: RenderContext) => string;

const HTML_RENDERERS: Record<ComponentType, Renderer> = {
  kpi_card: renderKpiCardToHtml,
  table_block: renderTableBlockToHtml,
  chart_block: renderChartBlockToHtml,
  callout: renderCalloutToHtml,
  text_block: (c) => renderTextBlockToHtml(c),
  cover_slide: renderCoverSlideToHtml,
  divider: (c) => renderDividerToHtml(c),
  timeline: (c) => renderTimelineToHtml(c),
  image_block: (c) => `<div style="text-align:${c.alignment ?? "center"};"><img src="${c.uri}" alt="${c.alt_text ?? ""}" style="max-width:${c.width ?? "100%"};border-radius:8px;" /></div>`,
  two_column: (c, ctx) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">${renderComponent(c.left, ctx)}${renderComponent(c.right, ctx)}</div>`,
  pricing_table: (c) => `<div style="display:grid;grid-template-columns:repeat(${(c.plans ?? []).length}, 1fr);gap:16px;">${(c.plans ?? []).map((p: any) => `<div style="border:${p.highlighted ? "2px solid #3b82f6" : "1px solid #e2e8f0"};border-radius:8px;padding:24px;text-align:center;"><h3>${p.name}</h3><p style="font-size:24px;font-weight:700;">${p.price}</p><ul style="list-style:none;padding:0;margin:16px 0;">${(p.features ?? []).map((f: string) => `<li style="padding:4px 0;">✓ ${f}</li>`).join("")}</ul></div>`).join("")}</div>`,
  header_block: (c, ctx) => `<header style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid #e2e8f0;">${ctx.brandAssets?.logo ? `<img src="${ctx.brandAssets.logo}" alt="logo" style="height:32px;" />` : ""}<span style="font-size:14px;color:#64748b;">${c.text ?? ""}</span></header>`,
  footer_block: (c) => `<footer style="text-align:center;padding:16px 0;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;">${c.text ?? "© " + new Date().getFullYear()}</footer>`,
};

export function renderComponent(comp: DocumentComponentConfig, ctx: RenderContext): string {
  const renderer = HTML_RENDERERS[comp.type];
  if (!renderer) return `<div>[Unknown component: ${comp.type}]</div>`;
  return renderer(comp.config, ctx);
}

export function renderAllComponents(components: DocumentComponentConfig[], ctx: RenderContext): string {
  return components.map(c => renderComponent(c, ctx)).join("\n");
}
