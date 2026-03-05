"use client";

import { PageFrame, Stack, PageHeader } from "@/components/ui";

export default function ProfilePage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Profile"
          description="Manage your account profile and preferences."
        />
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-body-small text-text-muted">
            Profile settings will appear here. Connect your auth provider to load user details.
          </p>
        </div>
      </Stack>
    </PageFrame>
  );
}
