"use client";

import { useState } from "react";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection, LoadingSkeleton, EmptyState } from "@/components/ui";
import { useMigrationGuard } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";

export default function MigrationGuardPage() {
  const [sql, setSql] = useState("");
  const mutation = useMigrationGuard();
  const result = mutation.data;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ sql: sql.trim() || undefined });
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Migration Guard"
          description="Analyze migration SQL before applying: tables touched, columns, risks, checkpoint suggestion."
        />
        <p className="text-body-small text-text-muted mb-4">
          <Link href="/graph/checkpoints" className="text-brand-600 hover:underline">Checkpoints</Link> · <Link href="/releases" className="text-brand-600 hover:underline">Releases</Link>
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="migration-sql" className="block text-body-small text-text-muted mb-1">Migration SQL</label>
            <textarea
              id="migration-sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              placeholder="e.g. ALTER TABLE users ADD COLUMN name TEXT;"
              rows={6}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-body-small text-text-primary shadow-sm font-mono"
            />
          </div>
          <button
            type="submit"
            disabled={mutation.isPending || !sql.trim()}
            className="rounded-md bg-brand-600 px-4 py-2 text-body-small text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {mutation.isPending ? "Analyzing…" : "Analyze"}
          </button>
        </form>
        {mutation.error && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(mutation.error)}</div>
        )}
        <CardSection title="Analysis result">
          {!mutation.isSuccess && !result ? (
            <EmptyState title="No result yet" description="Submit SQL above to analyze." />
          ) : mutation.isPending ? (
            <LoadingSkeleton className="h-24 rounded-lg" />
          ) : result ? (
            <div className="space-y-2">
              <p className="text-body-small"><strong>Tables touched:</strong> {Array.isArray(result.tables_touched) ? result.tables_touched.length : 0}</p>
              <p className="text-body-small"><strong>Columns:</strong> {Array.isArray(result.columns) ? result.columns.length : 0}</p>
              <p className="text-body-small"><strong>Risks:</strong> {Array.isArray(result.risks) ? result.risks.length : 0}</p>
              {Array.isArray(result.risks) && result.risks.length > 0 && (
                <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-caption-small overflow-auto max-h-[200px]">{JSON.stringify(result.risks, null, 2)}</pre>
              )}
              {result.checkpoint_suggestion != null && <p className="text-body-small">Checkpoint suggestion: {JSON.stringify(result.checkpoint_suggestion)}</p>}
            </div>
          ) : null}
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
