"use client";
import { ResponsiveTreeMap } from "@nivo/treemap";
import { cn } from "@/lib/utils";

type TreemapNode = { name: string; value?: number; children?: TreemapNode[] };

export function TreemapChart({ data, className, minHeight = 400 }: { data: TreemapNode; className?: string; minHeight?: number }) {
  return (
    <div className={cn("w-full", className)} style={{ minHeight }}>
      <ResponsiveTreeMap
        data={data}
        identity="name"
        value="value"
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        labelSkipSize={12}
        labelTextColor={{ from: "color", modifiers: [["darker", 2]] }}
        parentLabelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        animate
        colors={{ scheme: "paired" }}
      />
    </div>
  );
}
