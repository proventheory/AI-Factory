"use client";

export interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className = "" }: PageHeaderProps) {
  return (
    <div className={`mb-6 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between ${className}`}>
      <div className="min-w-0">
        <h1 className="text-heading-2 font-bold text-text-primary">{title}</h1>
        {description && (
          <p className="mt-1 text-body-small text-text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="mt-2 flex shrink-0 items-center gap-2 sm:mt-0">{actions}</div>}
    </div>
  );
}
