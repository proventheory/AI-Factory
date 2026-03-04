import type { RenderContext } from "../types.js";

export interface KPICardConfig {
  title: string;
  value: string | number;
  change?: number;
  change_direction?: "up" | "down" | "flat";
  unit?: string;
}

export function renderKpiCardToHtml(config: KPICardConfig, ctx: RenderContext): string {
  const bgColor = (ctx.deckTheme.kpi_card_style?.bg_color) ?? "#ffffff";
  const textColor = (ctx.deckTheme.kpi_card_style?.text_color) ?? "#000000";
  const arrow = config.change_direction === "up" ? "↑" : config.change_direction === "down" ? "↓" : "—";
  return `<div style="background:${bgColor};color:${textColor};padding:24px;border-radius:8px;border:1px solid #e2e8f0;">
  <p style="font-size:14px;opacity:0.7;">${config.title}</p>
  <p style="font-size:32px;font-weight:700;">${config.value}${config.unit ? ` ${config.unit}` : ""}</p>
  ${config.change != null ? `<p style="font-size:14px;">${arrow} ${Math.abs(config.change)}%</p>` : ""}
</div>`;
}
