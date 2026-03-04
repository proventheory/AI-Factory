import type { RenderContext } from "../types.js";

export interface ChartBlockConfig {
  title?: string;
  chart_type: "bar" | "line" | "pie" | "area" | "donut";
  data: { labels: string[]; datasets: { label: string; data: number[] }[] };
  axis_labels?: { x?: string; y?: string };
}

export function renderChartBlockToHtml(config: ChartBlockConfig, ctx: RenderContext): string {
  const colors = ctx.deckTheme.chart_color_sequence ?? ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];
  return `<div class="chart-block" data-chart-type="${config.chart_type}" data-chart='${JSON.stringify(config.data)}' data-colors='${JSON.stringify(colors)}'>
  ${config.title ? `<h3 style="margin-bottom:8px;">${config.title}</h3>` : ""}
  <div style="width:100%;height:300px;background:#f8fafc;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#64748b;">[${config.chart_type} chart: ${config.data.datasets.map(d => d.label).join(", ")}]</div>
</div>`;
}
