"use client";

import Link from "next/link";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton } from "@/components/ui";
import { useRuns, useJobRuns, useInitiatives, usePendingApprovals } from "@/hooks/use-api";

export default function PlannerPage() {
  const { data: runsData, isLoading: runsLoading } = useRuns({ limit: 10 });
  const { data: jobRunsData, isLoading: jobsLoading } = useJobRuns({ limit: 15 });
  const { data: initiativesData, isLoading: initiativesLoading } = useInitiatives({ limit: 20 });
  const { data: pendingData, isLoading: pendingLoading } = usePendingApprovals();

  const runs = runsData?.items ?? [];
  const jobRuns = jobRunsData?.items ?? [];
  const initiatives = initiativesData?.items ?? [];
  const pending = pendingData?.items ?? [];

  const isLoading = runsLoading || jobsLoading || initiativesLoading || pendingLoading;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Planner"
          description="Upcoming runs, initiatives rollup, and approvals queue."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CardSection title="Upcoming / recent runs" className="md:col-span-2">
              <ul className="space-y-2">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/runs/${r.id}`} className="text-brand-600 hover:underline">
                      {r.id.slice(0, 8)}… — {r.status}
                    </Link>
                  </li>
                ))}
                {runs.length === 0 && <p className="text-text-muted text-sm">No runs.</p>}
              </ul>
              <Link href="/runs" className="mt-2 text-sm text-brand-600 hover:underline">
                View all runs →
              </Link>
            </CardSection>
            <CardSection title="Initiatives status">
              <p className="text-body-small text-text-muted">
                {initiatives.length} initiative(s)
              </p>
              <Link href="/initiatives" className="mt-2 text-sm text-brand-600 hover:underline">
                View initiatives →
              </Link>
            </CardSection>
            <CardSection title="Approvals queue">
              <p className="text-body-small text-text-muted">
                {pending.length} pending approval(s)
              </p>
              <Link href="/approvals" className="mt-2 text-sm text-brand-600 hover:underline">
                View approvals →
              </Link>
            </CardSection>
            <CardSection title="Recent job runs">
              <ul className="space-y-1 text-sm">
                {jobRuns.slice(0, 5).map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs`} className="text-brand-600 hover:underline">
                      {j.job_type} — {j.status}
                    </Link>
                  </li>
                ))}
                {jobRuns.length === 0 && <p className="text-text-muted">No job runs.</p>}
              </ul>
              <Link href="/jobs" className="mt-2 text-sm text-brand-600 hover:underline">
                View jobs →
              </Link>
            </CardSection>
          </div>
        )}
      </Stack>
    </PageFrame>
  );
}
