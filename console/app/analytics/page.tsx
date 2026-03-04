"use client";

import dynamic from "next/dynamic";
import { PageFrame, Stack, PageHeader, LoadingSkeleton } from "@/components/ui";
import { Card, CardHeader, CardContent } from "@/components/ui";

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

const HOURS = ["00", "02", "04", "06", "08", "10", "12", "14", "16", "18", "20", "22"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const heatmapData = DAYS.map((day) => ({
  id: day,
  data: HOURS.map((hour) => ({
    x: hour,
    y: Math.floor(Math.random() * 40),
  })),
}));

const treemapData = {
  name: "Costs",
  children: [
    {
      name: "GPT-4o",
      children: [
        { name: "Summarisation", value: 420 },
        { name: "Classification", value: 310 },
        { name: "Extraction", value: 180 },
      ],
    },
    {
      name: "Claude 3.5",
      children: [
        { name: "Code-gen", value: 560 },
        { name: "Review", value: 220 },
      ],
    },
    {
      name: "Mistral",
      children: [
        { name: "Chat", value: 140 },
        { name: "Routing", value: 90 },
      ],
    },
    {
      name: "Embedding",
      children: [
        { name: "Search", value: 75 },
        { name: "RAG index", value: 60 },
      ],
    },
  ],
};

const sunburstData = {
  name: "Artifacts",
  children: [
    {
      name: "Prompts",
      children: [
        { name: "System", value: 35 },
        { name: "User templates", value: 22 },
        { name: "Few-shot", value: 14 },
      ],
    },
    {
      name: "Configs",
      children: [
        { name: "Model params", value: 18 },
        { name: "Guard-rails", value: 12 },
        { name: "Routing rules", value: 9 },
      ],
    },
    {
      name: "Evaluations",
      children: [
        { name: "Golden sets", value: 26 },
        { name: "Human reviews", value: 15 },
        { name: "Auto-evals", value: 20 },
      ],
    },
    {
      name: "Datasets",
      children: [
        { name: "Training", value: 30 },
        { name: "Validation", value: 10 },
      ],
    },
  ],
};

export default function AnalyticsPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Analytics"
          description="Visual breakdown of run activity, cost distribution, and artifact composition."
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Run Activity Heatmap
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <HeatmapChart data={heatmapData} minHeight={420} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Cost Treemap
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <TreemapChart data={treemapData} minHeight={420} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="px-4 py-3 md:px-6">
              <h2 className="text-subheading font-medium text-text-primary">
                Artifact Breakdown
              </h2>
            </CardHeader>
            <CardContent className="px-4 py-4 md:px-6">
              <SunburstChart data={sunburstData} minHeight={420} />
            </CardContent>
          </Card>
        </div>
      </Stack>
    </PageFrame>
  );
}
