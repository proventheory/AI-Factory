import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PieChart } from "./PieChart";

const sampleData = [
  { name: "Succeeded", value: 65 },
  { name: "Failed", value: 12 },
  { name: "Running", value: 8 },
  { name: "Queued", value: 15 },
];

const meta = {
  title: "Charts/PieChart",
  component: PieChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof PieChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData },
};

export const Donut: Story = {
  args: { data: sampleData, innerRadius: 50 },
};
