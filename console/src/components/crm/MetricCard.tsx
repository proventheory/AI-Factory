"use client";

export function MetricCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div className="rounded border border-border-default bg-fill-default px-4 py-2">
      <div className="text-body-small text-text-muted">{label}</div>
      <div className="text-heading-4 font-semibold text-text-primary">{value}</div>
      {sublabel && <div className="text-caption-small text-text-muted">{sublabel}</div>}
    </div>
  );
}
