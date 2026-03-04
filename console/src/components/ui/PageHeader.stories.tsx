import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageHeader } from "./PageHeader";

const meta = {
  title: "UI/PageHeader",
  component: PageHeader,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Pipeline Runs",
    description: "Orchestration run history. Create an initiative and run a plan to see runs here.",
  },
};

export const WithActions: Story = {
  args: {
    title: "Overview",
    description: "Scheduler and pipeline health at a glance.",
    actions: <button type="button" className="rounded bg-brand-600 px-3 py-1.5 text-sm text-white">Action</button>,
  },
};

export const LongTitle: Story = {
  args: {
    title: "Very long page title that might wrap or truncate depending on viewport width",
    description: "Short description.",
  },
};
