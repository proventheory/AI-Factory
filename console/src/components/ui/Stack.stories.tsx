import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Stack } from "./Stack";

const meta = {
  title: "UI/Stack",
  component: Stack,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Stack>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <>
        <div className="rounded border border-slate-200 p-4">Section 1 (gap-6 below)</div>
        <div className="rounded border border-slate-200 p-4">Section 2</div>
        <div className="rounded border border-slate-200 p-4">Section 3</div>
      </>
    ),
  },
};
