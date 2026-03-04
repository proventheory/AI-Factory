"use client";
import { ResponsiveHeatMap } from "@nivo/heatmap";
import { cn } from "@/lib/utils";

type HeatmapData = { id: string; data: { x: string; y: number | null }[] };

export function HeatmapChart({ data, className, minHeight = 400 }: { data: HeatmapData[]; className?: string; minHeight?: number }) {
  return (
    <div className={cn("w-full", className)} style={{ minHeight }}>
      <ResponsiveHeatMap
        data={data}
        margin={{ top: 60, right: 30, bottom: 60, left: 60 }}
        axisTop={{ tickSize: 5, tickPadding: 5 }}
        axisLeft={{ tickSize: 5, tickPadding: 5 }}
        colors={{ type: "sequential", scheme: "blues" }}
        emptyColor="#f1f5f9"
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        labelTextColor={{ from: "color", modifiers: [["darker", 1.8]] }}
        animate
      />
    </div>
  );
}
