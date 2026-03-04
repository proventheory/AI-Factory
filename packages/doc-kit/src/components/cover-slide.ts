import type { RenderContext } from "../types.js";

export interface CoverSlideConfig {
  title: string;
  subtitle?: string;
  date?: string;
  logo_uri?: string;
}

export function renderCoverSlideToHtml(config: CoverSlideConfig, ctx: RenderContext): string {
  const brandColor = ((ctx.designTokens as any)?.color?.brand?.["500"]) ?? "#3b82f6";
  return `<div style="background:${brandColor};color:#ffffff;padding:64px 48px;border-radius:12px;text-align:center;">
  ${config.logo_uri ? `<img src="${config.logo_uri}" alt="logo" style="height:48px;margin-bottom:24px;" />` : ""}
  <h1 style="font-size:36px;font-weight:700;margin-bottom:8px;">${config.title}</h1>
  ${config.subtitle ? `<p style="font-size:18px;opacity:0.9;">${config.subtitle}</p>` : ""}
  ${config.date ? `<p style="font-size:14px;opacity:0.7;margin-top:16px;">${config.date}</p>` : ""}
</div>`;
}
