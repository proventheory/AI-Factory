"use client";

export type FilterChip = {
  key: string;
  label: string;
  value: string;
  onRemove?: () => void;
};

export interface FilterBarProps {
  chips: FilterChip[];
  onClearAll?: () => void;
  children?: React.ReactNode;
  className?: string;
}

export function FilterBar({ chips, onClearAll, children, className = "" }: FilterBarProps) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
        >
          <span className="font-medium">{chip.label}:</span>
          <span>{chip.value}</span>
          {chip.onRemove && (
            <button
              type="button"
              onClick={chip.onRemove}
              className="ml-1 rounded-full p-0.5 hover:bg-slate-200"
              aria-label={`Remove ${chip.label} filter`}
            >
              ×
            </button>
          )}
        </span>
      ))}
      {chips.length > 0 && onClearAll && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-sm text-slate-500 hover:text-slate-700"
        >
          Clear all
        </button>
      )}
      {children}
    </div>
  );
}
