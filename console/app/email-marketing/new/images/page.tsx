"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, PageHeader, LoadingSkeleton } from "@/components/ui";

export default function EmailMarketingNewImagesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/email-marketing/new/content");
  }, [router]);
  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Images" description="Redirecting to products & images…" />
        <LoadingSkeleton className="h-32 rounded-lg" />
      </Stack>
    </PageFrame>
  );
}
