"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader } from "@/components/ui";
import { ADMIN_RESOURCES } from "@/lib/admin-registry";

export default function AdminIndexPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Admin"
          description="Generated CRUD for DB resources. Internal use only."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/mcp-servers" className="text-brand-600 hover:underline">MCP Servers</Link> · <Link href="/approvals" className="text-brand-600 hover:underline">Approvals</Link> · <Link href="/admin/permissions" className="text-brand-600 hover:underline">Permissions</Link>
        </p>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 md:grid-cols-3">
        {ADMIN_RESOURCES.map((r) => (
          <li key={r.key}>
            <Link
              href={`/admin/${r.key}`}
              className="block rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-body-default text-text-primary hover:bg-surface-sunken"
            >
              {r.label}
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/admin/costs"
            className="block rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-body-default text-text-primary hover:bg-surface-sunken"
          >
            Cost / Usage
          </Link>
        </li>
      </ul>
      </Stack>
    </PageFrame>
  );
}
