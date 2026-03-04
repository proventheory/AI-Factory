"use client";

export interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, className = "" }: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg border border-dashed border-border-default bg-surface-sunken/50 px-6 py-12 text-center ${className}`}
    >
      <p className="font-medium text-text-primary">{title}</p>
      {description && <p className="mt-1 text-body-small text-text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
