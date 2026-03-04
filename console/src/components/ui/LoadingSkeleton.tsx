"use client";

export function LoadingSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden />
  );
}

export function PageLoadingSkeleton() {
  return (
    <div className="space-y-4 p-4">
      <LoadingSkeleton className="h-8 w-48" />
      <LoadingSkeleton className="h-4 w-full" />
      <LoadingSkeleton className="h-4 w-full" />
      <LoadingSkeleton className="h-4 w-3/4" />
      <div className="grid grid-cols-3 gap-4 pt-4">
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-24" />
        <LoadingSkeleton className="h-24" />
      </div>
    </div>
  );
}
