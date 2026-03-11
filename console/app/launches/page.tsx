"use client";

import Link from "next/link";
import { useState } from "react";
import { PageFrame, Stack, CardSection, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Input } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useLaunches } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";
import type { LaunchRow } from "@/lib/api";

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "domain_live" || status === "preview_deployed") return "success";
  if (status === "validation_failed" || status === "rollback_required") return "error";
  if (status === "preview_deploy_requested" || status === "domain_attach_requested") return "warning";
  return "neutral";
}

export default function LaunchesPage() {
  const [initiativeFilter, setInitiativeFilter] = useState("");
  const { data, isLoading, error } = useLaunches({
    initiative_id: initiativeFilter.trim() || undefined,
    limit: 100,
  });
  const items = (data?.items ?? []) as LaunchRow[];

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Launches" description="Launch kernel: build specs, deploy preview, domain, and validation." />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {formatApiError(error)}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  const columns: Column<LaunchRow>[] = [
    {
      key: "id",
      header: "Launch",
      render: (r) => (
        <Link href={`/launches/${r.id}`} className="text-brand-600 hover:underline font-mono text-sm">
          {r.id.slice(0, 8)}…
        </Link>
      ),
    },
    { key: "status", header: "Status", render: (r) => <Badge variant={statusVariant(r.status)}>{r.status}</Badge> },
    {
      key: "initiative_id",
      header: "Initiative",
      render: (r) => (
        <Link href={`/initiatives/${r.initiative_id}`} className="text-brand-600 hover:underline font-mono text-sm">
          {r.initiative_id.slice(0, 8)}…
        </Link>
      ),
    },
    {
      key: "deploy_url",
      header: "Deploy URL",
      render: (r) =>
        r.deploy_url ? (
          <a href={r.deploy_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate block max-w-xs">
            {r.deploy_url}
          </a>
        ) : (
          <span className="text-text-muted">—</span>
        ),
    },
    { key: "domain", header: "Domain", render: (r) => (r.domain ? <span className="font-mono text-sm">{r.domain}</span> : <span className="text-text-muted">—</span>) },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Launches"
          description="Launch kernel: build specs, static deploy, domain binding, and validation. Create a build spec from an initiative to get a launch."
          actions={<Link href="/initiatives" className="text-body-small text-brand-600 hover:underline">Initiatives →</Link>}
        />
        <CardSection>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-body-small text-text-muted">
              <span>Initiative ID</span>
              <Input placeholder="Filter by initiative ID" value={initiativeFilter} onChange={(e) => setInitiativeFilter(e.target.value)} className="w-64 font-mono text-sm" />
            </label>
          </div>
          {isLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No launches yet"
              description="Create a build spec from an initiative (initiative detail page or API) to create a launch. Then run a pipeline that produces a launch_artifact and trigger deploy preview."
              action={
                <Link href="/initiatives" className="inline-flex items-center gap-2 rounded-md bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600">
                  Go to Initiatives
                </Link>
              }
            />
          ) : (
            <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
