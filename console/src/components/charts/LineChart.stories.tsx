import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { LineChart } from "./LineChart";

const sampleData = [
  { date: "Jan", runs: 12, failures: 2 },
  { date: "Feb", runs: 19, failures: 3 },
  { date: "Mar", runs: 24, failures: 1 },
  { date: "Apr", runs: 31, failures: 4 },
  { date: "May", runs: 28, failures: 2 },
  { date: "Jun", runs: 35, failures: 5 },
];

const meta = {
  title: "Charts/LineChart",
  component: LineChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof LineChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData, xAxisKey: "date", dataKeys: ["runs"] },
};

export const MultiLine: Story = {
  args: { data: sampleData, xAxisKey: "date", dataKeys: ["runs", "failures"], showLegend: true },
};
