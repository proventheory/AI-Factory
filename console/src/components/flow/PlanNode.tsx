"use client";
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui";
import { FileCode, Search, GitPullRequest, TestTube, FileText, Cog, Zap, type LucideIcon } from "lucide-react";

const JOB_TYPE_ICONS: Record<string, LucideIcon> = {
  codefix: FileCode,
  codegen: FileCode,
  code_review: Search,
  pr_review: GitPullRequest,
  unit_test: TestTube,
  doc: FileText,
  plan_compile: Cog,
  research: Search,
  write_patch: FileCode,
  analyze_repo: Search,
};

const STATUS_STYLES: Record<string, string> = {
  queued: "border-muted-foreground/40",
  running: "border-chart-1 shadow-md animate-pulse",
  succeeded: "border-emerald-500",
  failed: "border-destructive",
  blocked: "border-amber-500",
};

type PlanNodeData = {
  display_name?: string;
  agent_role?: string;
  job_type?: string;
  status?: string;
  sequence?: number;
};

function PlanNodeInner({ data }: NodeProps) {
  const d = data as PlanNodeData;
  const status = d.status ?? "queued";
  const Icon = JOB_TYPE_ICONS[d.job_type ?? ""] ?? Zap;
  const statusVariant = status === "succeeded" ? "success" : status === "failed" ? "error" : status === "running" ? "info" : status === "blocked" ? "warning" : "neutral";

  return (
    <div className={cn("relative rounded-lg border-2 bg-card px-3 py-2 min-w-[200px] transition-all", STATUS_STYLES[status] ?? STATUS_STYLES.queued)}>
      <Handle type="target" position={Position.Top} className="!bg-muted-foreground !w-2 !h-2" />
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground truncate">{d.display_name ?? "Node"}</span>
      </div>
      <div className="mt-1 flex items-center gap-1.5">
        {d.agent_role && <Badge variant="neutral" className="text-[10px] px-1.5 py-0">{d.agent_role}</Badge>}
        <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0">{status}</Badge>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground !w-2 !h-2" />
    </div>
  );
}

export const PlanNode = memo(PlanNodeInner);
