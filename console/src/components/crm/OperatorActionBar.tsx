"use client";

export function OperatorActionBar({ metrics }: { metrics: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border border-border-default bg-fill-subtle p-4">
      {metrics}
    </div>
  );
}
