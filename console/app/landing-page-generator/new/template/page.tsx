"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton, ScrollArea } from "@/components/ui";
import { useEmailTemplates } from "@/hooks/use-api";
import { type EmailTemplateRow, fetchEmailTemplatePreviewHtml, getEmailTemplate } from "@/lib/api";

function TemplateCardPreview({ templateId, className }: { templateId: string; className?: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    setErr(null);
    fetchEmailTemplatePreviewHtml(templateId)
      .then(setHtml)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [templateId]);
  if (loading) return <div className={`flex h-full items-center justify-center text-fg-muted text-sm ${className ?? ""}`}>Loading…</div>;
  if (err || !html) return <div className={`flex h-full items-center justify-center text-fg-muted text-sm ${className ?? ""}`}>{err ? "Preview unavailable" : "No preview"}</div>;
  return <iframe title="Template preview" srcDoc={html} className={`h-full w-full border-0 object-cover object-top ${className ?? ""}`} sandbox="allow-same-origin" />;
}

const WIZARD_KEY = "landing_page_wizard";
const CARD_HEIGHT = 320;

function getApiHost(): string {
  if (typeof window === "undefined") return "";
  const api = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";
  try { return new URL(api).host; } catch { return api; }
}

function getWizardState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try { const s = sessionStorage.getItem(WIZARD_KEY); return s ? (JSON.parse(s) as Record<string, unknown>) : {}; } catch { return {}; }
}

function setWizardState(updates: Record<string, unknown>) {
  try { const next = { ...getWizardState(), ...updates }; sessionStorage.setItem(WIZARD_KEY, JSON.stringify(next)); } catch (_e) {}
}

type TemplateRow = { id: string; name: string; type: string; image_url: string | null; image_slots?: number; product_slots?: number; layout_style?: string };

