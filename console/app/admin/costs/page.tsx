"use client";

import { useState, useMemo } from "react";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, DataTable, EmptyState, LoadingSkeleton, Badge, Input, Select, Button } from "@/components/ui";
import { Card, CardHeader, CardContent } from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useUsage, useLlmCalls, useUsageByJobType } from "@/hooks/use-api";
import type { LlmCallRow, UsageByJobType } from "@/lib/api";
import { AreaChart } from "@/components/charts";
import { BarChart } from "@/components/charts";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function AdminCostsPage() {
  const [tierFilter, setTierFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());
  const [jobTypeFilter, setJobTypeFilter] = useState<string>("");

  const { data: usageData, isLoading: usageLoading, error: usageError } = useUsage();
  const { data: callsData, isLoading: callsLoading } = useLlmCalls({ limit: 50, model_tier: tierFilter || undefined });
  const { data: byJobType } = useUsageByJobType({ from: dateFrom, to: dateTo });

  const filteredJobTypes = jobTypeFilter
    ? byJobType?.items?.filter((r: UsageByJobType) => r.job_type.includes(jobTypeFilter))
    : byJobType?.items;

  const costOverTimeData = useMemo(() => {
    if (!callsData?.items?.length) return [];
    const buckets: Record<string, { date: string; tokens_in: number; tokens_out: number; calls: number }> = {};
    for (const call of callsData.items) {
      const day = new Date(call.created_at).toISOString().slice(0, 10);
      if (!buckets[day]) buckets[day] = { date: day, tokens_in: 0, tokens_out: 0, calls: 0 };
      buckets[day].tokens_in += call.tokens_in ?? 0;
      buckets[day].tokens_out += call.tokens_out ?? 0;
      buckets[day].calls += 1;
    }
    return Object.values(buckets).sort((a, b) => a.date.localeCompare(b.date));
  }, [callsData]);

  const costByModelData = useMemo(() => {
    if (!usageData?.by_tier?.length) return [];
    return usageData.by_tier.map((t: { model_tier: string; calls: number; tokens_in: number; tokens_out: number }) => ({
      model: t.model_tier,
      tokens_in: Number(t.tokens_in),
      tokens_out: Number(t.tokens_out),
      calls: t.calls,
    }));
  }, [usageData]);

  const columns: Column<LlmCallRow>[] = [
    { key: "id", header: "ID", render: (row) => <span className="font-mono text-caption-small">{String(row.id).slice(0, 8)}…</span> },
    { key: "model_tier", header: "Tier", render: (row) => <Badge variant="neutral">{row.model_tier}</Badge> },
    { key: "model_id", header: "Model" },
    { key: "tokens_in", header: "In", render: (row) => row.tokens_in?.toLocaleString() ?? "—" },
    { key: "tokens_out", header: "Out", render: (row) => row.tokens_out?.toLocaleString() ?? "—" },
    { key: "latency_ms", header: "Latency", render: (row) => row.latency_ms ? `${row.latency_ms}ms` : "—" },
    { key: "created_at", header: "Time", render: (row) => new Date(row.created_at).toLocaleString() },
  ];

  const jobTypeColumns: Column<UsageByJobType>[] = [
    { key: "job_type", header: "Job Type", render: (row) => <Badge variant="neutral">{row.job_type}</Badge> },
    { key: "calls", header: "Calls", render: (row) => row.calls.toLocaleString() },
    { key: "tokens_in", header: "Tokens In", render: (row) => Number(row.tokens_in).toLocaleString() },
    { key: "tokens_out", header: "Tokens Out", render: (row) => Number(row.tokens_out).toLocaleString() },
    { key: "avg_latency_ms", header: "Avg Latency", render: (row) => `${row.avg_latency_ms}ms` },
  ];

  const percentiles = (usageData as Record<string, unknown>)?.percentiles as { p50_latency_ms?: number; p95_latency_ms?: number } | undefined;

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Cost / Usage" description="LLM call usage, token aggregates, and cost breakdown." />

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-caption-small text-text-muted mb-1">From</label>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="block text-caption-small text-text-muted mb-1">To</label>
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="block text-caption-small text-text-muted mb-1">Job Type</label>
            <Input value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)} placeholder="Filter…" className="w-40" />
          </div>
          {(tierFilter || jobTypeFilter) && (
            <Button variant="ghost" onClick={() => { setTierFilter(""); setJobTypeFilter(""); }}>Clear filters</Button>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">Token Usage Over Time</h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              {callsLoading ? (
                <LoadingSkeleton className="h-64 w-full rounded-md" />
              ) : costOverTimeData.length > 0 ? (
                <AreaChart
                  data={costOverTimeData}
                  xAxisKey="date"
                  dataKeys={["tokens_in", "tokens_out"]}
                  stacked
                  minHeight={280}
                />
              ) : (
                <EmptyState title="No time-series data yet." />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">Usage by Model Tier</h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              {usageLoading ? (
                <LoadingSkeleton className="h-64 w-full rounded-md" />
              ) : costByModelData.length > 0 ? (
                <BarChart
                  data={costByModelData}
                  xAxisKey="model"
                  dataKeys={["tokens_in", "tokens_out"]}
                  stacked
                  showLegend
                  minHeight={280}
                />
              ) : (
                <EmptyState title="No model tier data yet." />
              )}
            </CardContent>
          </Card>
        </div>

        <CardSection title="Usage by tier">
          {usageLoading || usageError ? (
            usageError ? (
              <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{(usageError as Error).message}</div>
            ) : (
              <LoadingSkeleton className="h-32 w-full rounded-md" />
            )
          ) : usageData?.by_tier && usageData.by_tier.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {usageData.by_tier.map((t: { model_tier: string; calls: number; tokens_in: number; tokens_out: number; avg_latency_ms: number }) => (
                <button
                  key={t.model_tier}
                  onClick={() => setTierFilter(tierFilter === t.model_tier ? "" : t.model_tier)}
                  className={`rounded-lg border p-4 text-left transition-colors ${tierFilter === t.model_tier ? "border-brand-600 bg-brand-50" : "border-border-subtle bg-surface-base hover:border-brand-300"}`}
                >
                  <div className="text-subheading font-medium text-text-primary">{t.model_tier}</div>
                  <div className="mt-2 text-body-small text-text-secondary">
                    {t.calls} calls · {Number(t.tokens_in).toLocaleString()} in · {Number(t.tokens_out).toLocaleString()} out · avg {t.avg_latency_ms}ms
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="No LLM calls recorded yet." />
          )}
          {usageData?.totals && (usageData.totals.calls > 0) && (
            <div className="mt-4 border-t border-border-subtle pt-4 text-body-small text-text-secondary">
              Total: {usageData.totals.calls} calls · {Number(usageData.totals.tokens_in).toLocaleString()} in · {Number(usageData.totals.tokens_out).toLocaleString()} out
              {percentiles && <span> · p50 {percentiles.p50_latency_ms}ms · p95 {percentiles.p95_latency_ms}ms</span>}
            </div>
          )}
        </CardSection>

        {filteredJobTypes && filteredJobTypes.length > 0 && (
          <CardSection title="Usage by job type">
            <TableFrame>
              <DataTable columns={jobTypeColumns} data={filteredJobTypes} keyExtractor={(row) => row.job_type} />
            </TableFrame>
          </CardSection>
        )}

        <CardSection title={`Recent LLM calls${tierFilter ? ` (${tierFilter})` : ""}`}>
          {callsLoading ? (
            <LoadingSkeleton className="h-64 w-full rounded-md" />
          ) : callsData?.items && callsData.items.length > 0 ? (
            <TableFrame>
              <DataTable columns={columns} data={callsData.items} keyExtractor={(row) => row.id} />
            </TableFrame>
          ) : (
            <EmptyState title="No LLM calls yet." />
          )}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
