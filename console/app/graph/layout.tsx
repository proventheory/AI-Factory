"use client";

import AppShell from "@/components/AppShell";
import { ErrorBoundary } from "@/components/ui";

export default function GraphLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundary
        fallback={
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 p-6 text-state-danger">
            <p className="font-medium">Something went wrong on this page.</p>
            <p className="mt-2 text-body-small">Check the browser console for details, or try another Graph page.</p>
          </div>
        }
      >
        {children}
      </ErrorBoundary>
    </AppShell>
  );
}
