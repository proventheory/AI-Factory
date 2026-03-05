"use client";

import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton } from "@/components/ui";
import { useUsage, useUsageByJobType } from "@/hooks/use-api";

export default function CostDashboardPage() {
  const { data: usageData, isLoading: usageLoading } = useUsage();
  const { data: byJobData, isLoading: byJobLoading } = useUsageByJobType({});

  const isLoading = usageLoading || byJobLoading;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Cost Dashboard"
          description="LLM usage and cost by job type and model."
        />
        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <CardSection title="Usage aggregate">
              <pre className="overflow-auto rounded bg-slate-100 p-4 text-sm">
                {usageData ? JSON.stringify(usageData, null, 2) : "No data"}
              </pre>
            </CardSection>
            <CardSection title="Usage by job type">
              <ul className="space-y-2">
                {byJobData?.items?.map((row) => (
                  <li key={row.job_type} className="flex justify-between text-sm">
                    <span>{row.job_type}</span>
                    <span>{row.calls} calls, {row.tokens_in + row.tokens_out} tokens</span>
                  </li>
                ))}
                {(!byJobData?.items?.length) && <li className="text-text-muted">No data</li>}
              </ul>
            </CardSection>
          </div>
        )}
      </Stack>
    </PageFrame>
  );
}
