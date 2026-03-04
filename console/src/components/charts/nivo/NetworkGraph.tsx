"use client";
import { ResponsiveNetwork } from "@nivo/network";
import { cn } from "@/lib/utils";

type NetworkNode = { id: string; height?: number; size?: number; color?: string };
type NetworkLink = { source: string; target: string; distance?: number };
type NetworkData = { nodes: NetworkNode[]; links: NetworkLink[] };

export function NetworkGraph({ data, className, minHeight = 400 }: { data: NetworkData; className?: string; minHeight?: number }) {
  return (
    <div className={cn("w-full", className)} style={{ minHeight }}>
      <ResponsiveNetwork
        data={data}
        margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
        repulsivity={6}
        iterations={60}
        nodeColor={(n: NetworkNode) => n.color ?? "hsl(var(--chart-1))"}
        nodeBorderWidth={1}
        nodeBorderColor={{ from: "color", modifiers: [["darker", 0.4]] }}
        linkThickness={1.5}
        motionConfig="gentle"
        animate
      />
    </div>
  );
}
