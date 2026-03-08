"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageFrame, Stack, PageHeader, Button } from "@/components/ui";
import { useArtifact, useArtifactContent, useUpdateArtifact } from "@/hooks/use-api";
import { toast } from "sonner";

export type EmailArtifactEditorProps = {
  artifactId: string;
  runIdFromParams?: string;
};

export function EmailArtifactEditor({ artifactId, runIdFromParams }: EmailArtifactEditorProps) {
  const { data: artifact, isLoading: artifactLoading, error: artifactError, refetch: refetchArtifact } = useArtifact(artifactId || null);
  const { data: content, isLoading: contentLoading, error: contentError, refetch: refetchContent } = useArtifactContent(artifactId || null);
  const updateArtifact = useUpdateArtifact();

  const [rawContent, setRawContent] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [initialized, setInitialized] = useState(false);

  const runId = runIdFromParams ?? (artifact?.run_id as string | undefined) ?? "";
  const isEmailTemplate = artifact?.artifact_type === "email_template";
  const metadata = artifact?.metadata_json as { mjml?: string } | undefined;
  const hasMjml = Boolean(metadata?.mjml);

  useEffect(() => {
    if (content === undefined || initialized) return;
    setRawContent(content);
    setInitialized(true);
  }, [content, initialized]);

  const handleEditorChange = useCallback((value: string) => {
    setRawContent(value);
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!artifactId || !dirty) return;
    updateArtifact.mutate(
      { id: artifactId, payload: { content: rawContent } },
      {
        onSuccess: () => {
          setDirty(false);
          toast.success("Saved");
          refetchArtifact();
          refetchContent();
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Save failed");
        },
      }
    );
  }, [artifactId, dirty, rawContent, updateArtifact, refetchArtifact, refetchContent]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty) handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, handleSave]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    document.title = artifactId ? `Edit email artifact | ${artifactId.slice(0, 8)}…` : "Edit email artifact";
    return () => { document.title = ""; };
  }, [artifactId]);

  if (artifactLoading || contentLoading) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit email artifact" description="Loading…" />
          <div className="h-64 animate-pulse rounded-md bg-fg-muted/10" />
        </Stack>
      </PageFrame>
    );
  }

  if (artifactError) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit email artifact" description="Error loading artifact." />
          <p className="text-body-small text-fg-danger">{artifactError instanceof Error ? artifactError.message : "Artifact not found"}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => refetchArtifact()}>Retry</Button>
            <Button variant="secondary" asChild><Link href="/email-marketing">Back to Email Generator</Link></Button>
            {runId && <Button variant="secondary" asChild><Link href={`/runs/${runId}`}>View run</Link></Button>}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (contentError) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit email artifact" description="Error loading content." />
          <p className="text-body-small text-fg-danger">{contentError instanceof Error ? contentError.message : "Content not available"}</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => refetchContent()}>Retry</Button>
            <Button variant="secondary" asChild><Link href="/email-marketing">Back to Email Generator</Link></Button>
            {runId && <Button variant="secondary" asChild><Link href={`/runs/${runId}`}>View run</Link></Button>}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  if (artifact && !isEmailTemplate) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Edit email artifact" description="This artifact is not an email template." />
          <p className="text-body-small text-fg-muted">Only email_template artifacts can be edited here.</p>
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" asChild><Link href="/email-marketing">Back to Email Generator</Link></Button>
            {runId && <Button variant="secondary" asChild><Link href={`/runs/${runId}`}>View run</Link></Button>}
          </div>
        </Stack>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Stack className="h-full gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PageHeader
            title="Edit email artifact"
            description={runId ? `Edit artifact ${artifactId} from run ${runId}.` : `Edit artifact ${artifactId}.`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" asChild>
              <Link href="/email-marketing">Back to Email Generator</Link>
            </Button>
            {runId && (
              <Button variant="secondary" asChild>
                <Link href={`/runs/${runId}`}>View run</Link>
              </Button>
            )}
            <Button
              onClick={handleSave}
              disabled={!dirty || updateArtifact.isPending}
            >
              {updateArtifact.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>

        <p className="text-body-small text-fg-muted">
          Image mapping wrong? If every image shows as a product, this run had no campaign images in metadata.{" "}
          <Link href="/email-marketing/new" className="text-brand-600 hover:underline">Create a new campaign</Link>
          {" "}and select campaign images in the Images step, then add products—Re-run uses the same inputs and won’t fix it.
        </p>

        <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="flex flex-col min-h-[400px] rounded-md border border-border bg-background">
            <div className="px-3 py-2 border-b border-border text-body-small text-fg-muted">
              {hasMjml ? "MJML / HTML" : "HTML"} source
            </div>
            <textarea
              aria-label="Email HTML source"
              className="flex-1 w-full min-h-[300px] p-3 font-mono text-sm resize-none bg-transparent text-fg border-none focus:outline-none focus:ring-0"
              value={rawContent}
              onChange={(e) => handleEditorChange(e.target.value)}
              spellCheck={false}
            />
          </div>
          <div className="flex flex-col min-h-[400px] rounded-md border border-border bg-background">
            <div className="px-3 py-2 border-b border-border text-body-small text-fg-muted">
              Preview
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-fg-muted/5 p-4">
              {rawContent.trim() ? (
                <iframe
                  title="Email preview"
                  sandbox="allow-same-origin"
                  className="w-full min-h-[400px] border-0 bg-background rounded shadow"
                  srcDoc={rawContent}
                />
              ) : (
                <p className="text-body-small text-fg-muted">Enter HTML above to see preview.</p>
              )}
            </div>
          </div>
        </div>
      </Stack>
    </PageFrame>
  );
}
