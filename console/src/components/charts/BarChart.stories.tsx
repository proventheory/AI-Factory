import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { BarChart } from "./BarChart";

const sampleData = [
  { type: "codefix", count: 45 },
  { type: "code_review", count: 32 },
  { type: "doc", count: 28 },
  { type: "unit_test", count: 21 },
  { type: "research", count: 15 },
];

const meta = {
  title: "Charts/BarChart",
  component: BarChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof BarChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData, xAxisKey: "type", dataKeys: ["count"] },
};

export const Stacked: Story = {
  args: { data: sampleData.map(d => ({ ...d, failed: Math.floor(d.count * 0.1) })), xAxisKey: "type", dataKeys: ["count", "failed"], stacked: true, showLegend: true },
};
