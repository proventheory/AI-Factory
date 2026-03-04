import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AppShell from "./AppShell";

const meta = {
  title: "Layout/AppShell",
  component: AppShell,
  parameters: {
    layout: "fullscreen",
    nextjs: {
      router: {
        pathname: "/dashboard",
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof AppShell>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    children: (
      <div className="p-4">
        <h1 className="text-xl font-semibold text-slate-900">Page content</h1>
        <p className="mt-2 text-sm text-slate-600">
          AppShell wraps the sidebar, header with breadcrumbs, and this main content area. Use PageFrame inside pages for consistent padding.
        </p>
      </div>
    ),
  },
};

export const WithRunsPath: Story = {
  parameters: {
    nextjs: {
      router: {
        pathname: "/runs",
      },
    },
  },
  args: {
    children: (
      <div className="p-4">
        <p className="text-sm text-slate-600">Breadcrumb should show: Home / Pipeline Runs</p>
      </div>
    ),
  },
};
