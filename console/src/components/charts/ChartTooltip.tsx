"use client";
import { cn } from "@/lib/utils";

export function ChartTooltipContent({ active, payload, label, className }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string; className?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className={cn("rounded-lg border border-border bg-card px-3 py-2 shadow-md", className)}>
      {label && <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>}
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-medium text-foreground">{typeof entry.value === "number" ? entry.value.toLocaleString() : entry.value}</span>
        </div>
      ))}
    </div>
  );
}
