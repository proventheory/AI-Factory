import type { RenderContext } from "../types.js";

export interface TableBlockConfig {
  title?: string;
  headers: string[];
  rows: (string | number)[][];
  footer_row?: (string | number)[];
}

export function renderTableBlockToHtml(config: TableBlockConfig, ctx: RenderContext): string {
  const headerBg = ctx.reportTheme.table_style?.header_bg ?? "#f1f5f9";
  const stripe = ctx.reportTheme.table_style?.stripe !== false;
  let html = config.title ? `<h3 style="margin-bottom:8px;">${config.title}</h3>` : "";
  html += `<table style="width:100%;border-collapse:collapse;font-size:14px;">`;
  html += `<thead><tr>${config.headers.map(h => `<th style="background:${headerBg};padding:8px 12px;text-align:left;border-bottom:2px solid #e2e8f0;">${h}</th>`).join("")}</tr></thead>`;
  html += `<tbody>`;
  config.rows.forEach((row, i) => {
    const bg = stripe && i % 2 === 1 ? "background:#f8fafc;" : "";
    html += `<tr>${row.map(cell => `<td style="${bg}padding:8px 12px;border-bottom:1px solid #e2e8f0;">${cell}</td>`).join("")}</tr>`;
  });
  if (config.footer_row) {
    html += `<tr>${config.footer_row.map(cell => `<td style="padding:8px 12px;font-weight:600;border-top:2px solid #e2e8f0;">${cell}</td>`).join("")}</tr>`;
  }
  html += `</tbody></table>`;
  return html;
}
