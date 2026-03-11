"use client";

import { PageFrame } from "@/components/ui/PageFrame";
import { Stack } from "@/components/ui/Stack";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";

export interface ListViewProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  filters?: React.ReactNode;
  bulkActions?: React.ReactNode;
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  pagination?: { page: number; pageCount: number; onPageChange: (page: number) => void } | null;
  wrapTable?: boolean;
  children: React.ReactNode;
}

export function ListView({
  title,
  description,
  actions,
  filters,
  bulkActions,
  empty,
  emptyTitle = "No items",
  emptyDescription,
  emptyAction,
  pagination,
  wrapTable,
  children,
}: ListViewProps) {
  return (
    <PageFrame>
      <Stack>
        <PageHeader title={title} description={description} actions={actions} />
        {filters && <div className="flex flex-wrap items-center gap-3">{filters}</div>}
        {bulkActions && (
          <div className="flex items-center gap-2 rounded-lg border border-border-default bg-fill-subtle px-4 py-2">
            {bulkActions}
          </div>
        )}
        {empty ? (
          <EmptyState
            title={emptyTitle}
            description={emptyDescription}
            action={emptyAction}
          />
        ) : wrapTable ? (
          <div className="rounded-lg border border-border-default overflow-hidden">
            {children}
          </div>
        ) : (
          children
        )}
        {pagination && pagination.pageCount > 1 && (
          <div className="mt-4 flex justify-end">
            <Pagination
              page={pagination.page}
              pageCount={pagination.pageCount}
              onPageChange={pagination.onPageChange}
            />
          </div>
        )}
      </Stack>
    </PageFrame>
  );
}
