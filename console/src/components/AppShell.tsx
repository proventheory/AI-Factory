"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dropdown, Drawer } from "@/components/ui";
import { CommandPalette } from "@/components/CommandPalette";

const NAV_GROUPS: { title: string; items: { href: string; label: string }[] }[] = [
  {
    title: "DASHBOARD",
    items: [
      { href: "/dashboard", label: "Overview" },
      { href: "/health", label: "Scheduler Health" },
    ],
  },
  {
    title: "ORCHESTRATION",
    items: [
      { href: "/initiatives", label: "Initiatives" },
      { href: "/plans", label: "Plans" },
      { href: "/runs", label: "Pipeline Runs" },
      { href: "/jobs", label: "Jobs" },
      { href: "/tool-calls", label: "Tool Calls" },
      { href: "/artifacts", label: "Artifacts" },
      { href: "/approvals", label: "Approvals" },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/releases", label: "Releases" },
      { href: "/policies", label: "Policies" },
      { href: "/adapters", label: "Adapters" },
    ],
  },
  {
    title: "BRAND & DESIGN",
    items: [
      { href: "/brands", label: "Brands" },
      { href: "/document-templates", label: "Document Templates" },
    ],
  },
  {
    title: "MONITORING",
    items: [
      { href: "/analytics", label: "Analytics" },
      { href: "/incidents", label: "Incidents" },
      { href: "/audit", label: "Audit" },
    ],
  },
  {
    title: "OTHER",
    items: [
      { href: "/secrets", label: "Secrets" },
      { href: "/email-marketing", label: "Email Marketing" },
      { href: "/self-heal", label: "Self-heal" },
      { href: "/admin", label: "Admin" },
    ],
  },
];

function getBreadcrumbs(pathname: string | null): { href: string; label: string }[] {
  if (!pathname || pathname === "/") return [{ href: "/", label: "Home" }];
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  const labels: Record<string, string> = {
    login: "Login",
    dashboard: "Overview",
    health: "Scheduler Health",
    initiatives: "Initiatives",
    plans: "Plans",
    runs: "Pipeline Runs",
    jobs: "Jobs",
    "tool-calls": "Tool Calls",
    artifacts: "Artifacts",
    approvals: "Approvals",
    releases: "Releases",
    policies: "Policies",
    adapters: "Adapters",
    incidents: "Incidents",
    audit: "Audit",
    secrets: "Secrets",
    "email-marketing": "Email Marketing",
    "self-heal": "Self-heal",
    admin: "Admin",
    brands: "Brands",
    "document-templates": "Document Templates",
  };
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    acc += (acc ? "/" : "/") + segments[i];
    const label = labels[segments[i]] ?? segments[i];
    crumbs.push({ href: acc, label: i === segments.length - 1 && segments[i].length === 36 ? "Detail" : label });
  }
  return crumbs;
}

function NavContent({ pathname, onNavClick }: { pathname: string | null; onNavClick?: () => void }) {
  return (
    <>
      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-4">
          <div className="px-3 py-1.5 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {group.title}
          </div>
          <ul className="space-y-0.5">
            {group.items.map(({ href, label }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onNavClick}
                  className={`block px-3 py-2 rounded text-sm ${
                    pathname === href || (href !== "/" && pathname?.startsWith(href + "/"))
                      ? "bg-brand-600 text-white"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} title="Menu" side="left">
        <nav className="bg-slate-900 text-white -m-4 p-4 min-h-full">
          <NavContent pathname={pathname} onNavClick={() => setMobileNavOpen(false)} />
        </nav>
      </Drawer>
      <aside className="hidden md:flex w-56 bg-slate-900 text-white flex-col shrink-0">
        <div className="p-4 border-b border-slate-700">
          <Link href="/" className="text-xl font-bold">
            ProfessorX
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto p-2">
          <NavContent pathname={pathname} />
        </nav>
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 shrink-0 border-b border-border-subtle bg-white flex items-center px-4 gap-4">
          <button
            type="button"
            onClick={() => setMobileNavOpen(true)}
            className="md:hidden p-2 rounded-md text-text-secondary hover:bg-surface-sunken"
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
          <div className="flex-1 flex items-center justify-end gap-3">
            <select
              className="rounded-md border border-border-default bg-white px-3 py-1.5 text-body-small text-text-primary focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
          <div className="min-w-0 p-6 md:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
