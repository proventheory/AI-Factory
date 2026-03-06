"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageFrame, Stack, PageHeader, Button, LoadingSkeleton, ScrollArea } from "@/components/ui";
import { useEmailTemplates } from "@/hooks/use-api";
import { fetchEmailTemplatePreviewHtml, getEmailTemplate } from "@/lib/api";

const WIZARD_KEY = "email_marketing_wizard";
const CARD_HEIGHT = 320;

function getWizardState(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  try {
    const s = sessionStorage.getItem(WIZARD_KEY);
    return s ? (JSON.parse(s) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function setWizardState(updates: Record<string, unknown>) {
  try {
    const next = { ...getWizardState(), ...updates };
    sessionStorage.setItem(WIZARD_KEY, JSON.stringify(next));
  } catch (_e) {}
}

type TemplateRow = { id: string; name: string; type: string; image_url: string | null };

export default function EmailMarketingNewTemplatePage() {
  const router = useRouter();
  const { data, isLoading } = useEmailTemplates({ limit: 50 });
  const templates = (data?.items ?? []) as TemplateRow[];
  const selected = getWizardState().template_id as string | undefined;
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [validationModal, setValidationModal] = useState<{
    templateId: string;
    needsImages: number;
    needsProducts: number;
    hasImages: number;
    hasProducts: number;
  } | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);

  useEffect(() => {
    if (!previewId) {
      setPreviewHtml(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    fetchEmailTemplatePreviewHtml(previewId)
      .then((html) => {
        setPreviewHtml(html);
        setPreviewError(null);
      })
      .catch((err) => {
        setPreviewHtml(null);
        setPreviewError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setPreviewLoading(false));
  }, [previewId]);

  const handleUse = useCallback(
    async (templateId: string) => {
      setValidationLoading(true);
      setValidationModal(null);
      try {
        const template = await getEmailTemplate(templateId);
        const state = getWizardState();
        const products = (state.products as Array<unknown>) ?? [];
        const selectedImages = (state.selected_images as string[]) ?? [];
        const imgCount = template.img_count ?? 0;
        const productSlots = template.product_slots ?? 0;
        const hasImages = selectedImages.length;
        const hasProducts = products.length;
        const needsMoreImages = imgCount > 0 && hasImages < imgCount;
        const needsMoreProducts = productSlots > 0 && hasProducts < productSlots;
        if (needsMoreImages || needsMoreProducts) {
          setValidationModal({
            templateId,
            needsImages: imgCount,
            needsProducts: productSlots,
            hasImages,
            hasProducts,
          });
          return;
        }
        setWizardState({ template_id: templateId });
        router.push("/email-marketing/new/generate");
      } catch (_e) {
        setWizardState({ template_id: templateId });
        router.push("/email-marketing/new/generate");
      } finally {
        setValidationLoading(false);
      }
    },
    [router]
  );

  const closeValidationModal = () => setValidationModal(null);
  const continueAnyway = () => {
    if (validationModal) {
      setWizardState({ template_id: validationModal.templateId });
      router.push("/email-marketing/new/generate");
      closeValidationModal();
    }
  };

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Template"
          description="Choose an email template for this campaign (optional). Preview to see desktop and mobile."
        />

        {isLoading ? (
          <LoadingSkeleton className="h-64 rounded-lg" />
        ) : (
          <ScrollArea className="h-[65vh] min-h-[420px] rounded-lg border border-border bg-card">
            <ul className="grid min-h-0 gap-4 p-4 sm:grid-cols-2 md:grid-cols-3">
              {templates.map((t) => (
                <li key={t.id} className="flex">
                  <div
                    className={`flex w-full flex-col overflow-hidden rounded-lg border transition ${
                      selected === t.id ? "border-brand-500 bg-brand-50 ring-1 ring-brand-500" : "border-border bg-card hover:border-fg-muted/30"
                    }`}
                    style={{ height: CARD_HEIGHT }}
                  >
                    <div className="h-[200px] shrink-0 overflow-hidden bg-fg-muted/10">
                      {t.image_url ? (
                        <img
                          src={t.image_url}
                          alt=""
                          className="h-full w-full object-cover object-top"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-fg-muted text-sm">
                          No preview image
                        </div>
                      )}
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col justify-between gap-2 p-3">
                      <div className="min-h-0 overflow-hidden">
                        <p className="truncate font-medium text-fg">
                          {t.name}
                        </p>
                        <p className="text-body-small text-fg-muted">({t.type})</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setPreviewId(t.id)}
                        >
                          Preview
                        </Button>
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleUse(t.id)}
                          disabled={validationLoading}
                        >
                          {validationLoading ? "Checking…" : "Use this template"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}

        {templates.length === 0 && !isLoading && (
          <p className="text-body-small text-fg-muted">No email templates yet. You can still continue; the runner will generate a simple email.</p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => router.push("/email-marketing/new/generate")}>
            Next: Generate
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/email-marketing/new/images">Back</Link>
          </Button>
        </div>
      </Stack>

      {/* Template requirements validation modal */}
      {validationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={closeValidationModal} aria-hidden />
          <div
            className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="validation-modal-title"
          >
            <h2 id="validation-modal-title" className="text-body font-semibold text-fg mb-2">
              Template needs more content
            </h2>
            <p className="text-body-small text-fg-muted mb-4">
              This template expects up to <strong>{validationModal.needsImages} image(s)</strong> and{" "}
              <strong>{validationModal.needsProducts} product(s)</strong>. You have {validationModal.hasImages} image(s) and{" "}
              {validationModal.hasProducts} product(s). Add more or continue anyway (some slots may be empty).
            </p>
            <div className="flex flex-wrap gap-2">
              {validationModal.needsImages > validationModal.hasImages && (
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/email-marketing/new/images" onClick={closeValidationModal}>
                    Add more images
                  </Link>
                </Button>
              )}
              {validationModal.needsProducts > validationModal.hasProducts && (
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/email-marketing/new/products" onClick={closeValidationModal}>
                    Add more products
                  </Link>
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={continueAnyway}>
                Continue anyway
              </Button>
              <Button variant="secondary" size="sm" onClick={closeValidationModal}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal: same-height scrollable containers */}
      {previewId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setPreviewId(null)}
            aria-hidden
          />
          <div
            className="relative z-10 flex h-[85vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="preview-title"
          >
            <div className="flex shrink-0 items-center justify-between border-b bg-card px-4 py-3">
              <h2 id="preview-title" className="text-lg font-semibold">
                Template preview — Desktop &amp; mobile
              </h2>
              <Button variant="secondary" size="sm" onClick={() => setPreviewId(null)}>
                Close
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4">
              {/* Desktop column */}
              <div className="flex flex-1 flex-col gap-2 overflow-hidden" style={{ minWidth: 0 }}>
                <span className="shrink-0 text-body-small font-medium text-fg-muted">Desktop (600px)</span>
                <div
                  className="min-h-0 flex-1 overflow-hidden rounded border border-border bg-fg-muted/5"
                  style={{ maxHeight: "100%" }}
                >
                  {previewLoading && (
                    <div className="flex h-full items-center justify-center text-fg-muted">
                      Loading preview…
                    </div>
                  )}
                  {previewError && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-fg-muted">
                      <p className="text-sm font-medium text-red-600">Preview failed</p>
                      <p className="text-body-small break-words">{previewError}</p>
                      {previewError.includes("Cannot GET") && (
                        <p className="text-body-small">Redeploy the Control Plane with the latest version to enable template previews.</p>
                      )}
                    </div>
                  )}
                  {previewHtml && !previewError && (
                    <ScrollArea className="h-full w-full">
                      <div className="p-2" style={{ width: 600 }}>
                        <iframe
                          title="Desktop preview"
                          srcDoc={previewHtml}
                          className="min-h-[600px] w-full border-0"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
              {/* Mobile column */}
              <div className="flex flex-1 flex-col gap-2 overflow-hidden" style={{ minWidth: 0, maxWidth: 375 }}>
                <span className="shrink-0 text-body-small font-medium text-fg-muted">Mobile (375px)</span>
                <div
                  className="min-h-0 flex-1 overflow-hidden rounded border border-border bg-fg-muted/5"
                  style={{ maxHeight: "100%" }}
                >
                  {previewLoading && (
                    <div className="flex h-full items-center justify-center text-fg-muted">
                      Loading preview…
                    </div>
                  )}
                  {previewError && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-fg-muted">
                      <p className="text-sm font-medium text-red-600">Preview failed</p>
                      <p className="text-body-small break-words">{previewError}</p>
                      {previewError.includes("Cannot GET") && (
                        <p className="text-body-small">Redeploy the Control Plane with the latest version to enable template previews.</p>
                      )}
                    </div>
                  )}
                  {previewHtml && !previewError && (
                    <ScrollArea className="h-full w-full">
                      <div className="p-2" style={{ width: 375 }}>
                        <iframe
                          title="Mobile preview"
                          srcDoc={previewHtml}
                          className="min-h-[600px] w-full border-0"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    </ScrollArea>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </PageFrame>
  );
}
