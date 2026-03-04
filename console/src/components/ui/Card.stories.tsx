import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Card, CardHeader, CardContent } from "./Card";

const meta = {
  title: "UI/Card",
  component: Card,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Simple: Story = {
  args: {
    children: <div className="p-4">Card content</div>,
  },
};

export const WithHeaderAndContent: Story = {
  args: {
    children: (
      <>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-subheading font-medium text-text-primary">Section title</h2>
        </div>
        <div className="p-4">
          <p className="text-body-small text-slate-600">Body content with consistent padding.</p>
        </div>
      </>
    ),
  },
};
