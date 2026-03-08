"use client";

import Link from "next/link";
import { useState } from "react";
import { PageFrame, Stack, PageHeader, TableFrame, DataTable, Button, EmptyState, LoadingSkeleton } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useEmailCampaigns, useCreateEmailCampaign } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function LandingPageGeneratorPage() {
  const { data, isLoading, error } = useEmailCampaigns({ limit: 100, campaign_kind: "landing_page" });
  const createCampaign = useCreateEmailCampaign();
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createCampaign.mutateAsync({ title: "New landing page", metadata_json: { campaign_kind: "landing_page" } });
    } finally {
      setCreating(false);
    }
  };

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Landing Page Generator" />
          <p className="text-state-danger">Error: {formatApiError(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  const items = data?.items ?? [];
  const columns: Column<(typeof items)[0]>[] = [
    { key: "title", header: "Title", render: (r) => (r.title ? <Link href={`/initiatives/${r.id}`} className="text-brand-600 hover:underline font-medium">{r.title}</Link> : "—") },
    { key: "subject_line", header: "Subject", render: (r) => r.subject_line ?? "—" },
    { key: "created_at", header: "Created", render: (r) => new Date(r.created_at).toLocaleString() },
    {
      key: "id",
      header: "Actions",
      render: (r) => (
        <>
          <Link href={`/email-marketing/campaigns/${r.id}/edit`} className="text-body-small text-brand-600 hover:underline mr-3">
            Edit
          </Link>
          <Link href={`/initiatives/${r.id}`} className="text-body-small text-brand-600 hover:underline">
            Open initiative
          </Link>
        </>
      ),
    },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Landing Page Generator"
          description="Create landing pages from brand, template, and content. Same flow as Email Design Generator for now; workflow will use pre-built landing page templates next."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : items.length === 0 ? (
          <EmptyState
            title="No landing page campaigns yet"
            description="Create a landing page via the wizard (brand → template → content → generate). We will switch to pre-built landing page templates and a dedicated workflow next."
            action={
              <div className="flex gap-2">
                <Button variant="primary" asChild>
                  <Link href="/landing-page-generator/new">New landing page (wizard)</Link>
                </Button>
                <Button
                  variant="secondary"
                  disabled={creating || createCampaign.isPending}
                  onClick={handleCreate}
                >
                  {creating || createCampaign.isPending ? "Creating…" : "Quick create"}
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <div className="flex justify-end gap-2 flex-wrap">
              <Button variant="primary" asChild>
                <Link href="/landing-page-generator/new">New landing page (wizard)</Link>
              </Button>
              <Button
                variant="secondary"
                disabled={creating || createCampaign.isPending}
                onClick={handleCreate}
              >
                {creating || createCampaign.isPending ? "Creating…" : "Quick create"}
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/runs?intent_type=email_design_generator">View pipeline runs</Link>
              </Button>
            </div>
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
            </TableFrame>
          </>
        )}
      </Stack>
    </PageFrame>
  );
}
