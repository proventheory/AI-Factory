"use client";

import dynamic from "next/dynamic";
import { PageFrame, Stack, PageHeader, LoadingSkeleton } from "@/components/ui";
import { Card, CardHeader, CardContent } from "@/components/ui";
import { useAnalytics } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

const HeatmapChart = dynamic(
  () => import("@/components/charts/nivo/HeatmapChart").then((m) => m.HeatmapChart),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[420px] w-full rounded-md" /> },
);

const TreemapChart = dynamic(
  () => import("@/components/charts/nivo/TreemapChart").then((m) => m.TreemapChart),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[420px] w-full rounded-md" /> },
);

const SunburstChart = dynamic(
  () => import("@/components/charts/nivo/SunburstChart").then((m) => m.SunburstChart),
  { ssr: false, loading: () => <LoadingSkeleton className="h-[420px] w-full rounded-md" /> },
);

export default function AnalyticsPage() {
  const { data, isLoading, error } = useAnalytics({});

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Analytics" />
          <p className="text-state-danger">Error: {formatApiError(error)}</p>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading || !data) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Analytics" description="Visual breakdown of run activity, cost distribution, and artifact composition." />
          <LoadingSkeleton className="h-[420px] w-full rounded-lg" />
        </Stack>
      </PageFrame>
    );
  }

  const { run_activity_heatmap, cost_treemap, artifact_breakdown, from, to } = data;
  const fromDate = from ? new Date(from).toLocaleDateString() : "";
  const toDate = to ? new Date(to).toLocaleDateString() : "";

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Analytics"
          description={`Run activity, cost by model/job type, and artifact breakdown (${fromDate} – ${toDate}). Data from Control Plane.`}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Run Activity Heatmap
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <HeatmapChart data={run_activity_heatmap} minHeight={420} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Cost Treemap (tokens by model tier and job type)
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <TreemapChart data={cost_treemap} minHeight={420} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Artifact Breakdown
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <SunburstChart data={artifact_breakdown} minHeight={420} />
            </CardContent>
          </Card>
        </div>
      </Stack>
    </PageFrame>
  );
}
