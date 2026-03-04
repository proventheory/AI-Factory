"use client";
import { PieChart as RechartsPieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export type PieChartProps = {
  data: { name: string; value: number }[];
  colors?: string[];
  showLegend?: boolean;
  className?: string;
  minHeight?: number;
  innerRadius?: number;
};

export function PieChart({ data, colors = CHART_COLORS, showLegend = true, className, minHeight = 250, innerRadius = 0 }: PieChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsPieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={innerRadius} paddingAngle={2} labelLine={false}>
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltipContent />} />
        {showLegend && <Legend />}
      </RechartsPieChart>
    </ChartContainer>
  );
}
