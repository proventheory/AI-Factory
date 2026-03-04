"use client";
import { LineChart as RechartsLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export type LineChartProps = {
  data: Record<string, unknown>[];
  xAxisKey: string;
  dataKeys: string[];
  colors?: string[];
  showGrid?: boolean;
  showLegend?: boolean;
  className?: string;
  minHeight?: number;
};

export function LineChart({ data, xAxisKey, dataKeys, colors = CHART_COLORS, showGrid = true, showLegend = false, className, minHeight }: LineChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsLineChart data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        {showGrid && <CartesianGrid strokeDasharray="3 3" className="stroke-border" />}
        <XAxis dataKey={xAxisKey} className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <YAxis className="text-xs fill-muted-foreground" tick={{ fontSize: 12 }} />
        <Tooltip content={<ChartTooltipContent />} />
        {showLegend && <Legend />}
        {dataKeys.map((key, i) => (
          <Line key={key} type="monotone" dataKey={key} stroke={colors[i % colors.length]} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </RechartsLineChart>
    </ChartContainer>
  );
}
