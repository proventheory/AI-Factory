"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, CardSection, TableFrame, PageHeader, LoadingSkeleton, NumberTicker } from "@/components/ui";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { LineChart } from "@/components/charts/LineChart";
import { PieChart } from "@/components/charts/PieChart";
import { BarChart } from "@/components/charts/BarChart";
import { useRuns, useJobRuns } from "@/hooks/use-api";
import { useRunsOverTime, useRunStatusDistribution, useJobsByType } from "@/hooks/use-chart-data";
import { useEnvironment } from "@/contexts/EnvironmentContext";
import { formatApiError } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type Lease = { job_run_id: string; worker_id: string; heartbeat_at: string };
type TimeRange = "7d" | "30d" | "90d";

type DriftData = {
  environment: string;
  window_minutes: number;
  canary_success_rate: number;
  control_success_rate: number;
  success_rate_delta: number;
  canary_new_signatures: string[];
  should_rollback: boolean;
  drift_pass: boolean;
} | null;

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm px-4 py-4 md:px-6">
      <p className="text-caption text-text-muted">{label}</p>
      <p className="mt-1 text-heading-3 font-semibold text-text-primary">
        <NumberTicker value={value} />
      </p>
    </div>
  );
}

function ChartSkeleton() {
  return <LoadingSkeleton className="h-[280px] rounded-lg" />;
}

