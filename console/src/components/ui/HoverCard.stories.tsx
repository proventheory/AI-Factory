import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "./HoverCard";

const meta = {
  title: "UI/HoverCard",
  parameters: { layout: "centered" },
  tags: ["autodocs"],
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <HoverCard>
      <HoverCardTrigger asChild><span className="text-brand-600 underline cursor-pointer">Initiative #abc123</span></HoverCardTrigger>
      <HoverCardContent>
        <div className="space-y-1">
          <h4 className="text-sm font-semibold">Deploy pipeline v2</h4>
          <p className="text-xs text-muted-foreground">Intent: feature | Risk: low</p>
          <p className="text-xs text-muted-foreground">Created: Jan 15, 2024</p>
        </div>
      </HoverCardContent>
    </HoverCard>
  ),
};
