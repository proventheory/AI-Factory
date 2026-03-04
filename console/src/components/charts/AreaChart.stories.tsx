import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { AreaChart } from "./AreaChart";

const sampleData = [
  { date: "Mon", cost: 12.5, tokens: 4500 },
  { date: "Tue", cost: 18.3, tokens: 6200 },
  { date: "Wed", cost: 15.1, tokens: 5100 },
  { date: "Thu", cost: 22.7, tokens: 7800 },
  { date: "Fri", cost: 19.4, tokens: 6600 },
];

const meta = {
  title: "Charts/AreaChart",
  component: AreaChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof AreaChart>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { data: sampleData, xAxisKey: "date", dataKeys: ["cost"] },
};

export const Stacked: Story = {
  args: { data: sampleData, xAxisKey: "date", dataKeys: ["cost", "tokens"], stacked: true },
};
