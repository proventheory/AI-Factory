import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { PageFrame } from "./PageFrame";

const meta = {
  title: "UI/PageFrame",
  component: PageFrame,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof PageFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-sm text-slate-600">Page content inside PageFrame. Max width 1400px, padding 16px/24px.</p>
      </div>
    ),
  },
};