export default function DashboardPage() {
  const { environment, setEnvironment } = useEnvironment();
  const [timeRange, setTimeRange] = useState<TimeRange>("30d");

  const { data: allRunsData, isLoading: allRunsLoading } = useRuns({ limit: 500, environment });
  const { data: runsData, isLoading: runsLoading, error: runsError } = useRuns({ status: "failed", limit: 10, environment });
  const { data: jobRunsData, isLoading: jobRunsLoading } = useJobRuns({ limit: 500, environment });

  const allRuns = allRunsData?.items;
  const failedRuns = runsData?.items ?? [];
  const jobRuns = jobRunsData?.items;

  const runsOverTime = useRunsOverTime(allRuns, timeRange);
  const statusDistribution = useRunStatusDistribution(allRuns);
  const jobsByType = useJobsByType(jobRuns);

  const [dashboardData, setDashboardData] = useState<{ stale_leases?: number; queue_depth?: number; workers_alive?: number } | null>(null);
  const [driftData, setDriftData] = useState<DriftData>(null);
  const [leases, setLeases] = useState<Lease[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/v1/dashboard`).then((r) => r.json()).then(setDashboardData).catch((e) => setError(formatApiError(e)));
  }, []);
  useEffect(() => {
    fetch(`${API}/v1/dashboard/drift?environment=${encodeURIComponent(environment)}&window_minutes=60`)
      .then((r) => r.json())
      .then(setDriftData)
      .catch(() => setDriftData(null));
  }, [environment]);
  useEffect(() => {
    fetch(`${API}/v1/health`).then((r) => r.json()).then((d: { active_leases?: Lease[] }) => setLeases(d.active_leases ?? [])).catch(() => {});
  }, []);

  const data = dashboardData;
  const loading = !data && !error;
  const chartsLoading = allRunsLoading || jobRunsLoading;
  const displayError = error ?? (runsError ? formatApiError(runsError) : null);

  if (displayError) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Overview" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">
            {displayError}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (loading) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Overview" description="Scheduler and pipeline health at a glance." />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <LoadingSkeleton className="h-20 rounded-lg" />
            <LoadingSkeleton className="h-20 rounded-lg" />
            <LoadingSkeleton className="h-20 rounded-lg" />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <LoadingSkeleton className="h-64 rounded-lg" />
            <LoadingSkeleton className="h-64 rounded-lg" />
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Overview" description="Scheduler and pipeline health at a glance." />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/health" className="text-brand-600 hover:underline">Scheduler Health</Link> · <Link href="/runs" className="text-brand-600 hover:underline">Pipeline Runs</Link> · <Link href="/planner" className="text-brand-600 hover:underline">Planner</Link> · <Link href="/graph/explorer" className="text-brand-600 hover:underline">Graph Explorer</Link> · <Link href="/operator-guide" className="text-brand-600 hover:underline">How it works</Link>
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Stale leases" value={data?.stale_leases ?? 0} />
          <StatCard label="Queue depth (1h)" value={data?.queue_depth ?? 0} />
          <StatCard label="Workers alive" value={data?.workers_alive ?? 0} />
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm px-4 py-4 md:px-6">
            <p className="text-caption text-text-muted">Canary drift</p>
            <div className="mt-1 flex items-center gap-2">
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value as "sandbox" | "staging" | "prod")}
                className="rounded border border-slate-200 bg-white px-2 py-0.5 text-caption text-text-primary"
              >
                <option value="sandbox">sandbox</option>
                <option value="staging">staging</option>
                <option value="prod">prod</option>
              </select>
              {driftData ? (
                <span className={`text-heading-3 font-semibold ${driftData.drift_pass ? "text-state-success" : "text-state-danger"}`}>
                  {driftData.drift_pass ? "PASS" : "FAIL"}
                </span>
              ) : (
                <span className="text-body-small text-text-muted">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Canary vs control chart (runs success) */}
        {driftData != null && (
          <Card>
            <CardHeader>
              <h3 className="text-body font-medium text-text-primary">Runs success: canary vs control ({driftData.environment}, last {driftData.window_minutes}m)</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-body-small">
                <div>
                  <p className="text-text-muted">Canary success rate</p>
                  <p className="text-heading-3 font-semibold text-text-primary">{Math.round(driftData.canary_success_rate * 100)}%</p>
                </div>
                <div>
                  <p className="text-text-muted">Control success rate</p>
                  <p className="text-heading-3 font-semibold text-text-primary">{Math.round(driftData.control_success_rate * 100)}%</p>
                </div>
                <div>
                  <p className="text-text-muted">Delta</p>
                  <p className={`font-semibold ${driftData.success_rate_delta >= 0 ? "text-state-success" : "text-state-danger"}`}>
                    {(driftData.success_rate_delta >= 0 ? "+" : "") + (driftData.success_rate_delta * 100).toFixed(1)}%
                  </p>
                </div>
                {driftData.canary_new_signatures.length > 0 && (
                  <div className="col-span-2">
                    <p className="text-text-muted">Error signature divergence (new in canary)</p>
                    <p className="text-caption-small font-mono text-state-danger">{driftData.canary_new_signatures.slice(0, 5).join(", ")}{driftData.canary_new_signatures.length > 5 ? "…" : ""}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Time range selector */}
        <div className="flex items-center gap-2">
          <label htmlFor="chart-range" className="text-body-small text-text-muted">
            Time range
          </label>
          <select
            id="chart-range"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-body-small text-text-primary shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="text-body font-medium text-text-primary">Runs over time</h3>
            </CardHeader>
            <CardContent>
              {chartsLoading ? (
                <ChartSkeleton />
              ) : (
                <LineChart
                  data={runsOverTime}
                  xAxisKey="date"
                  dataKeys={["count"]}
                  minHeight={240}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-body font-medium text-text-primary">Run status distribution</h3>
            </CardHeader>
            <CardContent>
              {chartsLoading ? (
                <ChartSkeleton />
              ) : statusDistribution.length === 0 ? (
                <p className="flex h-[240px] items-center justify-center text-body-small text-text-muted">No data</p>
              ) : (
                <PieChart
                  data={statusDistribution}
                  minHeight={240}
                  innerRadius={50}
                />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <h3 className="text-body font-medium text-text-primary">Jobs by type</h3>
            </CardHeader>
            <CardContent>
              {chartsLoading ? (
                <ChartSkeleton />
              ) : jobsByType.length === 0 ? (
                <p className="flex h-[240px] items-center justify-center text-body-small text-text-muted">No data</p>
              ) : (
                <BarChart
                  data={jobsByType}
                  xAxisKey="type"
                  dataKeys={["count"]}
                  minHeight={240}
                />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Tables */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CardSection title="Active leases">
            {leases.length === 0 ? (
              <p className="text-body-small text-text-muted">No active leases.</p>
            ) : (
              <TableFrame>
                <table className="w-full text-body-small">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="pb-2 pr-4">Job run</th>
                      <th className="pb-2 pr-4">Worker</th>
                      <th className="pb-2">Heartbeat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leases.slice(0, 10).map((l) => (
                      <tr key={l.job_run_id} className="border-t border-border-subtle">
                        <td className="py-2 font-mono text-caption-small">{l.job_run_id.slice(0, 8)}…</td>
                        <td className="py-2">{l.worker_id}</td>
                        <td className="py-2">{new Date(l.heartbeat_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </CardSection>
          <CardSection title="Recent failed runs">
            {failedRuns.length === 0 ? (
              <p className="text-body-small text-text-muted">No recent failures.</p>
            ) : (
              <TableFrame>
                <table className="w-full text-body-small">
                  <thead>
                    <tr className="text-left text-text-muted">
                      <th className="pb-2 pr-4">Run</th>
                      <th className="pb-2 pr-4">Env</th>
                      <th className="pb-2">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedRuns.map((r) => (
                      <tr key={r.id} className="border-t border-border-subtle">
                        <td className="py-2 font-mono text-caption-small">
                          <Link href={`/runs/${r.id}`} className="text-brand-600 hover:underline">
                            {r.id.slice(0, 8)}…
                          </Link>
                        </td>
                        <td className="py-2">{r.environment}</td>
                        <td className="max-w-[180px] truncate py-2" title={r.top_error_signature ?? ""}>
                          {r.top_error_signature ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableFrame>
            )}
          </CardSection>
        </div>
      </Stack>
    </PageFrame>
  );
}
