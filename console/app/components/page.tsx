"use client";

import { useState, useCallback, useEffect } from "react";
import {
  PageFrame,
  Stack,
  PageHeader,
  CardSection,
  TableFrame,
  DataTable,
  Button,
  LoadingSkeleton,
  EmptyState,
  Modal,
  Input,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui";
import type { Column } from "@/components/ui/DataTable";
import { useBrandProfiles } from "@/hooks/use-api";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

const USE_CONTEXT_LABELS: Record<string, string> = {
  email: "Email",
  deck: "Deck",
  report: "Report",
  landing_page: "Landing page",
};

function useContextLabel(value: string | null | undefined): string {
  const v = (value ?? "email").toLowerCase();
  return USE_CONTEXT_LABELS[v] ?? v;
}

type EmailComponentRow = {
  id: string;
  component_type: string;
  name: string;
  description: string | null;
  mjml_fragment: string | null;
  html_fragment?: string | null;
  placeholder_docs: string[];
  position: number;
  use_context?: string | null;
  created_at: string;
  updated_at: string;
};

export default function ComponentRegistryPage() {
  const [items, setItems] = useState<EmailComponentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState({
    component_type: "",
    name: "",
    description: "",
    mjml_fragment: "",
    html_fragment: "",
    placeholder_docs: "" as string,
    position: 0,
    use_context: "email",
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBrandId, setPreviewBrandId] = useState<string>("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const { data: brandsData } = useBrandProfiles();
  const brands = brandsData?.items ?? [];

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/v1/email_component_library?limit=200`);
      if (!r.ok) throw new Error(await r.text());
      const data = (await r.json()) as { items?: EmailComponentRow[] };
      const list = data.items ?? [];
      setItems(
        list.map((row) => ({
          ...row,
          placeholder_docs: Array.isArray(row.placeholder_docs) ? row.placeholder_docs : [],
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const openCreate = () => {
    setEditingId(null);
    setForm({
      component_type: "",
      name: "",
      description: "",
      mjml_fragment: "",
      html_fragment: "",
      placeholder_docs: "",
      position: items.length,
      use_context: "email",
    });
    setModalOpen(true);
  };

  const openEdit = (row: EmailComponentRow) => {
    setEditingId(row.id);
    setForm({
      component_type: row.component_type,
      name: row.name,
      description: row.description ?? "",
      mjml_fragment: row.mjml_fragment ?? "",
      html_fragment: row.html_fragment ?? "",
      placeholder_docs: Array.isArray(row.placeholder_docs) ? row.placeholder_docs.join(", ") : "",
      position: row.position ?? 0,
      use_context: (row.use_context ?? "email").toLowerCase(),
    });
    setModalOpen(true);
  };

  useEffect(() => {
    if (!previewId) {
      setPreviewHtml(null);
      setPreviewError(null);
      setPreviewLoading(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewError(null);
    fetch(`${API}/v1/email_component_library/${previewId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Not found"))))
      .then((row: { html_fragment?: string | null; mjml_fragment?: string | null; use_context?: string | null }) => {
        const useContext = (row.use_context ?? "email").toLowerCase();
        const hasHtml = row.html_fragment != null && String(row.html_fragment).trim() !== "";
        if (useContext === "landing_page" && hasHtml) {
          const html = String(row.html_fragment).trim();
          setPreviewHtml(`<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body>${html}</body></html>`);
          setPreviewLoading(false);
          return;
        }
        const params = new URLSearchParams({ ids: previewId, format: "html" });
        if (previewBrandId && previewBrandId.trim()) params.set("brand_profile_id", previewBrandId.trim());
        return fetch(`${API}/v1/email_component_library/assembled?${params.toString()}`)
          .then(async (r) => {
            const text = await r.text();
            if (!r.ok) throw new Error(text);
            return text;
          })
          .then((text) => {
            setPreviewHtml(text);
            setPreviewLoading(false);
          });
      })
      .catch((e) => {
        setPreviewError(e instanceof Error ? e.message : String(e));
        setPreviewLoading(false);
      });
  }, [previewId, previewBrandId]);

  const handleSave = async () => {
    const hasMjml = form.mjml_fragment.trim() !== "";
    const hasHtml = form.html_fragment.trim() !== "";
    const useContext = (form.use_context || "email").trim().toLowerCase() || "email";
    const canSave =
      form.component_type.trim() !== "" &&
      form.name.trim() !== "" &&
      (hasMjml || hasHtml);
    if (!canSave) return;
    setSaveBusy(true);
    try {
      const placeholder_docs = form.placeholder_docs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const payload = {
        component_type: form.component_type.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        mjml_fragment: hasMjml ? form.mjml_fragment : null,
        html_fragment: hasHtml ? form.html_fragment : null,
        placeholder_docs,
        position: Number(form.position) || 0,
        use_context: useContext,
      };
      if (editingId) {
        const r = await fetch(`${API}/v1/email_component_library/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(await r.text());
      } else {
        const r = await fetch(`${API}/v1/email_component_library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) throw new Error(await r.text());
      }
      setModalOpen(false);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaveBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleteBusy(true);
    try {
      const r = await fetch(`${API}/v1/email_component_library/${deleteId}`, { method: "DELETE" });
      if (!r.ok) throw new Error(await r.text());
      setDeleteId(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const columns: Column<EmailComponentRow>[] = [
    { key: "component_type", header: "Type", render: (r) => <span className="font-mono text-sm">{r.component_type}</span> },
    { key: "name", header: "Name" },
    {
      key: "use_context",
      header: "For",
      render: (r) => (
        <span className="text-sm font-medium text-fg">
          {useContextLabel(r.use_context)}
        </span>
      ),
    },
    {
      key: "description",
      header: "Description",
      render: (r) => (r.description ? <span className="text-sm text-slate-600 dark:text-slate-400">{r.description}</span> : "—"),
    },
    {
      key: "placeholder_docs",
      header: "Placeholders",
      render: (r) =>
        Array.isArray(r.placeholder_docs) && r.placeholder_docs.length > 0 ? (
          <span className="text-xs text-slate-500">{r.placeholder_docs.slice(0, 3).join(", ")}{r.placeholder_docs.length > 3 ? "…" : ""}</span>
        ) : (
          "—"
        ),
    },
    { key: "position", header: "Order", render: (r) => r.position },
    {
      key: "actions",
      header: "",
      render: (r) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => { setPreviewId(r.id); setPreviewBrandId(""); }}>
            Preview
          </Button>
          <Button variant="secondary" size="sm" onClick={() => openEdit(r)}>
            Edit
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setDeleteId(r.id)}>
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Component Registry"
          description="Reusable building blocks for emails, decks, or reports. Each component has a “For” (use context). Email components use placeholders per BRAND_EMAIL_FIELD_MAPPING. Use Preview to see a component with or without a brand; brand embeddings: open a brand → Brand Embeddings → Manage."
        />
        <CardSection>
          <div className="mb-4 flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={fetchList} disabled={loading}>
              {loading ? "Loading…" : "Refresh"}
            </Button>
            <Button onClick={openCreate}>Add component</Button>
          </div>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          {loading ? (
            <LoadingSkeleton className="h-48 w-full rounded-md" />
          ) : items.length === 0 ? (
            <EmptyState
              title="No email components"
              description="Run the seed script against your Control Plane URL (same API your Console uses): node scripts/seed-email-component-library.mjs [CONTROL_PLANE_URL]. This adds the default email components plus the Pharmacy Time footer (Landing page). Or add a component manually."
            />
          ) : (
            <TableFrame>
              <DataTable columns={columns} data={items} keyExtractor={(r) => r.id} />
            </TableFrame>
          )}
        </CardSection>
      </Stack>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit component" : "Add component"}>
        <div className="p-2">
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Component type</label>
              <Input
                value={form.component_type}
                onChange={(e) => setForm((f) => ({ ...f, component_type: e.target.value }))}
                placeholder="e.g. hero_1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Display name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                {form.use_context === "landing_page" ? "MJML fragment (optional for Landing page)" : "MJML fragment"}
              </label>
              <textarea
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm min-h-[100px] p-2"
                value={form.mjml_fragment}
                onChange={(e) => setForm((f) => ({ ...f, mjml_fragment: e.target.value }))}
                placeholder={form.use_context === "landing_page" ? "Leave empty if using HTML fragment below" : "<mj-section>...</mj-section>"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">HTML fragment (for Landing page / WordPress footer)</label>
              <textarea
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm min-h-[120px] p-2"
                value={form.html_fragment}
                onChange={(e) => setForm((f) => ({ ...f, html_fragment: e.target.value }))}
                placeholder='<footer class="...">... use {{placeholders}} ...</footer>'
              />
              <p className="text-xs text-slate-500 mt-1">Use when For = Landing page. Placeholders as {"{{name}}"}. Include &lt;style&gt; if needed.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Placeholders (comma-separated)</label>
              <Input
                value={form.placeholder_docs}
                onChange={(e) => setForm((f) => ({ ...f, placeholder_docs: e.target.value }))}
                placeholder="logo, headline, body"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Position</label>
              <Input
                type="number"
                value={form.position}
                onChange={(e) => setForm((f) => ({ ...f, position: Number(e.target.value) || 0 }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">For (use context)</label>
              <select
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
                value={form.use_context}
                onChange={(e) => setForm((f) => ({ ...f, use_context: e.target.value }))}
              >
                <option value="email">Email</option>
                <option value="deck">Deck</option>
                <option value="report">Report</option>
                <option value="landing_page">Landing page</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">Where this component is used (email templates, decks, reports, landing pages).</p>
            </div>
          </div>
          <div className="mt-6 flex gap-2">
            <Button
              onClick={handleSave}
              disabled={
                saveBusy ||
                !form.component_type.trim() ||
                !form.name.trim() ||
                (form.mjml_fragment.trim() === "" && form.html_fragment.trim() === "")
              }
            >
              {saveBusy ? "Saving…" : editingId ? "Save" : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!previewId} onClose={() => setPreviewId(null)} title="Component preview">
        <div className="p-2 space-y-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Preview with brand (optional)</label>
            <select
              className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              value={previewBrandId}
              onChange={(e) => setPreviewBrandId(e.target.value)}
            >
              <option value="">No brand (placeholders as-is)</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-lg border border-border bg-white overflow-hidden min-h-[200px]">
            {previewLoading && (
              <div className="flex items-center justify-center h-48 text-fg-muted text-sm">Loading preview…</div>
            )}
            {previewError && (
              <div className="px-4 py-3 text-body-small text-state-danger">{previewError}</div>
            )}
            {previewHtml && !previewError && (
              <iframe
                title="Component preview"
                srcDoc={previewHtml}
                className="w-full min-h-[320px] border-0"
                sandbox="allow-same-origin"
              />
            )}
          </div>
        </div>
      </Modal>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete component?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Email templates that reference this component via component_sequence may break.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleteBusy} className="bg-red-600 hover:bg-red-700">
              {deleteBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageFrame>
  );
}
