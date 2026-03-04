import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Progress } from "./Progress";

const meta = {
  title: "UI/Progress",
  component: Progress,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof Progress>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Zero: Story = { args: { value: 0 } };
export const Half: Story = { args: { value: 50 } };
export const Full: Story = { args: { value: 100 } };
