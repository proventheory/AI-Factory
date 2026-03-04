"use client";
import { ComposedChart as RechartsComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
];

export type ComposedSeries = { key: string; type: "line" | "bar"; color?: string };

export type ComposedChartProps = {
  data: Record<string, unknown>[];
  xAxisKey: string;
  series: ComposedSeries[];
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
  minHeight?: number;
};

export function ComposedChart({ data, xAxisKey, series, showGrid = true, showLegend = false, className, minHeight }: ComposedChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsComposedChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
        <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltipContent />} />
        {showLegend && <Legend />}
        {series.map((s, i) =>
          s.type === "bar" ? (
            <Bar key={s.key} dataKey={s.key} fill={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} radius={[4, 4, 0, 0]} />
          ) : (
            <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color ?? CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={false} />
          )
        )}
      </RechartsComposedChart>
    </ChartContainer>
  );
}
