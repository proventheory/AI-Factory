"use client";

import { useMemo } from "react";
import type { RunRow, JobRunRow } from "@/lib/api";

type TimeRange = "7d" | "30d" | "90d";

function daysFromRange(range: TimeRange): number {
  switch (range) {
    case "7d":
      return 7;
    case "30d":
      return 30;
    case "90d":
      return 90;
  }
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildDateRange(days: number): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    result.push(dateKey(d));
  }
  return result;
}

export function useRunsOverTime(
  runs: RunRow[] | undefined,
  range: TimeRange,
): { date: string; count: number }[] {
  return useMemo(() => {
    const days = daysFromRange(range);
    const dates = buildDateRange(days);
    const counts: Record<string, number> = {};
    for (const d of dates) counts[d] = 0;

    if (runs) {
      for (const r of runs) {
        const ts = r.started_at ?? r.finished_at;
        if (!ts) continue;
        const key = dateKey(new Date(ts));
        if (key in counts) counts[key]++;
      }
    }

    return dates.map((d) => ({ date: d, count: counts[d] }));
  }, [runs, range]);
}

export function useRunStatusDistribution(
  runs: RunRow[] | undefined,
): { name: string; value: number }[] {
  return useMemo(() => {
    if (!runs || runs.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const r of runs) {
      counts[r.status] = (counts[r.status] ?? 0) + 1;
    }
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [runs]);
}

export function useJobsByType(
  jobRuns: JobRunRow[] | undefined,
): { type: string; count: number }[] {
  return useMemo(() => {
    if (!jobRuns || jobRuns.length === 0) return [];
    const counts: Record<string, number> = {};
    for (const j of jobRuns) {
      const label = j.plan_node_id ?? "unknown";
      counts[label] = (counts[label] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [jobRuns]);
}