export default function LandingPageGeneratorNewTemplatePage() {
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useEmailTemplates({ limit: 50 });
  const templates = (data?.items ?? []) as TemplateRow[];
  const selected = getWizardState().template_id as string | undefined;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [validationModal, setValidationModal] = useState<{ kind: "need_more" | "over_selection"; templateId: string; needsImages: number; needsProducts: number; hasImages: number; hasProducts: number; maxImageSlots: number; maxProductSlots: number } | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);

  useEffect(() => {
    if (!previewId) { setPreviewHtml(null); setPreviewError(null); setPreviewLoading(false); return; }
    setPreviewLoading(true); setPreviewError(null);
    fetchEmailTemplatePreviewHtml(previewId).then((html) => { setPreviewHtml(html); setPreviewError(null); }).catch((err) => { setPreviewHtml(null); setPreviewError(err instanceof Error ? err.message : String(err)); }).finally(() => setPreviewLoading(false));
  }, [previewId]);

  const pushContent = useCallback((templateId: string) => {
    const ws = getWizardState();
    const params = new URLSearchParams();
    params.set("template_id", templateId);
    const bid = ws.brand_profile_id as string | undefined;
    if (bid) params.set("brand_profile_id", bid);
    router.push(`/landing-page-generator/new/content?${params.toString()}`);
  }, [router]);

  const handleUse = useCallback(
    async (templateId: string) => {
      setValidationLoading(true);
      setValidationModal(null);
      try {
        const template = await getEmailTemplate(templateId) as EmailTemplateRow & { image_slots?: number; product_slots?: number };
        const state = getWizardState();
        const products = (state.products as Array<unknown>) ?? [];
        const selectedImages = (state.selected_images as string[]) ?? [];
        const imageSlots = template.image_slots ?? template.img_count ?? 0;
        const productSlots = template.product_slots ?? 0;
        const hasImages = selectedImages.length;
        const hasProducts = products.length;
        const totalSlots = imageSlots + productSlots;
        const totalContent = hasImages + hasProducts;
        const needsMore = totalSlots > 0 && totalContent < totalSlots;
        const overImages = imageSlots > 0 && hasImages > imageSlots;
        const overProducts = productSlots > 0 && hasProducts > productSlots;
        const overSelection = overImages || overProducts;
        if (needsMore) {
          setValidationModal({ kind: "need_more", templateId, needsImages: imageSlots, needsProducts: productSlots, hasImages, hasProducts, maxImageSlots: imageSlots, maxProductSlots: productSlots });
          return;
        }
        if (overSelection) {
          setValidationModal({ kind: "over_selection", templateId, needsImages: imageSlots, needsProducts: productSlots, hasImages, hasProducts, maxImageSlots: imageSlots, maxProductSlots: productSlots });
          return;
        }
        setWizardState({ template_id: templateId });
        pushContent(templateId);
      } catch (_e) {
        setWizardState({ template_id: templateId });
        pushContent(templateId);
      } finally {
        setValidationLoading(false);
      }
    },
    [pushContent]
  );

  const closeValidationModal = () => setValidationModal(null);
  const continueAnyway = () => {
    if (validationModal) {
      setWizardState({ template_id: validationModal.templateId });
      pushContent(validationModal.templateId);
      closeValidationModal();
    }
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader title="Template" description="Choose a template for this landing page. We will switch to pre-built landing page templates next." />
        {isError ? (
          <div className="rounded-lg border border-state-dangerMuted bg-state-dangerMuted/20 p-4">
            <p className="text-body font-medium text-state-danger">Could not load templates</p>
            <p className="mt-1 text-body-small text-fg-muted">{error instanceof Error ? error.message : "The Control Plane may be unreachable."}</p>
            <p className="mt-2 text-body-small text-fg-muted">Request was sent to <code className="rounded bg-fg-muted/30 px-1">{getApiHost() || "—"}</code>.</p>
            <Button variant="primary" size="sm" className="mt-3" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <ScrollArea className="h-[65vh] min-h-[420px] rounded-lg border border-border bg-card">
            <ul className="grid min-h-0 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3">
              {templates.map((t) => (
                <li key={t.id} className="flex">
                  <div className={`flex w-full flex-col overflow-hidden rounded-lg border transition ${selected === t.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-border bg-card hover:border-fg-muted/30"}`} style={{ height: CARD_HEIGHT }}>
                    <div className="h-[200px] shrink-0 overflow-hidden bg-fg-muted/10">
                      {t.image_url ? <img src={t.image_url} alt="" className="h-full w-full object-cover object-top" /> : <TemplateCardPreview templateId={t.id} className="h-full w-full min-h-[200px]" />}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-3">
                      <div className="min-h-0 overflow-hidden">
                        <p className="truncate font-medium text-fg">{t.name}</p>
                        <p className="text-body-small text-fg-muted break-words">{t.layout_style ?? `(${t.type})`}{(t.image_slots != null || t.product_slots != null) && <> · {t.image_slots ?? 0} image{t.image_slots !== 1 ? "s" : ""}, {t.product_slots ?? 0} product{(t.product_slots ?? 0) !== 1 ? "s" : ""}</>}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setPreviewId(t.id)}>Preview</Button>
                        <Button variant="primary" size="sm" onClick={() => handleUse(t.id)} disabled={validationLoading}>{validationLoading ? "Checking…" : "Use this template"}</Button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        {!isLoading && !isError && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-body-small text-fg-muted">
              {templates.length === 0 ? <>Loaded <strong>0</strong> templates from <code className="rounded bg-fg-muted/30 px-1">{getApiHost() || "API"}</code>. You can still continue.</> : <>Loaded <strong>{templates.length}</strong> template{templates.length !== 1 ? "s" : ""} from <code className="rounded bg-fg-muted/30 px-1">{getApiHost() || "API"}</code>.</>}
            </p>
            {templates.length === 0 && <Button variant="secondary" size="sm" onClick={() => refetch()}>Refresh templates</Button>}
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => { if (selected) setWizardState({ template_id: selected }); const ws = getWizardState(); const tid = (selected ?? ws.template_id) as string | undefined; const bid = ws.brand_profile_id as string | undefined; const params = new URLSearchParams(); if (tid) params.set("template_id", tid); if (bid) params.set("brand_profile_id", bid); router.push(params.toString() ? `/landing-page-generator/new/content?${params.toString()}` : "/landing-page-generator/new/content"); }}>
            Next: Products & images
          </Button>
          <Button variant="secondary" asChild><Link href="/landing-page-generator/new/brand">Back</Link></Button>
        </div>
      </Stack>

      {validationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={closeValidationModal} aria-hidden />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="validation-modal-title">
            <h2 id="validation-modal-title" className="text-body font-semibold text-fg mb-2">
              {validationModal.kind === "over_selection" ? "Template supports fewer slots than selected" : "Template needs more content"}
            </h2>
            {validationModal.kind === "over_selection" ? (
              <p className="text-body-small text-fg-muted mb-4">This template has <strong>{validationModal.maxImageSlots} image slot(s)</strong> and <strong>{validationModal.maxProductSlots} product slot(s)</strong>. You selected {validationModal.hasImages} image(s) and {validationModal.hasProducts} product(s). Continue anyway or go back to reduce selection.</p>
            ) : (
              <p className="text-body-small text-fg-muted mb-4">This template has room for up to <strong>{validationModal.needsImages} image slot(s)</strong> and <strong>{validationModal.needsProducts} product slot(s)</strong>. You have {validationModal.hasImages} image(s) and {validationModal.hasProducts} product(s). Add more or continue anyway.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={continueAnyway}>Continue anyway</Button>
              <Button variant="secondary" size="sm" asChild><Link href={(() => { if (validationModal.templateId) setWizardState({ template_id: validationModal.templateId }); const ws = getWizardState(); const params = new URLSearchParams(); if (validationModal.templateId) params.set("template_id", validationModal.templateId); const bid = ws.brand_profile_id as string | undefined; if (bid) params.set("brand_profile_id", bid); return params.toString() ? `/landing-page-generator/new/content?${params.toString()}` : "/landing-page-generator/new/content"; })()} onClick={closeValidationModal}>Add products & images</Link></Button>
              <Button variant="secondary" size="sm" onClick={closeValidationModal}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {previewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setPreviewId(null)} aria-hidden />
          <div className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="preview-title">
            <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
              <h2 id="preview-title" className="text-lg font-semibold">Template preview</h2>
              <Button variant="secondary" size="sm" onClick={() => setPreviewId(null)}>Close</Button>
            </div>
            <div className="flex min-h-0 flex-1 overflow-hidden p-4">
              <div className="min-h-0 flex-1 overflow-hidden rounded border border-border bg-fg-muted/5">
                {previewLoading && <div className="flex h-full items-center justify-center text-fg-muted">Loading preview…</div>}
                {previewError && <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-fg-muted"><p className="text-sm font-medium text-red-600">Preview failed</p><p className="text-body-small break-words">{previewError}</p></div>}
                {previewHtml && !previewError && (
                  <ScrollArea className="h-full w-full"><div className="p-2" style={{ width: 600 }}><iframe title="Preview" srcDoc={previewHtml} className="min-h-[600px] w-full border-0" sandbox="allow-same-origin" /></div></ScrollArea>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
