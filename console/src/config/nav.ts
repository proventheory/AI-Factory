/**
 * Nav config: single source of truth for branches, groups, items, and breadcrumb labels.
 * Used by AppShell, IconBar, CommandPalette. See docs/MENU_AND_NAV_IMPLEMENTATION_PLAN.md.
 */

export type BranchId =
  | "command"
  | "orchestration"
  | "studio"
  | "data-config"
  | "system"
  | "builder";

export type NavItemPredicates = {
  requiresPermission?: string;
  featureFlag?: string;
  requiresEnv?: ("prod" | "staging" | "sandbox")[];
};

export type NavItem = {
  href: string;
  label: string;
  branchId: BranchId;
  predicates?: NavItemPredicates;
};

/** True if item should be shown. Feature flags: NEXT_PUBLIC_FEATURE_<FLAG>; hide only when explicitly "false". Default = show (enable all). */
export function isNavItemVisible(item: NavItem): boolean {
  const p = item.predicates;
  if (!p) return true;
  if (p.featureFlag) {
    const key = `NEXT_PUBLIC_FEATURE_${p.featureFlag.toUpperCase().replace(/-/g, "_")}` as keyof typeof process.env;
    if (process.env[key] === "false") return false;
  }
  // requiresPermission / requiresEnv: not yet implemented; treat as visible
  return true;
}

export type NavGroup = { title: string; items: NavItem[] };

export type BranchDef = {
  id: BranchId;
  label: string;
  icon: "layout-dashboard" | "workflow" | "palette" | "database" | "shield" | "layers";
};

export const BRANCH_GROUP_IDS: Record<BranchId, string[]> = {
  command: ["DASHBOARD"],
  orchestration: ["ORCHESTRATION"],
  "data-config": ["CONFIG"],
  studio: ["BRAND & DESIGN"],
  system: ["MONITORING", "OTHER"],
  builder: [],
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "DASHBOARD",
    items: [
      { href: "/dashboard", label: "Overview", branchId: "command" },
      { href: "/health", label: "Scheduler Health", branchId: "command" },
      { href: "/planner", label: "Planner", branchId: "command" },
      { href: "/cost-dashboard", label: "Cost Dashboard", branchId: "command" },
    ],
  },
  {
    title: "ORCHESTRATION",
    items: [
      { href: "/initiatives", label: "Initiatives", branchId: "orchestration" },
      { href: "/email-marketing", label: "Email Design Generator", branchId: "orchestration" },
      { href: "/landing-page-generator", label: "Landing Page Generator", branchId: "orchestration" },
      { href: "/plans", label: "Plans", branchId: "orchestration" },
      { href: "/runs", label: "Pipeline Runs", branchId: "orchestration" },
      { href: "/jobs", label: "Jobs", branchId: "orchestration" },
      { href: "/tool-calls", label: "Tool Calls", branchId: "orchestration" },
      { href: "/artifacts", label: "Artifacts", branchId: "orchestration" },
      { href: "/approvals", label: "Approvals", branchId: "orchestration" },
      { href: "/ai-calls", label: "AI Calls", branchId: "orchestration" },
    ],
  },
  {
    title: "CONFIG",
    items: [
      { href: "/releases", label: "Releases", branchId: "data-config" },
      { href: "/policies", label: "Policies", branchId: "data-config" },
      { href: "/routing-policies", label: "Routing Policies", branchId: "data-config" },
      { href: "/llm-budgets", label: "LLM Budgets", branchId: "data-config" },
      { href: "/adapters", label: "Adapters", branchId: "data-config" },
      { href: "/mcp-servers", label: "MCP Servers", branchId: "data-config" },
    ],
  },
  {
    title: "BRAND & DESIGN",
    items: [
      { href: "/brands", label: "Brands", branchId: "studio" },
      { href: "/document-templates", label: "Document Templates", branchId: "studio" },
      { href: "/template-proofing", label: "Template Proofing", branchId: "studio" },
      { href: "/tokens", label: "Token Registry", branchId: "studio" },
      { href: "/components", label: "Component Registry", branchId: "studio" },
    ],
  },
  {
    title: "MONITORING",
    items: [
      { href: "/analytics", label: "Analytics", branchId: "system" },
      { href: "/incidents", label: "Incidents", branchId: "system" },
      { href: "/audit", label: "Audit", branchId: "system" },
      {
        href: "/webhook-outbox",
        label: "Webhook Outbox",
        branchId: "system",
        predicates: { featureFlag: "webhook_outbox" },
      },
    ],
  },
  {
    title: "OTHER",
    items: [
      { href: "/secrets", label: "Secrets", branchId: "system" },
      { href: "/self-heal", label: "Self-heal", branchId: "system" },
      { href: "/admin", label: "Admin", branchId: "system" },
      { href: "/agent-memory", label: "Agent Memory", branchId: "system" },
    ],
  },
];

