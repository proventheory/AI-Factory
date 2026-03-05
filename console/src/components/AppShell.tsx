"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dropdown, Drawer } from "@/components/ui";
import { CommandPalette } from "@/components/CommandPalette";
import { IconBar } from "@/components/IconBar";
import {
  BRANCHES,
  getGroupsForBranch,
  getBranchForHref,
  getBreadcrumbs,
  type NavGroup,
  type NavItem,
  type BranchId,
} from "@/config/nav";

function filterItemsForDisplay(items: NavItem[]): NavItem[] {
  // TODO: apply predicates (featureFlag, requiresPermission, requiresEnv) when those systems exist.
  return items;
}

function NavContent({
  pathname,
  groups,
  onNavClick,
}: {
  pathname: string | null;
  groups: NavGroup[];
  onNavClick?: () => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.title} className="mb-4">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {group.title}
          </div>
          <ul className="space-y-0.5">
            {filterItemsForDisplay(group.items).map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavClick}
                  className={`block px-3 py-2.5 min-h-[44px] flex items-center rounded-lg text-sm touch-manipulation ${
                    pathname === href || (href !== "/" && pathname?.startsWith(href + "/"))
                      ? "bg-brand-600 text-white font-medium"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                  aria-current={pathname === href || (href !== "/" && pathname?.startsWith(href + "/")) ? "page" : undefined}
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const breadcrumbs = getBreadcrumbs(pathname);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState<BranchId | null>("command");

  useEffect(() => {
    const branch = getBranchForHref(pathname ?? "");
    setActiveBranchId(branch ?? "command");
  }, [pathname]);

  const groups = getGroupsForBranch(activeBranchId ?? "command");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Menu" side="left">
        <nav className="bg-slate-900 text-white min-h-full flex flex-col safe-area-padding drawer-nav">
          <div className="flex gap-2 mb-4 overflow-x-auto pb-2 md:hidden shrink-0">
            {BRANCHES.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setActiveBranchId(b.id)}
                className={`shrink-0 rounded-lg px-3 py-2.5 text-sm min-h-[44px] touch-manipulation ${
                  activeBranchId === b.id ? "bg-brand-600 text-white" : "bg-slate-800 text-slate-300"
                }`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <NavContent pathname={pathname} groups={groups} onNavClick={() => setMobileNavOpen(false)} />
        </nav>
      </Drawer>
      <IconBar activeBranchId={activeBranchId} onSelect={setActiveBranchId} branches={BRANCHES} />
      <aside className="hidden md:flex w-56 flex-col shrink-0 border-r border-slate-800 bg-slate-900 text-white">
        <div className="p-4 border-b border-slate-700">
          <Link href="/" className="text-xl font-bold">
            ProfessorX
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <NavContent pathname={pathname} groups={groups} />
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="min-h-14 shrink-0 border-b border-border-subtle bg-white flex items-center px-4 sm:px-6 gap-2 sm:gap-4 py-2 safe-area-padding">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center p-2 -ml-2 rounded-md text-text-secondary hover:bg-surface-sunken touch-manipulation"
            aria-label="Open menu"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <nav className="flex items-center gap-2 text-sm text-text-secondary" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-2">
                {i > 0 && <span className="text-border-default">/</span>}
                <Link href={crumb.href} className="hover:text-brand-600 transition-colors">
                  {crumb.label}
                </Link>
              </span>
            ))}
          </nav>
          <div className="flex-1 flex items-center justify-end gap-2 sm:gap-3 min-h-[44px]">
            <select
              className="rounded-md border border-border-default bg-white px-3 py-2 min-h-[44px] text-body-small text-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 touch-manipulation"
              aria-label="Environment"
            >
              <option value="sandbox">sandbox</option>
              <option value="staging">staging</option>
              <option value="prod">prod</option>
            </select>
            <CommandPalette />
            <Dropdown
              align="right"
              trigger={
                <span className="inline-flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-surface-sunken flex items-center justify-center text-body-small font-medium text-text-secondary">
                    U
                  </span>
                  <span className="text-body-small text-text-secondary hidden sm:inline">Account</span>
                  <svg className="h-4 w-4 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              }
              items={[
                { label: "Profile", href: "/profile" },
                { label: "Settings", href: "/settings" },
                { label: "Sign out", onClick: () => {}, danger: true },
              ]}
            />
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-y-auto">
          <div className="min-w-0 p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
