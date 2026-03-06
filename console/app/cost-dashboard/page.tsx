"use client";

import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton } from "@/components/ui";
import { useUsage, useUsageByJobType } from "@/hooks/use-api";

export default function CostDashboardPage() {
  const { data: usageData, isLoading: usageLoading } = useUsage();
  const { data: byJobData, isLoading: byJobLoading } = useUsageByJobType({});

  const isLoading = usageLoading || byJobLoading;
  const hasUsage = (usageData?.totals?.calls ?? 0) > 0 || (byJobData?.items?.length ?? 0) > 0;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Cost Dashboard"
          description="LLM usage and cost by job type and model. Tracks credits only when runs execute LLM-backed nodes (e.g. email generation, copy, plan compile)."
        />
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-body-small text-slate-700">
          <strong>What is tracked here:</strong> Only runs that execute nodes which call the LLM (email campaigns, copywriting, deck/report generation, etc.) insert into <code className="rounded bg-slate-200 px-1">llm_calls</code>. &quot;Prefill from URL&quot; (brand tokenizer) does <strong>not</strong> use the LLM—it fetches and parses HTML—so it uses no credits. &quot;Error count&quot; is failed <em>job runs</em> in the period, not failed LLM calls.
        </div>
        {!hasUsage && !isLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-body-small text-amber-900">
            <strong>Seeing zero usage?</strong> Usage appears when the <strong>runner</strong> processes jobs that call the LLM and writes to the same database as the Control Plane. Check that the runner has <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> (same as Control Plane), <code className="rounded bg-amber-100 px-1">LLM_GATEWAY_URL</code> or <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> set, and that you have run initiatives that trigger LLM nodes (e.g. start an email campaign run).
          </div>
        )}
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
