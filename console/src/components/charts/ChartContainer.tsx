"use client";
import { cn } from "@/lib/utils";
import { ResponsiveContainer } from "recharts";

export function ChartContainer({ children, className, minHeight = 300 }: { children: React.ReactNode; className?: string; minHeight?: number }) {
  return (
    <div className={cn("w-full", className)} style={{ minHeight }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  );
}
