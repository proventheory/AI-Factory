import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { PlanNode } from "./PlanNode";

const meta = {
  title: "Flow/PlanNode",
  component: PlanNode,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  decorators: [(Story) => <ReactFlowProvider><div style={{ width: 300, height: 150 }}><Story /></div></ReactFlowProvider>],
} satisfies Meta<typeof PlanNode>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Queued: Story = {
  args: { id: "1", type: "planNode", data: { display_name: "Code Review", agent_role: "reviewer", job_type: "code_review", status: "queued" }, selected: false, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, zIndex: 0 } as any,
};

export const Running: Story = {
  args: { ...Queued.args, data: { display_name: "Code Generation", agent_role: "coder", job_type: "codegen", status: "running" } } as any,
};

export const Succeeded: Story = {
  args: { ...Queued.args, data: { display_name: "Unit Tests", agent_role: "tester", job_type: "unit_test", status: "succeeded" } } as any,
};

export const Failed: Story = {
  args: { ...Queued.args, data: { display_name: "Write Patch", agent_role: "patcher", job_type: "write_patch", status: "failed" } } as any,
};
