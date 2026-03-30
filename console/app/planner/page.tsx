"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageFrame, Stack, CardSection, PageHeader, LoadingSkeleton, Button, Input } from "@/components/ui";
import { useRuns, useJobRuns, useInitiatives, usePendingApprovals } from "@/hooks/use-api";
import * as api from "@/lib/api";
import type { PipelineDraft } from "@/lib/api";

type SavedDraftItem = { id: string; draft_hash: string; name: string | null; created_at: string };

export default function PlannerPage() {
  const { data: runsData, isLoading: runsLoading } = useRuns({ limit: 10 });
  const { data: jobRunsData, isLoading: jobsLoading } = useJobRuns({ limit: 15 });
  const { data: initiativesData, isLoading: initiativesLoading } = useInitiatives({ limit: 20 });
  const { data: pendingData, isLoading: pendingLoading } = usePendingApprovals();

  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<PipelineDraft | null>(null);
  const [lint, setLint] = useState<api.PipelineLintResult | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [compileMode, setCompileMode] = useState<"new" | "existing">("new");
  const [newTitle, setNewTitle] = useState("");
  const [selectedInitiativeId, setSelectedInitiativeId] = useState("");
  const [compileLoading, setCompileLoading] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [startRunLoading, setStartRunLoading] = useState(false);
  const [startRunError, setStartRunError] = useState<string | null>(null);
  const router = useRouter();

  const [savedDrafts, setSavedDrafts] = useState<SavedDraftItem[]>([]);
  const [saveDraftName, setSaveDraftName] = useState("");
  const [saveDraftLoading, setSaveDraftLoading] = useState(false);
  const [savedDraftId, setSavedDraftId] = useState<string | null>(null);
  const [loadDraftId, setLoadDraftId] = useState("");
  const [loadDraftLoading, setLoadDraftLoading] = useState(false);
  const [templateKey, setTemplateKey] = useState("");
  const [saveTemplateLoading, setSaveTemplateLoading] = useState(false);
  const [composePatternKeys, setComposePatternKeys] = useState("");
  const [composeLoading, setComposeLoading] = useState(false);

  const runs = runsData?.items ?? [];
  const jobRuns = jobRunsData?.items ?? [];
  const initiatives = initiativesData?.items ?? [];
  const pending = pendingData?.items ?? [];

  const isLoading = runsLoading || jobsLoading || initiativesLoading || pendingLoading;

  const onGenerateDraft = async () => {
    setDraftLoading(true);
    setDraftError(null);
    setDraft(null);
    setLint(null);
    try {
      const res = await api.createPipelineDraft({ prompt: prompt || undefined });
      setDraft(res.draft);
      setLint(res.lint);
      setNewTitle((prev) => prev || prompt.slice(0, 80) || res.draft.summary.slice(0, 80));
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setDraftLoading(false);
    }
  };

  useEffect(() => {
    api.listPipelineDrafts(30).then((r) => setSavedDrafts(r.items)).catch(() => {});
  }, [draft?.intentType, savedDraftId]);

  const onCompile = async () => {
    if (!draft) return;
    setCompileLoading(true);
    setCompileError(null);
    setCreatedPlanId(null);
    try {
      let initiativeId: string;
      if (compileMode === "new") {
        const init = await api.createInitiative({
          intent_type: draft.intentType,
          title: newTitle || draft.summary.slice(0, 80),
          risk_level: "low",
        });
        initiativeId = init.id;
      } else {
        initiativeId = selectedInitiativeId;
        if (!initiativeId) {
          setCompileError("Select an initiative.");
          return;
        }
      }
      const plan = await api.compilePlanFromDraft(initiativeId, draft);
      setCreatedPlanId(plan.id);
    } catch (e) {
      setCompileError(e instanceof Error ? e.message : String(e));
    } finally {
      setCompileLoading(false);
    }
  };

  const onSaveDraft = async () => {
    if (!draft) return;
    setSaveDraftLoading(true);
    setSavedDraftId(null);
    try {
      const out = await api.savePipelineDraft(draft, saveDraftName || undefined);
      setSavedDraftId(out.id);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveDraftLoading(false);
    }
  };

  const onLoadDraft = async () => {
    if (!loadDraftId) return;
    setLoadDraftLoading(true);
    setDraftError(null);
    try {
      const out = await api.getPipelineDraft(loadDraftId);
      setDraft(out.draft);
      setLint(out.lint);
      setNewTitle(out.name || out.draft.summary.slice(0, 80));
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadDraftLoading(false);
    }
  };

  const onSaveAsTemplate = async () => {
    if (!draft || !templateKey.trim()) return;
    setSaveTemplateLoading(true);
    try {
      await api.savePipelineTemplate(templateKey.trim(), draft);
      setDraftError(null);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveTemplateLoading(false);
    }
  };

  const onStartRun = async () => {
    if (!createdPlanId) return;
    setStartRunLoading(true);
    setStartRunError(null);
    try {
      const { id: runId } = await api.startPlanRun(createdPlanId);
      router.push(`/runs/${runId}`);
    } catch (e) {
      setStartRunError(e instanceof Error ? e.message : String(e));
    } finally {
      setStartRunLoading(false);
    }
  };

  const onCompose = async () => {
    const keys = composePatternKeys.split(",").map((k) => k.trim()).filter(Boolean);
    if (keys.length < 2) {
      setDraftError("Enter at least two pattern keys separated by commas (e.g. wp_shopify_migration, email_design_generator)");
      return;
    }
    setComposeLoading(true);
    setDraftError(null);
    try {
      const res = await api.composePipelineDrafts({ pattern_keys: keys });
      setDraft(res.draft);
      setLint(res.lint);
    } catch (e) {
      setDraftError(e instanceof Error ? e.message : String(e));
    } finally {
      setComposeLoading(false);
    }
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Planner"
          description="Upcoming runs, initiatives rollup, and approvals queue."
        />
        <p className="text-body-small text-text-muted mb-2">
          <Link href="/initiatives" className="text-brand-600 hover:underline">Initiatives</Link> · <Link href="/plans" className="text-brand-600 hover:underline">Plans</Link> · <Link href="/graph/decision-loop" className="text-brand-600 hover:underline">Decision loop</Link>
        </p>

        <CardSection title="Build pipeline from prompt">
          <p className="text-body-small text-text-secondary mb-2">
            Describe the pipeline (e.g. &quot;WP to Shopify audit for WordPress → Shopify&quot;, &quot;email design generator&quot;, &quot;self-heal fix repo&quot;). The system picks a pattern and returns a draft you can compile into a plan.
          </p>
          <div className="flex flex-wrap items-end gap-2 mb-2">
            <span className="text-body-small text-text-muted">Load saved draft:</span>
            <select
              className="rounded-lg border border-border-default bg-surface-default px-3 py-2 text-body-small"
              value={loadDraftId}
              onChange={(e) => setLoadDraftId(e.target.value)}
            >
              <option value="">—</option>
              {savedDrafts.map((d) => (
                <option key={d.id} value={d.id}>{d.name || d.id.slice(0, 8)}</option>
              ))}
            </select>
            <Button onClick={onLoadDraft} disabled={loadDraftLoading || !loadDraftId} size="sm">Load</Button>
          </div>
          <div className="flex flex-wrap items-end gap-2 mb-2">
            <span className="text-body-small text-text-muted">Compose two patterns (V2):</span>
            <Input
              placeholder="key1, key2"
              value={composePatternKeys}
              onChange={(e) => setComposePatternKeys(e.target.value)}
              className="w-64"
            />
            <Button onClick={onCompose} disabled={composeLoading}>Compose</Button>
          </div>
          <textarea
            className="w-full min-h-[80px] rounded-lg border border-border-default bg-surface-default px-3 py-2 text-body-small text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-brand-500"
            placeholder="e.g. Build a WP–Shopify audit pipeline for WordPress → Shopify"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <Button onClick={onGenerateDraft} disabled={draftLoading} className="mt-2">
            {draftLoading ? "Generating…" : "Generate draft"}
          </Button>
          {draftError && <p className="text-body-small text-state-danger mt-2">{draftError}</p>}
          {draft && lint && (
            <div className="mt-4 space-y-2 rounded-lg border border-border-default bg-surface-sunken/50 p-4">
              <p className="text-body-small font-medium text-text-primary">
                {draft.intentType} — {draft.nodes.length} nodes, {draft.edges.length} edges
                {draft.entryNodeKeys?.length ? ` · ${draft.entryNodeKeys.length} entry` : ""}
                {draft.terminalNodeKeys?.length ? ` · ${draft.terminalNodeKeys.length} terminal` : ""}
              </p>
              <p className="text-body-small text-text-secondary">{draft.summary}</p>
              {!lint.valid && <p className="text-body-small text-state-danger">Lint: {lint.errors.join("; ")}</p>}
              {lint.warnings.length > 0 && <p className="text-body-small text-text-muted">Warnings: {lint.warnings.join("; ")}</p>}
              <div className="flex flex-wrap gap-4 pt-2 border-t border-border-default">
                <div className="flex items-center gap-2">
                  <Input placeholder="Draft name" value={saveDraftName} onChange={(e) => setSaveDraftName(e.target.value)} className="w-40" />
                  <Button onClick={onSaveDraft} disabled={saveDraftLoading}>Save draft</Button>
                  {savedDraftId && <span className="text-body-small text-text-muted">Saved</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Input placeholder="Pattern key" value={templateKey} onChange={(e) => setTemplateKey(e.target.value)} className="w-40" />
                  <Button onClick={onSaveAsTemplate} disabled={saveTemplateLoading || !templateKey.trim()}>Save as template</Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <label className="flex items-center gap-2 text-body-small">
                  <input type="radio" checked={compileMode === "new"} onChange={() => setCompileMode("new")} /> New initiative
                </label>
                <label className="flex items-center gap-2 text-body-small">
                  <input type="radio" checked={compileMode === "existing"} onChange={() => setCompileMode("existing")} /> Existing initiative
                </label>
              </div>
              {compileMode === "new" && (
                <Input
                  placeholder="Initiative title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="max-w-md"
                />
              )}
              {compileMode === "existing" && (
                <select
                  className="rounded-lg border border-border-default bg-surface-default px-3 py-2 text-body-small"
                  value={selectedInitiativeId}
                  onChange={(e) => setSelectedInitiativeId(e.target.value)}
                >
                  <option value="">Select initiative</option>
                  {initiatives.map((i) => (
                    <option key={i.id} value={i.id}>{i.title ?? i.intent_type ?? i.id.slice(0, 8)}</option>
                  ))}
                </select>
              )}
              <Button onClick={onCompile} disabled={compileLoading || (!lint.valid && lint.errors.length > 0)} className="mt-2">
                {compileLoading ? "Compiling…" : "Compile plan"}
              </Button>
              {compileError && <p className="text-body-small text-state-danger">{compileError}</p>}
              {createdPlanId && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <p className="text-body-small text-text-secondary">
                    Plan created: <Link href={`/plans/${createdPlanId}`} className="text-brand-600 hover:underline">View plan</Link>
                  </p>
                  <Button onClick={onStartRun} disabled={startRunLoading} size="sm" variant="primary">
                    {startRunLoading ? "Starting…" : "Start run"}
                  </Button>
                  {startRunError && <p className="text-body-small text-state-danger">{startRunError}</p>}
                </div>
              )}
            </div>
          )}
        </CardSection>

        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <CardSection title="Upcoming / recent runs" className="md:col-span-2">
              <ul className="space-y-2">
                {runs.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <Link href={`/runs/${r.id}`} className="text-brand-600 hover:underline">
                      {r.id.slice(0, 8)}… — {r.status}
                    </Link>
                  </li>
                ))}
                {runs.length === 0 && <p className="text-text-muted text-sm">No runs.</p>}
              </ul>
              <Link href="/runs" className="mt-2 text-sm text-brand-600 hover:underline">
                View all runs →
              </Link>
            </CardSection>
            <CardSection title="Initiatives status">
              <p className="text-body-small text-text-muted">
                {initiatives.length} initiative(s)
              </p>
              <Link href="/initiatives" className="mt-2 text-sm text-brand-600 hover:underline">
                View initiatives →
              </Link>
            </CardSection>
            <CardSection title="Approvals queue">
              <p className="text-body-small text-text-muted">
                {pending.length} pending approval(s)
              </p>
              <Link href="/approvals" className="mt-2 text-sm text-brand-600 hover:underline">
                View approvals →
              </Link>
            </CardSection>
            <CardSection title="Recent job runs">
              <ul className="space-y-1 text-sm">
                {jobRuns.slice(0, 5).map((j) => (
                  <li key={j.id}>
                    <Link href={`/jobs?run_id=${j.run_id ?? ""}`} className="text-brand-600 hover:underline">
                      {j.job_type} — {j.status}
                    </Link>
                  </li>
                ))}
                {jobRuns.length === 0 && <p className="text-text-muted">No job runs.</p>}
              </ul>
              <Link href="/jobs" className="mt-2 text-sm text-brand-600 hover:underline">
                View jobs →
              </Link>
            </CardSection>
          </div>
        )}
      </Stack>
    </PageFrame>
  );
}
