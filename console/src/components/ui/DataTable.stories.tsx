import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { DataTable } from "./DataTable";
import type { Column } from "./DataTable";

type MockRow = { id: string; name: string; status: string; created_at: string };

const mockData: MockRow[] = [
  { id: "run-001", name: "Deploy prod", status: "succeeded", created_at: "2024-01-15T10:00:00Z" },
  { id: "run-002", name: "Doc generation", status: "running", created_at: "2024-01-15T11:00:00Z" },
  { id: "run-003", name: "Code review", status: "failed", created_at: "2024-01-15T12:00:00Z" },
];

const columns: Column<MockRow>[] = [
  { key: "id", header: "ID", render: (r) => <span className="font-mono text-caption-small">{r.id.slice(0, 8)}…</span> },
  { key: "name", header: "Name" },
  { key: "status", header: "Status", render: (r) => <span className={r.status === "succeeded" ? "text-green-600" : r.status === "failed" ? "text-red-600" : "text-slate-600"}>{r.status}</span> },
  { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
];

const meta = {
  title: "UI/DataTable",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <DataTable
      columns={columns}
      data={mockData}
      keyExtractor={(row) => row.id}
      {...args}
    />
  ),
};

export const Empty: Story = {
  render: () => (
    <DataTable columns={columns} data={[]} keyExtractor={(row: MockRow) => row.id} />
  ),
};

export const ManyRows: Story = {
  render: () => (
    <DataTable
      columns={columns}
      data={Array.from({ length: 10 }, (_, i) => ({
        id: `run-${String(i + 1).padStart(3, "0")}`,
        name: `Job ${i + 1}`,
        status: i % 3 === 0 ? "succeeded" : i % 3 === 1 ? "running" : "failed",
        created_at: new Date(Date.now() - i * 3600000).toISOString(),
      }))}
      keyExtractor={(row) => row.id}
    />
  ),
};
