import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { FilterBar } from "./FilterBar";

const meta = {
  title: "UI/FilterBar",
  component: FilterBar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof FilterBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { chips: [] },
};

export const WithChips: Story = {
  args: {
    chips: [
      { key: "env", label: "Env", value: "prod" },
      { key: "status", label: "Status", value: "failed", onRemove: () => {} },
    ],
    onClearAll: () => {},
  },
};
