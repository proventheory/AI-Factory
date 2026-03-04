import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { CardSection } from "./CardSection";

const meta = {
  title: "UI/CardSection",
  component: CardSection,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof CardSection>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithTitle: Story = {
  args: {
    title: "Active leases",
    children: <p className="text-body-small text-slate-600">No active leases.</p>,
  },
};

export const WithTitleAndRightSlot: Story = {
  args: {
    title: "Recent failed runs",
    rightSlot: <button type="button" className="text-sm text-brand-600 hover:underline">View all</button>,
    children: <p className="text-body-small text-slate-600">No recent failures.</p>,
  },
};

export const BodyOnly: Story = {
  args: {
    children: <p className="text-body-small text-slate-600">Card section with no title.</p>,
  },
};
