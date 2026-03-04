import type { RenderContext } from "../types.js";

export interface CalloutConfig {
  type: "insight" | "warning" | "success" | "info";
  title?: string;
  content: string;
}

const TYPE_DEFAULTS: Record<string, { bg: string; border: string; icon: string }> = {
  insight: { bg: "#eff6ff", border: "#3b82f6", icon: "💡" },
  warning: { bg: "#fef3c7", border: "#d97706", icon: "⚠️" },
  success: { bg: "#d1fae5", border: "#059669", icon: "✅" },
  info: { bg: "#dbeafe", border: "#2563eb", icon: "ℹ️" },
};

export function renderCalloutToHtml(config: CalloutConfig, ctx: RenderContext): string {
  const style = ctx.reportTheme.callout_style ?? {};
  const defaults = TYPE_DEFAULTS[config.type] ?? TYPE_DEFAULTS.info;
  const bg = (style as any).bg_color ?? defaults.bg;
  const border = (style as any).border_color ?? defaults.border;
  return `<div style="background:${bg};border-left:4px solid ${border};padding:16px;border-radius:4px;margin:8px 0;">
  ${config.title ? `<p style="font-weight:600;margin-bottom:4px;">${defaults.icon} ${config.title}</p>` : ""}
  <p>${config.content}</p>
</div>`;
}
