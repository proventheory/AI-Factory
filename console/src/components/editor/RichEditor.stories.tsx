import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { RichEditor } from "./RichEditor";

const meta = {
  title: "Editor/RichEditor",
  component: RichEditor,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof RichEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { placeholder: "Start writing your goal..." },
};

export const WithContent: Story = {
  args: {
    content: { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Initiative Goal" }] }, { type: "paragraph", content: [{ type: "text", text: "Build an automated code review pipeline that catches bugs before PR merge." }] }] },
  },
};

export const ReadOnly: Story = {
  args: {
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "This content is read-only." }] }] },
    editable: false,
    showToolbar: false,
  },
};

export const WithCharLimit: Story = {
  args: { placeholder: "Max 200 characters...", maxLength: 200 },
};
