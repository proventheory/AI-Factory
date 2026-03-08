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

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type EmailComponentRow = {
  id: string;
  component_type: string;
  name: string;
  description: string | null;
  mjml_fragment: string;
  placeholder_docs: string[];
  position: number;
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
    placeholder_docs: "" as string,
    position: 0,
  });
  const [saveBusy, setSaveBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      placeholder_docs: "",
      position: items.length,
    });
    setModalOpen(true);
  };

  const openEdit = (row: EmailComponentRow) => {
    setEditingId(row.id);
    setForm({
      component_type: row.component_type,
      name: row.name,
      description: row.description ?? "",
      mjml_fragment: row.mjml_fragment,
      placeholder_docs: Array.isArray(row.placeholder_docs) ? row.placeholder_docs.join(", ") : "",
      position: row.position ?? 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.component_type.trim() || !form.name.trim() || form.mjml_fragment.trim() === "")
      return;
    setSaveBusy(true);
    try {
      const placeholder_docs = form.placeholder_docs
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingId) {
        const r = await fetch(`${API}/v1/email_component_library/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            component_type: form.component_type.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            mjml_fragment: form.mjml_fragment,
            placeholder_docs,
            position: Number(form.position) || 0,
          }),
        });
        if (!r.ok) throw new Error(await r.text());
      } else {
        const r = await fetch(`${API}/v1/email_component_library`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            component_type: form.component_type.trim(),
            name: form.name.trim(),
            description: form.description.trim() || null,
            mjml_fragment: form.mjml_fragment,
            placeholder_docs,
            position: Number(form.position) || 0,
          }),
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
        <div className="flex gap-2">
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
          description="Email building blocks (header, hero, product blocks, footer) used to compose email templates. Placeholders follow BRAND_EMAIL_FIELD_MAPPING. Brand embeddings are managed per brand: open a brand → Brand Embeddings → Manage."
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
              description="Run the seed script to add the default set: node scripts/seed-email-component-library.mjs [CONTROL_PLANE_URL]. Or add a component manually."
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">MJML fragment</label>
              <textarea
                className="w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 font-mono text-sm min-h-[120px] p-2"
                value={form.mjml_fragment}
                onChange={(e) => setForm((f) => ({ ...f, mjml_fragment: e.target.value }))}
                placeholder="<mj-section>...</mj-section>"
              />
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
          </div>
          <div className="mt-6 flex gap-2">
            <Button onClick={handleSave} disabled={saveBusy || !form.component_type.trim() || !form.name.trim() || !form.mjml_fragment.trim()}>
              {saveBusy ? "Saving…" : editingId ? "Save" : "Create"}
            </Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
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
