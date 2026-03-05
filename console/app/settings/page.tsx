"use client";

import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function SettingsPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Settings"
          description="Configure application and account settings."
        />
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-body-small text-text-muted">
            Settings options will appear here. Add preferences, notifications, or integrations as needed.
          </p>
        </div>
      </Stack>
    </PageFrame>
  );
}
