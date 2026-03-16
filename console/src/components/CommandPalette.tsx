"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Command as CmdkCommand } from "cmdk";
import { cn } from "@/lib/utils";
import { getAllVisibleNavItems } from "@/config/nav";

const API = process.env.NEXT_PUBLIC_CONTROL_PLANE_API ?? "http://localhost:3001";

type SearchItem = {
  object_type: string;
  id: string;
  run_id?: string;
  status?: string | null;
  environment?: string | null;
  created_at: string;
  title?: string | null;
  intent_type?: string | null;
};

export function CommandPalette({ environment }: { environment?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchItems, setSearchItems] = useState<SearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();
  const navItems = getAllVisibleNavItems();

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery("");
      router.push(href);
    },
    [router]
  );

  const goToEntity = useCallback(
    (item: SearchItem) => {
      setOpen(false);
      setQuery("");
      const runId = item.run_id;
      if (item.object_type === "initiative") router.push(`/initiatives/${item.id}`);
      else if (item.object_type === "run") router.push(`/runs/${item.id}`);
      else if (item.object_type === "release") router.push(`/releases`);
      else if (item.object_type === "artifact") router.push(runId ? `/runs/${runId}` : `/admin/artifacts/${item.id}`);
      else if (item.object_type === "job_run" || item.object_type === "tool_call") router.push(runId ? `/runs/${runId}` : `/runs`);
      else router.push(runId ? `/runs/${runId}` : `/runs`);
    },
    [router]
  );

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchItems([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchLoading(true);
      const params = new URLSearchParams({ q: query.trim(), limit: "15" });
      if (environment) params.set("environment", environment);
      fetch(`${API}/v1/search?${params}`)
        .then((r) => r.json())
        .then((data) => setSearchItems(data.items ?? []))
        .catch(() => setSearchItems([]))
        .finally(() => setSearchLoading(false));
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, environment]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
        if (!open) setQuery("");
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open]);

  const hasSearch = query.trim().length >= 2;
  const hasNav = !hasSearch || searchItems.length === 0;
  const showEmpty = hasSearch && !searchLoading && searchItems.length === 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-w-[44px] min-h-[44px] w-32 sm:w-44 rounded-md border border-border-default bg-white px-3 py-2 text-left text-body-small text-text-muted placeholder:text-text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 touch-manipulation"
        aria-label="Search (⌘K)"
      >
        <span className="hidden sm:inline">Search (⌘K)</span>
        <span className="sm:hidden" aria-hidden>
          <svg className="h-5 w-5 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="fixed left-4 right-4 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-xl sm:-translate-x-1/2 top-[10vh] sm:top-[15%] z-50 rounded-lg border border-border-default bg-white shadow-lg safe-area-padding">
          <CmdkCommand
            className="rounded-lg overflow-hidden"
            filter={() => 1}
            value={query}
            onValueChange={setQuery}
          >
            <input
              className="flex h-12 w-full border-0 border-b border-border-subtle bg-transparent px-4 text-body-default placeholder:text-text-muted focus:outline-none focus:ring-0"
              placeholder="Search initiatives, runs, jobs… or navigate (⌘K)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <CmdkCommand.List className="max-h-[320px] overflow-y-auto p-2">
              {showEmpty && (
                <CmdkCommand.Empty className="py-6 text-center text-body-small text-text-muted">
                  No entities found. Try navigation below.
                </CmdkCommand.Empty>
              )}
              {hasSearch && searchItems.length > 0 && (
                <CmdkCommand.Group heading="Entities" className="px-2 py-1.5">
                  {searchItems.map((item) => (
                    <CmdkCommand.Item
                      key={`${item.object_type}-${item.id}`}
                      value={`${item.object_type}-${item.id}-${item.title ?? ""}-${item.status ?? ""}`}
                      onSelect={() => goToEntity(item)}
                      className={cn(
                        "flex cursor-pointer rounded-md px-3 py-2 text-body-small outline-none gap-2",
                        "aria-selected:bg-brand-50 aria-selected:text-brand-700"
                      )}
                    >
                      <span className="shrink-0 text-text-muted capitalize">{item.object_type.replace("_", " ")}</span>
                      <span className="truncate">{item.title ?? item.id}</span>
                      {item.status && <span className="shrink-0 text-text-muted">{item.status}</span>}
                    </CmdkCommand.Item>
                  ))}
                </CmdkCommand.Group>
              )}
              {hasNav && (
                <CmdkCommand.Group heading="Navigation" className="px-2 py-1.5">
                  {navItems.map((item) => (
                    <CmdkCommand.Item
                      key={item.href}
                      value={`${item.label} ${item.href}`}
                      onSelect={() => run(item.href)}
                      className={cn(
                        "flex cursor-pointer rounded-md px-3 py-2 text-body-small outline-none",
                        "aria-selected:bg-brand-50 aria-selected:text-brand-700"
                      )}
                    >
                      {item.label}
                    </CmdkCommand.Item>
                  ))}
                </CmdkCommand.Group>
              )}
            </CmdkCommand.List>
          </CmdkCommand>
        </div>
      )}
    </>
  );
}
