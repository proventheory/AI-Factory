"use client";

import { useParams } from "next/navigation";
import { EmailArtifactEditor } from "@/components/email-artifact-editor";

export default function EmailMarketingArtifactOnlyEditPage() {
  const params = useParams();
  const artifactId = (params?.artifactId as string) ?? "";
  return <EmailArtifactEditor artifactId={artifactId} />;
}
