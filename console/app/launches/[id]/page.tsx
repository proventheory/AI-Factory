"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  PageFrame,
  Stack,
  PageHeader,
  Card,
  CardContent,
  CardHeader,
  Button,
  Badge,
  Input,
  LoadingSkeleton,
} from "@/components/ui";
import { useLaunch, useBuildSpec, useLaunchAction, useLaunchValidate } from "@/hooks/use-api";
import { formatApiError } from "@/lib/api";
import type { LaunchRow } from "@/lib/api";

function statusVariant(status: string): "success" | "warning" | "error" | "neutral" {
  if (status === "domain_live" || status === "preview_deployed") return "success";
  if (status === "validation_failed" || status === "rollback_required") return "error";
  if (status === "preview_deploy_requested" || status === "domain_attach_requested") return "warning";
  return "neutral";
}

export default function LaunchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: launch, isLoading, error } = useLaunch(id);
  const { data: buildSpec } = useBuildSpec(launch?.build_spec_id ?? null);
  const launchAction = useLaunchAction();
  const launchValidate = useLaunchValidate();

  const [artifactRef, setArtifactRef] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [baseDomain, setBaseDomain] = useState("");
  const [repoName, setRepoName] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [validateResult, setValidateResult] = useState<{ passed: boolean; checks?: unknown[] } | null>(null);

  const specJson = buildSpec?.spec_json as { domain_intent?: { subdomain?: string; base_domain?: string }; site_name?: string } | undefined;
  const domainIntent = specJson?.domain_intent;
  const defaultSubdomain = domainIntent && "subdomain" in domainIntent ? (domainIntent.subdomain ?? "") : "";
  const defaultBaseDomain = domainIntent && "base_domain" in domainIntent ? (domainIntent.base_domain ?? "") : "";
  const effectiveSubdomain = subdomain || defaultSubdomain;
  const effectiveBaseDomain = baseDomain || defaultBaseDomain;

  const runAction = async (action: string, inputs: Record<string, unknown>) => {
    setActionError(null);
    try {
      await launchAction.mutateAsync({ action, inputs });
      if (action === "deploy.preview") setArtifactRef("");
      if (action === "domain.attach_subdomain") {
        setSubdomain("");
        setBaseDomain("");
      }
      if (action === "repo.create") setRepoName("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  const runValidate = async () => {
    setActionError(null);
    setValidateResult(null);
    try {
      const result = await launchValidate.mutateAsync(id);
      setValidateResult(result);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Launch" />
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger">{formatApiError(error)}</div>
        </Stack>
      </PageFrame>
    );
  }

  if (isLoading || !launch) {
    return (
      <PageFrame>
        <Stack>
          <PageHeader title="Launch" />
          <LoadingSkeleton className="h-64 rounded-md" />
        </Stack>
      </PageFrame>
    );
  }

  const l = launch as LaunchRow;

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title={specJson?.site_name ? `Launch: ${specJson.site_name}` : `Launch ${l.id.slice(0, 8)}…`}
          description="Deploy preview, domain binding, validation, and repo provisioning."
          actions={
            <div className="flex items-center gap-2">
              <Link href={`/initiatives/${l.initiative_id}`} className="text-body-small text-brand-600 hover:underline">Initiative</Link>
              <Link href="/launches" className="text-body-small text-text-muted hover:underline">← Launches</Link>
            </div>
          }
        />
        {actionError && (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/30 px-4 py-3 text-body-small text-state-danger" role="alert">
            {actionError}
          </div>
        )}
        <Card>
          <CardHeader className="pb-2"><h2 className="text-heading-4 font-semibold text-text-primary">Status</h2></CardHeader>
          <CardContent className="space-y-2">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-text-muted">Status</dt>
              <dd><Badge variant={statusVariant(l.status)}>{l.status}</Badge></dd>
              <dt className="text-text-muted">Deploy URL</dt>
              <dd>{l.deploy_url ? <a href={l.deploy_url} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline break-all">{l.deploy_url}</a> : "—"}</dd>
              <dt className="text-text-muted">Domain</dt>
              <dd>{l.domain ?? "—"}</dd>
              <dt className="text-text-muted">Verification</dt>
              <dd>{l.verification_status ?? "—"}</dd>
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><h2 className="text-heading-4 font-semibold text-text-primary">Actions</h2></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-4 space-y-3">
              <h3 className="text-body-small font-medium text-text-primary">Deploy preview</h3>
              <p className="text-body-small text-text-muted">Requires an artifact of type <code className="rounded bg-surface-sunken px-1">launch_artifact</code>. Use the artifact ID from a run that produced a launch artifact.</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-body-small text-text-muted">Artifact ID</span>
                  <Input placeholder="Artifact UUID" value={artifactRef} onChange={(e) => setArtifactRef(e.target.value)} className="w-72 font-mono" />
                </label>
                <Button variant="primary" disabled={!artifactRef.trim() || launchAction.isPending} onClick={() => runAction("deploy.preview", { launch_id: id, artifact_ref: artifactRef.trim() })}>
                  {launchAction.isPending ? "Deploying…" : "Deploy preview"}
                </Button>
              </div>
              <Link href="/artifacts" className="text-body-small text-brand-600 hover:underline">Find artifacts →</Link>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-4 space-y-3">
              <h3 className="text-body-small font-medium text-text-primary">Attach subdomain</h3>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-body-small text-text-muted">Subdomain</span>
                  <Input placeholder={defaultSubdomain || "e.g. offer"} value={subdomain} onChange={(e) => setSubdomain(e.target.value)} className="w-32" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-body-small text-text-muted">Base domain</span>
                  <Input placeholder={defaultBaseDomain || "e.g. example.com"} value={baseDomain} onChange={(e) => setBaseDomain(e.target.value)} className="w-48" />
                </label>
                <Button variant="secondary" disabled={!effectiveSubdomain || !effectiveBaseDomain || launchAction.isPending} onClick={() => runAction("domain.attach_subdomain", { launch_id: id, subdomain: effectiveSubdomain, base_domain: effectiveBaseDomain, deploy_url: l.deploy_url ?? undefined })}>
                  {launchAction.isPending ? "Attaching…" : "Attach subdomain"}
                </Button>
              </div>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-4 space-y-3">
              <h3 className="text-body-small font-medium text-text-primary">Validate</h3>
              <p className="text-body-small text-text-muted">Run technical and content checks on the deployed URL.</p>
              <Button variant="secondary" disabled={!l.deploy_url || launchValidate.isPending} onClick={runValidate}>{launchValidate.isPending ? "Validating…" : "Run validation"}</Button>
              {validateResult && (
                <div className="mt-2 rounded border border-border-subtle bg-surface-base p-3 text-sm">
                  <strong>Result:</strong> {validateResult.passed ? "Passed" : "Failed"}
                  {validateResult.checks && <pre className="mt-2 overflow-auto text-xs">{JSON.stringify(validateResult.checks, null, 2)}</pre>}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-sunken/50 p-4 space-y-3">
              <h3 className="text-body-small font-medium text-text-primary">Create repo</h3>
              <p className="text-body-small text-text-muted">Provision a GitHub repo for this launch (repo.create action).</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-body-small text-text-muted">Repo name</span>
                  <Input placeholder="my-landing-site" value={repoName} onChange={(e) => setRepoName(e.target.value)} className="w-48" />
                </label>
                <Button variant="secondary" disabled={!repoName.trim() || launchAction.isPending} onClick={() => runAction("repo.create", { launch_id: id, repo_name: repoName.trim() })}>
                  {launchAction.isPending ? "Creating…" : "Create repo"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </Stack>
    </PageFrame>
  );
}
