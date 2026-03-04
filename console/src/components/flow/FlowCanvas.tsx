"use client";
import { ReactFlow, Background, MiniMap, type Node, type Edge, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { PlanNode } from "./PlanNode";
import { StartNode, EndNode } from "./StartEndNodes";
import { FlowToolbar } from "./FlowToolbar";

const nodeTypes = { planNode: PlanNode, startNode: StartNode, endNode: EndNode };

type FlowCanvasProps = {
  nodes: Node[];
  edges: Edge[];
  className?: string;
  onNodeClick?: (event: React.MouseEvent, node: Node) => void;
  showMinimap?: boolean;
  showToolbar?: boolean;
};

function FlowCanvasInner({ nodes, edges, className, onNodeClick, showMinimap = true, showToolbar = true }: FlowCanvasProps) {
  return (
    <div className={cn("relative h-[500px] w-full rounded-lg border bg-card", className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ animated: false, style: { stroke: "hsl(var(--border))", strokeWidth: 2 } }}
      >
        <Background gap={16} size={1} className="!bg-background" />
        {showMinimap && <MiniMap pannable zoomable className="!bg-card !border-border" nodeColor="hsl(var(--muted-foreground))" />}
        {showToolbar && <FlowToolbar />}
      </ReactFlow>
    </div>
  );
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
