"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command as CmdkCommand } from "cmdk";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { label: string; href: string }[] = [
  { label: "Overview", href: "/dashboard" },
  { label: "Initiatives", href: "/initiatives" },
  { label: "Plans", href: "/plans" },
  { label: "Pipeline Runs", href: "/runs" },
  { label: "Jobs", href: "/jobs" },
  { label: "Artifacts", href: "/artifacts" },
  { label: "Approvals", href: "/approvals" },
  { label: "Tool Calls", href: "/tool-calls" },
  { label: "Releases", href: "/releases" },
  { label: "Policies", href: "/policies" },
  { label: "Adapters", href: "/adapters" },
  { label: "Incidents", href: "/incidents" },
  { label: "Audit", href: "/audit" },
  { label: "Secrets", href: "/secrets" },
  { label: "Scheduler Health", href: "/health" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const run = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-44 rounded-md border border-border-default bg-white px-3 py-1.5 text-left text-body-small text-text-muted placeholder:text-text-muted focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        aria-label="Search (⌘K)"
      >
        Search (⌘K)
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          aria-hidden
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 rounded-lg border border-border-default bg-white shadow-lg">
          <CmdkCommand className="rounded-lg overflow-hidden">
            <input
              className="flex h-12 w-full border-0 border-b border-border-subtle bg-transparent px-4 text-body-default placeholder:text-text-muted focus:outline-none focus:ring-0"
              placeholder="Type a command or search..."
              autoFocus
            />
            <CmdkCommand.List className="max-h-[300px] overflow-y-auto p-2">
              <CmdkCommand.Empty className="py-6 text-center text-body-small text-text-muted">
                No results found.
              </CmdkCommand.Empty>
              <CmdkCommand.Group className="px-2 py-1.5">
                {NAV_ITEMS.map((item) => (
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
            </CmdkCommand.List>
          </CmdkCommand>
        </div>
      )}
    </>
  );
}
