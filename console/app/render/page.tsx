"use client";

import Link from "next/link";
import {
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  LoadingSkeleton,
  EmptyState,
} from "@/components/ui";
import { useRenderStatus } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";
import type { RenderServiceStatus } from "@/lib/api";

function statusVariant(status: string): "success" | "danger" | "warning" | "muted" {
  const s = (status ?? "").toLowerCase();
  if (s === "live" || s === "deployed" || s === "succeeded") return "success";
  if (
    s === "failed" ||
    s === "canceled" ||
    s === "build_failed" ||
    s === "update_failed" ||
    s.includes("failed") ||
    s.includes("canceled")
  )
    return "danger";
  if (s === "building" || s === "build_in_progress" || s === "in_progress" || s.includes("progress"))
    return "warning";
  return "muted";
}

function ServiceCard({ s }: { s: RenderServiceStatus }) {
  const deploy = s.latestDeploy;
  const status = deploy?.status ?? "—";
  const variant = statusVariant(status);
  const updated = deploy?.updatedAt ? new Date(deploy.updatedAt).toLocaleString() : null;

  return (
    <a
      href={s.dashboardUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block rounded-xl border border-border-subtle bg-white p-4 shadow-sm transition hover:border-brand-500 hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-text-primary truncate">{s.name}</p>
          <p className="text-body-small text-text-muted mt-0.5">
            {s.environment === "prod" ? "Production" : "Staging"} · {s.id}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-caption-small font-medium
            ${variant === "success" ? "bg-state-successMuted text-state-success" : ""}
            ${variant === "danger" ? "bg-state-dangerMuted text-state-danger" : ""}
            ${variant === "warning" ? "bg-state-warningMuted text-state-warning" : ""}
            ${variant === "muted" ? "bg-surface-sunken text-text-muted" : ""}`}
        >
          {status}
        </span>
      </div>
      {updated && (
        <p className="text-caption-small text-text-muted mt-2">Updated {updated}</p>
      )}
      {deploy?.commit && (
        <p className="text-caption-small font-mono text-text-muted mt-1 truncate" title={deploy.commit}>
          {deploy.commit.slice(0, 7)}
        </p>
      )}
    </a>
  );
}

export default function RenderStatusPage() {
  const { data, isLoading, error, refetch, isRefetching } = useRenderStatus({
    refetchInterval: 60_000,
  });
  const services = data?.services ?? [];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Render status"
          description="Live deploy status for staging and production services. Data from the Control Plane (Render API)."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/self-heal" className="text-brand-600 hover:underline">Self-heal</Link>
          {" · "}
          <Link href="/graph/deploys" className="text-brand-600 hover:underline">Deploy events</Link>
          {" · "}
          <Link href="/incidents" className="text-brand-600 hover:underline">Incidents</Link>
        </p>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className="rounded-md border border-border-subtle bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm hover:bg-surface-sunken disabled:opacity-50"
          >
            {isRefetching ? "Refreshing…" : "Refresh"}
          </button>
          <span className="text-caption-small text-text-muted">Auto-refresh every 1 min</span>
        </div>
        {error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {formatApiError(error)}
          </div>
        )}
        <CardSection title="Services">
          {isLoading ? (
            <LoadingSkeleton className="h-48 rounded-lg" />
          ) : services.length === 0 ? (
            <EmptyState
              title="No Render services"
              description={data?.message ?? "Set RENDER_API_KEY and RENDER_STAGING_SERVICE_IDS (or RENDER_WORKER_SERVICE_ID) on the Control Plane to see staging status."}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {services.map((s) => (
                <ServiceCard key={s.id} s={s} />
              ))}
            </div>
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
