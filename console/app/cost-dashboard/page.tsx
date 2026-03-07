"use client";

import { useState } from "react";
import {
  PageFrame,
  Stack,
  CardSection,
  PageHeader,
  LoadingSkeleton,
  Badge,
  Input,
  Card,
  CardHeader,
  CardContent,
  EmptyState,
} from "@/components/ui";
import { useUsage, useUsageByJobType } from "@/hooks/use-api";
import { BarChart } from "@/components/charts";
import type { UsageByProvider, UsageByModel } from "@/lib/api";

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}
function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

function providerBadgeVariant(provider: string): "info" | "neutral" | "success" {
  if (provider === "OpenAI") return "info";
  if (provider === "Anthropic") return "success";
  return "neutral";
}

export default function CostDashboardPage() {
  const [dateFrom, setDateFrom] = useState(defaultFrom());
  const [dateTo, setDateTo] = useState(defaultTo());

  const fromIso = `${dateFrom}T00:00:00.000Z`;
  const toIso = `${dateTo}T23:59:59.999Z`;

  const { data: usageData, isLoading: usageLoading } = useUsage({ from: fromIso, to: toIso });
  const { data: byJobData, isLoading: byJobLoading } = useUsageByJobType({ from: fromIso, to: toIso });

  const isLoading = usageLoading || byJobLoading;
  const hasUsage = (usageData?.totals?.calls ?? 0) > 0 || (byJobData?.items?.length ?? 0) > 0;
  const byProvider = usageData?.by_provider ?? [];
  const byModel = usageData?.by_model ?? [];
  const totals = usageData?.totals;
  const estimatedCost = totals?.estimated_cost_usd ?? 0;
  const totalCalls = totals?.calls ?? 0;
  const totalTokens = (Number(totals?.tokens_in) || 0) + (Number(totals?.tokens_out) || 0);
  const errorCount = usageData?.error_count ?? 0;
  const percentiles = usageData?.percentiles;

  const providerChartData = byProvider.map((p: UsageByProvider) => ({
    provider: p.provider,
    "Est. cost ($)": p.estimated_cost_usd,
    calls: p.calls,
  }));

  const jobTypeChartData = (byJobData?.items ?? []).map((row) => ({
    job_type: row.job_type,
    tokens: Number(row.tokens_in) + Number(row.tokens_out),
    calls: row.calls,
  }));

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Cost Dashboard"
          description="LLM usage and cost by job type and model. Tracks credits only when runs execute LLM-backed nodes (e.g. email generation, copy, plan compile)."
        />
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-body-small text-slate-700">
          <strong>What is tracked here:</strong> Only runs that execute nodes which call the LLM (email campaigns, copywriting, deck/report generation, etc.) insert into{" "}
          <code className="rounded bg-slate-200 px-1">llm_calls</code>. &quot;Prefill from URL&quot; (brand tokenizer) does <strong>not</strong> use the LLM—it fetches and parses HTML—so it uses no credits. &quot;Error count&quot; is failed <em>job runs</em> in the period, not failed LLM calls. <strong>Estimated cost</strong> is computed from token counts and published list prices (OpenAI / Anthropic) and may differ from your actual bill.
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-caption-small text-text-muted mb-1">From</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div>
            <label className="block text-caption-small text-text-muted mb-1">To</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
        </div>

        {!hasUsage && !isLoading && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-body-small text-amber-900">
            <strong>Seeing zero usage?</strong> Usage appears when the <strong>runner</strong> processes jobs that call the LLM and writes to the same database as the Control Plane. Check that the runner has <code className="rounded bg-amber-100 px-1">DATABASE_URL</code> (same as Control Plane), <code className="rounded bg-amber-100 px-1">LLM_GATEWAY_URL</code> or <code className="rounded bg-amber-100 px-1">OPENAI_API_KEY</code> set, and that you have run initiatives that trigger LLM nodes (e.g. start an email campaign run).
          </div>
        )}

        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-4">
                  <p className="text-caption-small text-text-muted">Estimated spend</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">
                    ${estimatedCost.toFixed(2)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-caption-small text-text-muted">LLM calls</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{totalCalls.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-caption-small text-text-muted">Total tokens</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{totalTokens.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <p className="text-caption-small text-text-muted">Failed job runs</p>
                  <p className="mt-1 text-2xl font-semibold text-text-primary">{errorCount}</p>
                </CardContent>
              </Card>
            </div>

            {/* By provider (OpenAI / Anthropic / Other) */}
            <CardSection title="Usage by provider">
              {byProvider.length === 0 ? (
                <EmptyState title="No provider data in this period." />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {byProvider.map((row: UsageByProvider) => (
                      <Card key={row.provider}>
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between">
                            <Badge variant={providerBadgeVariant(row.provider)}>{row.provider}</Badge>
                            <span className="text-lg font-semibold text-text-primary">${row.estimated_cost_usd.toFixed(2)}</span>
                          </div>
                          <p className="mt-2 text-body-small text-text-secondary">
                            {row.calls} calls · {(row.tokens_in + row.tokens_out).toLocaleString()} tokens
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  {providerChartData.length > 0 && (
                    <div className="h-[240px] w-full">
                      <BarChart
                        data={providerChartData}
                        xAxisKey="provider"
                        dataKeys={["Est. cost ($)"]}
                        showLegend={false}
                        minHeight={220}
                      />
                    </div>
                  )}
                </div>
              )}
            </CardSection>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Usage by job type */}
              <CardSection title="Usage by job type">
                {!byJobData?.items?.length ? (
                  <EmptyState title="No job type data in this period." />
                ) : (
                  <div className="space-y-4">
                    <ul className="space-y-2">
                      {byJobData.items.map((row) => (
                        <li key={row.job_type} className="flex justify-between items-center text-sm">
                          <span className="font-medium text-text-primary">{row.job_type}</span>
                          <span className="text-text-secondary">
                            {row.calls} calls · {(Number(row.tokens_in) + Number(row.tokens_out)).toLocaleString()} tokens
                          </span>
                        </li>
                      ))}
                    </ul>
                    {jobTypeChartData.length > 0 && (
                      <div className="h-[200px] w-full">
                        <BarChart
                          data={jobTypeChartData}
                          xAxisKey="job_type"
                          dataKeys={["tokens"]}
                          showLegend={false}
                          minHeight={180}
                        />
                      </div>
                    )}
                  </div>
                )}
              </CardSection>

              {/* By model (agent / model id + cost) */}
              <CardSection title="Usage by model">
                {byModel.length === 0 ? (
                  <EmptyState title="No model data in this period." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle text-left text-caption-small text-text-muted">
                          <th className="pb-2 pr-2">Provider</th>
                          <th className="pb-2 pr-2">Model</th>
                          <th className="pb-2 pr-2 text-right">Calls</th>
                          <th className="pb-2 pr-2 text-right">Est. cost</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(byModel as UsageByModel[]).map((row) => (
                          <tr key={`${row.model_tier}-${row.model_id}`} className="border-b border-border-subtle/50">
                            <td className="py-2 pr-2">
                              <Badge variant={providerBadgeVariant(row.provider)}>{row.provider}</Badge>
                            </td>
                            <td className="py-2 pr-2 font-mono text-caption-small">{row.model_id}</td>
                            <td className="py-2 pr-2 text-right">{row.calls.toLocaleString()}</td>
                            <td className="py-2 pr-2 text-right font-medium">${row.estimated_cost_usd.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardSection>
            </div>

            {/* Latency summary */}
            {percentiles && (percentiles.p50_latency_ms > 0 || percentiles.p95_latency_ms > 0) && (
              <CardSection title="Latency">
                <p className="text-body-small text-text-secondary">
                  p50: {percentiles.p50_latency_ms}ms · p95: {percentiles.p95_latency_ms}ms
                </p>
              </CardSection>
            )}
          </>
        )}
      </Stack>
    </PageFrame>
  );
}
