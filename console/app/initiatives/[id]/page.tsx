"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Card, CardContent, CardHeader, Badge, Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, Tabs, TabsList, TabsTrigger, TabsContent, Input, Select } from "@/components/ui";
import { useLaunches, useBuildSpecs, useCreateBuildSpec, useCreateBuildSpecFromStrategy } from "@/hooks/use-api";
import * as api from "@/lib/api";
import type { LaunchRow } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

const PRODUCT_TYPES = [
  { value: "landing", label: "Landing" },
  { value: "marketing_site", label: "Marketing site" },
  { value: "content_site", label: "Content site" },
  { value: "campaign_site", label: "Campaign site" },
  { value: "dashboard", label: "Dashboard" },
  { value: "saas", label: "SaaS" },
  { value: "crm", label: "CRM" },
  { value: "erp", label: "ERP" },
];

const DEPLOYMENT_TARGETS = [
  { value: "vercel", label: "Vercel" },
  { value: "render_static", label: "Render (static)" },
  { value: "netlify", label: "Netlify" },
  { value: "railway", label: "Railway" },
  { value: "fly", label: "Fly" },
];

type Initiative = {
  id: string;
  intent_type: string;
  title: string | null;
  risk_level: string;
  created_by: string | null;
  created_at: string;
  goal_state?: string | null;
  source_ref?: string | null;
  brand_profile_id?: string | null;
};

type PlanItem = { id: string; plan_hash: string; created_at: string };

