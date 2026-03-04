"use client";

export function Panel({
  title,
  children,
  className = "",
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-lg border border-slate-200 bg-white ${className}`}>
      {title && (
        <div className="border-b border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">
          {title}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
