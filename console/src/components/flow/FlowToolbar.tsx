"use client";
import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize2, Download } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export function FlowToolbar({ className, onExport }: { className?: string; onExport?: () => void }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className={cn("absolute bottom-3 right-3 z-10 flex items-center gap-1 rounded-lg border bg-card/90 p-1 shadow-sm backdrop-blur-sm", className)}>
      <Button variant="ghost" size="sm" onClick={() => zoomIn()} aria-label="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
      <Button variant="ghost" size="sm" onClick={() => zoomOut()} aria-label="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
      <Button variant="ghost" size="sm" onClick={() => fitView({ padding: 0.2 })} aria-label="Fit view"><Maximize2 className="h-4 w-4" /></Button>
      {onExport && <Button variant="ghost" size="sm" onClick={onExport} aria-label="Export"><Download className="h-4 w-4" /></Button>}
    </div>
  );
}