export const BRANCHES: BranchDef[] = [
  { id: "command", label: "Command", icon: "layout-dashboard" },
  { id: "orchestration", label: "Orchestration", icon: "workflow" },
  { id: "studio", label: "Studio", icon: "palette" },
  { id: "data-config", label: "Data & config", icon: "database" },
  { id: "system", label: "System", icon: "shield" },
];

/** Breadcrumb segment -> label map (covers all nav routes + common segments). */
export const SEGMENT_LABELS: Record<string, string> = {
  profile: "Profile",
  settings: "Settings",
  login: "Login",
  dashboard: "Overview",
  health: "Scheduler Health",
  planner: "Planner",
  "cost-dashboard": "Cost Dashboard",
  initiatives: "Initiatives",
  plans: "Plans",
  runs: "Pipeline Runs",
  jobs: "Jobs",
  "tool-calls": "Tool Calls",
  artifacts: "Artifacts",
  approvals: "Approvals",
  "ai-calls": "AI Calls",
  releases: "Releases",
  policies: "Policies",
  "routing-policies": "Routing Policies",
  "llm-budgets": "LLM Budgets",
  adapters: "Adapters",
  "mcp-servers": "MCP Servers",
  brands: "Brands",
  "document-templates": "Document Templates",
  "template-proofing": "Template Proofing",
  analytics: "Analytics",
  incidents: "Incidents",
  audit: "Audit",
  "webhook-outbox": "Webhook Outbox",
  secrets: "Secrets",
  "email-marketing": "Email Design Generator",
  "landing-page-generator": "Landing Page Generator",
  "new": "New",
  "brand": "Brand",
  "products": "Products",
  "template": "Template",
  "generate": "Generate",
  "campaigns": "Campaigns",
  "edit": "Edit",
  "self-heal": "Self-heal",
  admin: "Admin",
  "agent-memory": "Agent Memory",
  tokens: "Token Registry",
  components: "Component Registry",
};

export function getAllNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items);
}

/** All nav items that pass visibility predicates (feature flags, etc.). Use for CommandPalette and any filtered list. */
export function getAllVisibleNavItems(): NavItem[] {
  return getAllNavItems().filter(isNavItemVisible);
}

export function getGroupsForBranch(branchId: BranchId): NavGroup[] {
  const titles = BRANCH_GROUP_IDS[branchId] ?? [];
  return NAV_GROUPS.filter((g) => titles.includes(g.title));
}

/** Resolve branch for href. Prefer explicit item.branchId; fallback for dynamic routes. */
export function getBranchForHref(href: string): BranchId | null {
  const item = getAllNavItems().find(
    (i) => i.href === href || (href !== "/" && href.startsWith(i.href + "/"))
  );
  if (item) return item.branchId;
  for (const [branchId, titles] of Object.entries(BRANCH_GROUP_IDS)) {
    const groups = NAV_GROUPS.filter((g) => titles.includes(g.title));
    if (
      groups.some((g) =>
        g.items.some((i) => i.href === href || href.startsWith(i.href + "/"))
      )
    ) {
      return branchId as BranchId;
    }
  }
  return null;
}

export function getBreadcrumbs(pathname: string | null): { href: string; label: string }[] {
  if (!pathname || pathname === "/")
    return [{ href: "/", label: "Home" }];
  const segments = pathname.split("/").filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: "/", label: "Home" }];
  let acc = "";
  for (let i = 0; i < segments.length; i++) {
    acc += (acc ? "/" : "/") + segments[i];
    const seg = segments[i];
    const label =
      SEGMENT_LABELS[seg] ??
      (seg.length === 36 ? "Detail" : seg);
    crumbs.push({ href: acc, label });
  }
  return crumbs;
}
