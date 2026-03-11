"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, DataTable, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import type { WebhookOutboxRow } from "@/lib/api";
import { useWebhookOutbox } from "@/hooks/use-api";

export default function WebhookOutboxPage() {
  const { data, isLoading, error } = useWebhookOutbox({ limit: 50 });
  const items = data?.items ?? [];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Webhook Outbox" description="Delivery status and retry queue for webhooks." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {String(error)}. Ensure the webhook_outbox migration has been run.
          </div>
        </Stack>
      </PageFrame>
    );
  }

  const columns: Column<WebhookOutboxRow>[] = [
    { key: "id", header: "ID", render: (r) => r.id?.slice(0, 8) + "…" },
    { key: "event_type", header: "Event" },
    { key: "status", header: "Status" },
    { key: "attempt_count", header: "Attempts" },
    { key: "next_retry_at", header: "Next retry", render: (r) => r.next_retry_at ? new Date(r.next_retry_at).toLocaleString() : "—" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Webhook Outbox"
          description="Delivery status and retry queue for webhooks."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/self-heal" className="text-brand-600 hover:underline">Self-heal</Link> (GitHub webhook)
        </p>
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <CardSection>
            <EmptyState title="No webhook events" description="Webhook delivery events will appear here when outbox is used." />
          </CardSection>
        ) : (
          <CardSection>
          <TableFrame>
            <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
          </TableFrame>
          </CardSection>
        )}
      </Stack>
    </PageFrame>
  );
}