export default function InitiativeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const [item, setItem] = useState<Initiative | null>(null);
  const [plans, setPlans] = useState<PlanItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [compileBusy, setCompileBusy] = useState(false);
  const [startBusy, setStartBusy] = useState<string | null>(null);
  const [llmSource, setLlmSource] = useState<"gateway" | "openai_direct">("gateway");
  const [googleConnected, setGoogleConnected] = useState<boolean | null>(null);
  const [launchSheetOpen, setLaunchSheetOpen] = useState(false);
  const [specProductType, setSpecProductType] = useState("landing");
  const [specSiteName, setSpecSiteName] = useState("");
  const [specBrandId, setSpecBrandId] = useState("");
  const [specGoal, setSpecGoal] = useState("");
  const [specPrimaryCta, setSpecPrimaryCta] = useState("");
  const [specPageSections, setSpecPageSections] = useState("hero, features, cta, footer");
  const [specSubdomain, setSpecSubdomain] = useState("");
  const [specBaseDomain, setSpecBaseDomain] = useState("");
  const [specDeploymentTarget, setSpecDeploymentTarget] = useState("vercel");
  const [specExtended, setSpecExtended] = useState(false);
  const [strategyDoc, setStrategyDoc] = useState("");
  const [createSpecError, setCreateSpecError] = useState<string | null>(null);
  const [createSpecSuccess, setCreateSpecSuccess] = useState<string | null>(null);

  const { data: launchesData } = useLaunches({ initiative_id: id, limit: 20 });
  const launches = (launchesData?.items ?? []) as LaunchRow[];
  const createBuildSpec = useCreateBuildSpec();
  const createFromStrategy = useCreateBuildSpecFromStrategy();

  const refetch = useCallback(() => {
    if (!id) return;
    Promise.all([
      fetch(`${API}/v1/initiatives/${id}`).then((r) => r.json()),
      fetch(`${API}/v1/plans?initiative_id=${id}&limit=20`).then((r) => r.json()),
    ])
      .then(([init, pl]) => {
        setItem(init.error ? null : init);
        setPlans(pl.items ?? []);
        setError(null);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // SEO migration audit: fetch Google connected status
  useEffect(() => {
    if (!id || item?.intent_type !== "seo_migration_audit") return;
    api.getInitiativeGoogleConnected(id).then((r) => setGoogleConnected(r.connected)).catch(() => setGoogleConnected(false));
  }, [id, item?.intent_type]);

  // Clear URL params after showing OAuth result (google_connected=1 or error)
  useEffect(() => {
    const connected = searchParams.get("google_connected");
    const err = searchParams.get("error");
    if (connected === "1" || err) {
      setGoogleConnected(connected === "1");
      if (err) setError(decodeURIComponent(err));
      router.replace(`/initiatives/${id}`, { scroll: false });
    }
  }, [id, router, searchParams]);

  async function handleCompilePlan() {
    setCompileBusy(true);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/initiatives/${id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Compile failed");
      refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compile failed");
    } finally {
      setCompileBusy(false);
    }
  }

  async function handleStartRun(planId: string) {
    setStartBusy(planId);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/plans/${planId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ environment: "sandbox", llm_source: llmSource }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Start run failed");
      if (j.id) router.push(`/runs/${j.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Start run failed");
    } finally {
      setStartBusy(null);
    }
  }

  async function handleCreateBuildSpec(e: React.FormEvent) {
    e.preventDefault();
    setCreateSpecError(null);
    setCreateSpecSuccess(null);
    const sections = specPageSections.split(",").map((s) => s.trim()).filter(Boolean);
    const domainIntent =
      specSubdomain.trim() && specBaseDomain.trim()
        ? { subdomain: specSubdomain.trim(), base_domain: specBaseDomain.trim() }
        : { subdomain: "www", base_domain: "example.com" };
    try {
      const result = await createBuildSpec.mutateAsync({
        initiative_id: id,
        spec: {
          product_type: specProductType,
          site_name: specSiteName.trim(),
          brand_id: specBrandId.trim(),
          goal: specGoal.trim(),
          primary_cta: specPrimaryCta.trim(),
          page_sections: sections,
          domain_intent: domainIntent,
          deployment_target: specDeploymentTarget,
        },
        extended: specExtended,
      });
      setCreateSpecSuccess(`Created launch ${result.launch_id.slice(0, 8)}…`);
      setTimeout(() => {
        setLaunchSheetOpen(false);
        setCreateSpecSuccess(null);
        router.push(`/launches/${result.launch_id}`);
      }, 1500);
    } catch (e) {
      setCreateSpecError(e instanceof Error ? e.message : "Create failed");
    }
  }

  async function handleCreateFromStrategyDoc(e: React.FormEvent) {
    e.preventDefault();
    setCreateSpecError(null);
    setCreateSpecSuccess(null);
    if (!strategyDoc.trim()) {
      setCreateSpecError("Strategy doc is required");
      return;
    }
    try {
      const result = await createFromStrategy.mutateAsync({
        initiative_id: id,
        strategy_doc: strategyDoc.trim(),
      });
      setCreateSpecSuccess(`Created launch ${result.launch_id.slice(0, 8)}…`);
      setTimeout(() => {
        setLaunchSheetOpen(false);
        setCreateSpecSuccess(null);
        setStrategyDoc("");
        router.push(`/launches/${result.launch_id}`);
      }, 1500);
    } catch (e) {
      setCreateSpecError(e instanceof Error ? e.message : "Create failed");
    }
  }

  if (!item) return <p className="text-slate-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/initiatives" className="text-brand-600 hover:underline text-sm">← Initiatives</Link>
        <h1 className="text-2xl font-bold text-slate-900">{item.title || item.intent_type || item.id}</h1>
      </div>
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-semibold text-slate-900 mb-2">Initiative</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-slate-500">ID</dt><dd className="font-mono">{item.id}</dd>
          <dt className="text-slate-500">Intent type</dt><dd>{item.intent_type}</dd>
          <dt className="text-slate-500">Title</dt><dd>{item.title ?? "—"}</dd>
          <dt className="text-slate-500">Risk level</dt><dd>{item.risk_level}</dd>
          <dt className="text-slate-500">Created by</dt><dd>{item.created_by ?? "—"}</dd>
          <dt className="text-slate-500">Created at</dt><dd>{new Date(item.created_at).toLocaleString()}</dd>
          {item.goal_state != null && (<><dt className="text-slate-500">Goal state</dt><dd><span className="px-2 py-0.5 rounded bg-slate-100 text-xs">{item.goal_state}</span></dd></>)}
          {item.source_ref && (<><dt className="text-slate-500">Source ref</dt><dd><a href={item.source_ref} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline truncate block max-w-md">{item.source_ref}</a></dd></>)}
        </dl>
      </div>
      {item.intent_type === "seo_migration_audit" && (
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <h2 className="font-semibold text-slate-900 mb-2">Google (GSC / GA4)</h2>
          <p className="text-slate-600 text-sm mb-3">Google is connected per brand. Connect or disconnect on the brand page; initiatives use their brand&apos;s connection.</p>
          {googleConnected === true ? (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-sm">Google connected</span>
              {item.brand_profile_id && (
                <Link href={`/brands/${item.brand_profile_id}`} className="text-body-small text-brand-600 hover:underline">
                  Via brand →
                </Link>
              )}
            </div>
          ) : item.brand_profile_id ? (
            <Link href={`/brands/${item.brand_profile_id}`} className="inline-flex items-center gap-2 text-body-small text-brand-600 hover:underline">
              Connect Google on the brand page →
            </Link>
          ) : (
            <p className="text-slate-600 text-sm">Assign a brand to this initiative (edit initiative), then connect Google on the brand page.</p>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-body-small text-red-800" role="alert">
          {error}
        </div>
      )}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold text-slate-900">Plans</h2>
          <Button variant="primary" onClick={handleCompilePlan} disabled={compileBusy}>
            {compileBusy ? "Compiling…" : "Compile plan"}
          </Button>
        </div>
        {plans.length === 0 ? (
          <p className="text-slate-500 text-sm">No plans yet. Click &quot;Compile plan&quot; to create one.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <span>LLM for new runs:</span>
                <select
                  value={llmSource}
                  onChange={(e) => setLlmSource(e.target.value as "gateway" | "openai_direct")}
                  className="rounded border border-slate-300 px-2 py-1 bg-white text-slate-900"
                >
                  <option value="gateway">Gateway (recommended)</option>
                  <option value="openai_direct">Direct OpenAI</option>
                </select>
              </label>
            </div>
            <ul className="space-y-2">
              {plans.map((p) => (
                <li key={p.id} className="flex items-center gap-3 flex-wrap">
                  <Link href={`/plans/${p.id}`} className="text-brand-600 hover:underline font-mono text-sm">
                    {p.id.slice(0, 8)}… — {String(p.plan_hash).slice(0, 12)}… — {new Date(p.created_at).toLocaleString()}
                  </Link>
                  <Button
                    variant="secondary"
                    onClick={() => handleStartRun(p.id)}
                    disabled={startBusy !== null}
                  >
                    {startBusy === p.id ? "Starting…" : "Start run"}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h2 className="font-semibold text-slate-900">Launch</h2>
          <Sheet open={launchSheetOpen} onOpenChange={setLaunchSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="primary">Create build spec</Button>
            </SheetTrigger>
            <SheetContent className="overflow-y-auto w-full max-w-lg sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Create build spec &amp; launch</SheetTitle>
                <SheetDescription>
                  Creates a build spec and a launch for this initiative. Use the form for structured input or paste a strategy doc (markdown/YAML).
                </SheetDescription>
              </SheetHeader>
              {createSpecError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 mt-2">
                  {createSpecError}
                </div>
              )}
              {createSpecSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 mt-2">
                  {createSpecSuccess} Redirecting…
                </div>
              )}
              <Tabs defaultValue="form" className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="form">Form</TabsTrigger>
                  <TabsTrigger value="strategy">From strategy doc</TabsTrigger>
                </TabsList>
                <TabsContent value="form" className="mt-4">
                  <form onSubmit={handleCreateBuildSpec} className="space-y-3">
                    <label className="block">
                      <span className="text-sm text-slate-600">Product type</span>
                      <Select value={specProductType} onChange={(e) => setSpecProductType(e.target.value)} className="w-full mt-1">
                        {PRODUCT_TYPES.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Site name *</span>
                      <Input value={specSiteName} onChange={(e) => setSpecSiteName(e.target.value)} placeholder="My landing" className="w-full mt-1" required />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Brand ID *</span>
                      <Input value={specBrandId} onChange={(e) => setSpecBrandId(e.target.value)} placeholder="UUID" className="w-full mt-1 font-mono" required />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Goal *</span>
                      <Input value={specGoal} onChange={(e) => setSpecGoal(e.target.value)} placeholder="Capture leads for product X" className="w-full mt-1" required />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Primary CTA *</span>
                      <Input value={specPrimaryCta} onChange={(e) => setSpecPrimaryCta(e.target.value)} placeholder="Sign up" className="w-full mt-1" required />
                    </label>
                    <label className="block">
                      <span className="text-sm text-slate-600">Page sections (comma-separated)</span>
                      <Input value={specPageSections} onChange={(e) => setSpecPageSections(e.target.value)} className="w-full mt-1" />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-sm text-slate-600">Subdomain</span>
                        <Input value={specSubdomain} onChange={(e) => setSpecSubdomain(e.target.value)} placeholder="offer" className="w-full mt-1" />
                      </label>
                      <label className="block">
                        <span className="text-sm text-slate-600">Base domain</span>
                        <Input value={specBaseDomain} onChange={(e) => setSpecBaseDomain(e.target.value)} placeholder="example.com" className="w-full mt-1" />
                      </label>
                    </div>
                    <label className="block">
                      <span className="text-sm text-slate-600">Deployment target</span>
                      <Select value={specDeploymentTarget} onChange={(e) => setSpecDeploymentTarget(e.target.value)} className="w-full mt-1">
                        {DEPLOYMENT_TARGETS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={specExtended} onChange={(e) => setSpecExtended(e.target.checked)} className="rounded border-slate-300" />
                      <span className="text-sm text-slate-600">Use extended BuildSpec (entities, workflows, etc.)</span>
                    </label>
                    <Button type="submit" variant="primary" disabled={createBuildSpec.isPending} className="w-full">
                      {createBuildSpec.isPending ? "Creating…" : "Create build spec & launch"}
                    </Button>
                  </form>
                </TabsContent>
                <TabsContent value="strategy" className="mt-4">
                  <form onSubmit={handleCreateFromStrategyDoc} className="space-y-3">
                    <label className="block">
                      <span className="text-sm text-slate-600">Strategy document (markdown or YAML)</span>
                      <textarea
                        value={strategyDoc}
                        onChange={(e) => setStrategyDoc(e.target.value)}
                        placeholder="product_type: landing\nsite_name: My site\nbrand_id: ...\ngoal: ..."
                        rows={12}
                        className="mt-1 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm"
                      />
                    </label>
                    <Button type="submit" variant="primary" disabled={createFromStrategy.isPending || !strategyDoc.trim()} className="w-full">
                      {createFromStrategy.isPending ? "Creating…" : "Create from strategy doc"}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </SheetContent>
          </Sheet>
        </div>
        <p className="text-slate-600 text-sm mb-3">
          Build specs and launches for this initiative. Create a build spec to get a launch; then run a pipeline that produces a <code className="rounded bg-slate-100 px-1">launch_artifact</code> and trigger deploy preview from the launch page.
        </p>
        {launches.length === 0 ? (
          <p className="text-slate-500 text-sm">No launches yet. Create a build spec to create a launch.</p>
        ) : (
          <ul className="space-y-2">
            {launches.map((launch) => (
              <li key={launch.id} className="flex items-center gap-3 flex-wrap">
                <Link href={`/launches/${launch.id}`} className="text-brand-600 hover:underline font-mono text-sm">
                  {launch.id.slice(0, 8)}… — {launch.status}
                </Link>
                {launch.deploy_url && (
                  <a href={launch.deploy_url} target="_blank" rel="noopener noreferrer" className="text-slate-500 hover:underline text-sm truncate max-w-xs">
                    {launch.deploy_url}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
        <Link href={`/launches?initiative_id=${id}`} className="text-body-small text-brand-600 hover:underline mt-2 inline-block">
          View all launches for this initiative →
        </Link>
      </div>
    </div>
  );
}
