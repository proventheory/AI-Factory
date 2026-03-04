"use client";
import { RadarChart as RechartsRadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip } from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltipContent } from "./ChartTooltip";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
];

export type RadarChartProps = {
  data: Record<string, unknown>[];
  angleKey: string;
  dataKeys: string[];
  colors?: string[];
  className?: string;
  minHeight?: number;
};

export function RadarChart({ data, angleKey, dataKeys, colors = CHART_COLORS, className, minHeight = 300 }: RadarChartProps) {
  return (
    <ChartContainer className={className} minHeight={minHeight}>
      <RechartsRadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
        <PolarGrid className="stroke-border" />
        <PolarAngleAxis dataKey={angleKey} className="text-xs fill-muted-foreground" />
        <PolarRadiusAxis className="text-xs fill-muted-foreground" />
        <Tooltip content={<ChartTooltipContent />} />
        {dataKeys.map((key, i) => (
          <Radar key={key} dataKey={key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.2} />
        ))}
      </RechartsRadarChart>
    </ChartContainer>
  );
}
