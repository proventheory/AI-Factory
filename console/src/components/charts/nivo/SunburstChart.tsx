"use client";
import { ResponsiveSunburst } from "@nivo/sunburst";
import { cn } from "@/lib/utils";

type SunburstNode = { name: string; value?: number; children?: SunburstNode[]; color?: string };

export function SunburstChart({ data, className, minHeight = 400 }: { data: SunburstNode; className?: string; minHeight?: number }) {
  return (
    <div className={cn("w-full", className)} style={{ minHeight }}>
      <ResponsiveSunburst
        data={data}
        margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
        id="name"
        value="value"
        cornerRadius={2}
        borderWidth={1}
        borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
        colors={{ scheme: "paired" }}
        childColor={{ from: "color", modifiers: [["brighter", 0.3]] }}
        animate
        motionConfig="gentle"
        isInteractive
      />
    </div>
  );
}
