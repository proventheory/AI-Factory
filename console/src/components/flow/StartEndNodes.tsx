"use client";
import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Play, CheckCircle2 } from "lucide-react";

function StartNodeInner() {
  return (
    <div className="flex items-center gap-1.5 rounded-full border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5">
      <Play className="h-3.5 w-3.5 text-emerald-600" />
      <span className="text-xs font-medium text-emerald-700">Start</span>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-2 !h-2" />
    </div>
  );
}

function EndNodeInner() {
  return (
    <div className="flex items-center gap-1.5 rounded-full border-2 border-emerald-500 bg-emerald-50 px-3 py-1.5">
      <Handle type="target" position={Position.Top} className="!bg-emerald-500 !w-2 !h-2" />
      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
      <span className="text-xs font-medium text-emerald-700">End</span>
    </div>
  );
}

export const StartNode = memo(StartNodeInner);
export const EndNode = memo(EndNodeInner);
