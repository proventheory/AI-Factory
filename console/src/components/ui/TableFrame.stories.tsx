import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { TableFrame } from "./TableFrame";

const meta = {
  title: "UI/TableFrame",
  component: TableFrame,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta<typeof TableFrame>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <table className="w-full text-body-small">
        <thead>
          <tr className="text-left text-text-muted">
            <th className="pb-2 pr-4">Column A</th>
            <th className="pb-2 pr-4">Column B</th>
            <th className="pb-2">Column C</th>
          </tr>
        </thead>
        <tbody>
          {[1, 2, 3].map((i) => (
            <tr key={i} className="border-t border-slate-200">
              <td className="py-2">Row {i} A</td>
              <td className="py-2">Row {i} B</td>
              <td className="py-2">Row {i} C</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
};
