"use client";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export type BarChartProps = {
  data: Record<string, unknown>[];
  xAxisKey: string;
  dataKeys: string[];
  colors?: string[];
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
  minHeight?: number;
  stacked?: boolean;
};

export function BarChart({ data, xAxisKey, dataKeys, colors = CHART_COLORS, showGrid = true, showLegend = false, className, minHeight, stacked = false }: BarChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsBarChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
        <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltipContent />} />
        {showLegend && <Legend />}
        {dataKeys.map((key, i) => (
          <Bar key={key} dataKey={key} fill={colors[i % colors.length]} radius={[4, 4, 0, 0]} stackId={stacked ? "stack" : undefined} />
        ))}
      </RechartsBarChart>
    </ChartContainer>
  );
}
