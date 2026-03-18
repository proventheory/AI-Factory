"use client";

import { useParams } from "next/navigation";
import { EmailArtifactEditor } from "@/components/email-artifact-editor";

export default function EmailMarketingArtifactEditPage() {
  const params = useParams();
  const runId = params?.runId as string | undefined;
  const artifactId = (params?.artifactId as string) ?? "";
  return <EmailArtifactEditor artifactId={artifactId} runIdFromParams={runId} />;
}
