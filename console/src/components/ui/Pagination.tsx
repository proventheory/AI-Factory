"use client";

export interface PaginationProps {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  className?: string;
}

export function Pagination({ page, pageCount, onPageChange, className = "" }: PaginationProps) {
  if (pageCount <= 1) return null;
  return (
    <div className={`flex items-center gap-2 text-body-small ${className}`}>
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded border border-border-default bg-fill-subtle px-3 py-1.5 disabled:opacity-50 hover:bg-fill-muted"
      >
        Previous
      </button>
      <span className="text-text-muted">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        className="rounded border border-border-default bg-fill-subtle px-3 py-1.5 disabled:opacity-50 hover:bg-fill-muted"
      >
        Next
      </button>
    </div>
  );
}
