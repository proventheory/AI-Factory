"use client";
import { AreaChart as RechartsAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export type AreaChartProps = {
  data: Record<string, unknown>[];
  xAxisKey: string;
  dataKeys: string[];
  colors?: string[];
  showGrid?: boolean;
  className?: string;
  minHeight?: number;
  stacked?: boolean;
};

export function AreaChart({ data, xAxisKey, dataKeys, colors = CHART_COLORS, showGrid = true, className, minHeight, stacked = false }: AreaChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsAreaChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <defs>
          {dataKeys.map((key, i) => (
            <linearGradient key={key} id={`gradient-${key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors[i % colors.length]} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors[i % colors.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
        <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltipContent />} />
        {dataKeys.map((key, i) => (
          <Area key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} fill={`url(#gradient-${key})`} stackId={stacked ? "stack" : undefined} />
        ))}
      </RechartsAreaChart>
    </ChartContainer>
  );
}
