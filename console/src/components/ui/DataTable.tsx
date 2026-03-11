"use client";

import { useRef, useEffect } from "react";
import { Checkbox } from "./Checkbox";

export type Column<T> = {
  key: string;
  /** Display as table header; use either header or label. */
  header?: string;
  label?: string;
  width?: string;
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
};

export type SelectionMode = "none" | "single" | "multiple";

export interface DataTableProps<T> {
  columns: Column<T>[];
  /** Row data; use either data or rows. */
  data?: T[];
  rows?: T[];
  /** Key for each row; use either keyExtractor or keyColumn (string key). Required when selectable. */
  keyExtractor?: (row: T) => string;
  keyColumn?: keyof T & string;
  onRowClick?: (row: T) => void;
  sortColumn?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  /** Row selection: multiple (checkboxes) or single (radio). */
  selectionMode?: SelectionMode;
  /** Controlled selected row keys (e.g. row id strings). */
  selectedRowKeys?: string[];
  /** Called when selection changes. */
  onSelectionChange?: (selectedKeys: string[]) => void;
  expandableRows?: boolean;
  renderExpand?: (row: T) => React.ReactNode;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  rows,
  keyExtractor,
  keyColumn,
  onRowClick,
  sortColumn,
  sortDirection,
  onSort,
  selectionMode = "none",
  selectedRowKeys = [],
  onSelectionChange,
  className = "",
}: DataTableProps<T>) {
  const tableData = data ?? rows ?? [];
  const getRowKey = keyExtractor ?? (keyColumn ? (row: T) => String((row as Record<string, unknown>)[keyColumn]) : null);
  const selectedSet = new Set(selectedRowKeys);
  const isSelectable = selectionMode === "multiple" || selectionMode === "single";
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = selectedSet.size > 0 && selectedSet.size < tableData.length;
  }, [selectedSet.size, tableData.length]);

  function handleSelectRow(row: T, e: React.MouseEvent) {
    e.stopPropagation();
    if (!getRowKey || !onSelectionChange) return;
    const key = getRowKey(row);
    if (selectionMode === "single") {
      onSelectionChange(selectedSet.has(key) ? [] : [key]);
      return;
    }
    const next = new Set(selectedRowKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(Array.from(next));
  }

  function handleSelectAll(e: React.MouseEvent) {
    e.stopPropagation();
    if (!onSelectionChange || selectionMode !== "multiple") return;
    if (selectedSet.size === tableData.length) {
      onSelectionChange([]);
    } else {
      const keys = tableData.map((r) => (getRowKey ? getRowKey(r) : "")).filter(Boolean);
      onSelectionChange(keys);
    }
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            {isSelectable && (
              <th scope="col" className="w-10 px-4 py-2 text-left">
                {selectionMode === "multiple" && (
                  <Checkbox
                    ref={selectAllRef}
                    checked={tableData.length > 0 && selectedSet.size === tableData.length}
                    onChange={() => handleSelectAll({ stopPropagation: () => {} } as React.MouseEvent)}
                    onClick={handleSelectAll}
                    aria-label="Select all"
                  />
                )}
              </th>
            )}
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider text-slate-500"
                style={col.width ? { width: col.width } : undefined}
              >
                {col.sortable && onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="hover:text-slate-700"
                  >
                    {col.header ?? col.label}
                    {sortColumn === col.key && (
                      <span className="ml-1">{sortDirection === "asc" ? "↑" : "↓"}</span>
                    )}
                  </button>
                ) : (
                  col.header ?? col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {tableData.map((row, i) => {
            const rowKey = getRowKey ? getRowKey(row) : `row-${i}`;
            const isSelected = selectedSet.has(rowKey);
            return (
              <tr
                key={rowKey}
                onClick={() => onRowClick?.(row)}
                className={onRowClick ? "cursor-pointer hover:bg-slate-50" : ""}
              >
                {isSelectable && (
                  <td className="w-10 px-4 py-2" onClick={(e) => handleSelectRow(row, e)}>
                    <Checkbox
                      checked={isSelected}
                      onClick={(e) => handleSelectRow(row, e)}
                      aria-label={selectionMode === "single" ? "Select row" : "Toggle row"}
                    />
                  </td>
                )}
                {columns.map((col) => (
                  <td key={col.key} className="whitespace-nowrap px-4 py-2 text-sm text-slate-900">
                    {col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
