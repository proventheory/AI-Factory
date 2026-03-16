# Menu structure and implementation plan (detailed)

This document expands the high-level menu/schema plan with concrete file paths, types, code shapes, schema DDL, API contracts, and step-by-step tasks so nothing is left implicit. Architecture traps and fixes: [NAV_ARCHITECTURE_TRAPS_AND_FIXES.md](NAV_ARCHITECTURE_TRAPS_AND_FIXES.md).

---

## 1. Data model: nav config (single source of truth)

### 1.1 Types (TypeScript)

```ts
// console/src/config/nav.ts (new file)

export type BranchId = "command" | "orchestration" | "studio" | "data-config" | "system" | "builder";

/** Optional predicates for RBAC, feature flags, environment. Item is shown only when all pass. */
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

export type NavGroup = { title: string; items: NavItem[] };

export type BranchDef = {
  id: BranchId;
  label: string;
  /** Icon name for IconBar; use a simple string key mapped to SVG in the component */
  icon: "layout-dashboard" | "workflow" | "palette" | "database" | "shield" | "layers";
};

/** Which NAV_GROUPS (by title) belong to each branch */
export const BRANCH_GROUP_IDS: Record<BranchId, string[]> = {
  command: ["DASHBOARD"],
  orchestration: ["ORCHESTRATION"],
  "data-config": ["CONFIG"],
  studio: ["BRAND & DESIGN"],
  system: ["MONITORING", "OTHER"],
  builder: ["BUILDER"],
};

/** All groups with their items. Each item has explicit branchId; pathname inference is fallback only. */
/** Data & config is split into sub-sections: Runtime policies, Integrations, Releases (no schema change). */
export const NAV_GROUPS: NavGroup[] = [
  { title: "DASHBOARD", items: [
    { href: "/dashboard", label: "Overview", branchId: "command" },
    { href: "/health", label: "Scheduler Health", branchId: "command" },
    { href: "/planner", label: "Planner", branchId: "command" },
    { href: "/cost-dashboard", label: "Cost Dashboard", branchId: "command" },
  ]},
  { title: "ORCHESTRATION", items: [
    { href: "/initiatives", label: "Initiatives", branchId: "orchestration" },
    { href: "/plans", label: "Plans", branchId: "orchestration" },
    { href: "/runs", label: "Pipeline Runs", branchId: "orchestration" },
    { href: "/jobs", label: "Jobs", branchId: "orchestration" },
    { href: "/tool-calls", label: "Tool Calls", branchId: "orchestration" },
    { href: "/artifacts", label: "Artifacts", branchId: "orchestration" },
    { href: "/approvals", label: "Approvals", branchId: "orchestration" },
    { href: "/ai-calls", label: "AI Calls", branchId: "orchestration" },
  ]},
  { title: "CONFIG", items: [
    { href: "/releases", label: "Releases", branchId: "data-config" },
    { href: "/policies", label: "Policies", branchId: "data-config" },
    { href: "/routing-policies", label: "Routing Policies", branchId: "data-config" },
    { href: "/llm-budgets", label: "LLM Budgets", branchId: "data-config" },
    { href: "/adapters", label: "Adapters", branchId: "data-config" },
    { href: "/mcp-servers", label: "MCP Servers", branchId: "data-config" },
  ]},
  { title: "BRAND & DESIGN", items: [
    { href: "/brands", label: "Brands", branchId: "studio" },
    { href: "/document-templates", label: "Document Templates", branchId: "studio" },
    { href: "/brand-themes", label: "Brand Themes", branchId: "studio" },
  ]},
  { title: "MONITORING", items: [
    { href: "/analytics", label: "Analytics", branchId: "system" },
    { href: "/incidents", label: "Incidents", branchId: "system" },
    { href: "/audit", label: "Audit", branchId: "system" },
    { href: "/webhook-outbox", label: "Webhook Outbox", branchId: "system", predicates: { featureFlag: "webhook_outbox" } },
  ]},
  { title: "OTHER", items: [
    { href: "/secrets", label: "Secrets", branchId: "system" },
    { href: "/email-marketing", label: "Email Marketing", branchId: "system" },
    { href: "/self-heal", label: "Self-heal", branchId: "system" },
    { href: "/admin", label: "Admin", branchId: "system" },
    { href: "/agent-memory", label: "Agent Memory", branchId: "system" },
  ]},
  { title: "BUILDER", items: [
    { href: "/tokens", label: "Token Registry", branchId: "builder" },
    { href: "/components", label: "Component Registry", branchId: "builder" },
  ]},
];

export const BRANCHES: BranchDef[] = [
  { id: "command", label: "Command", icon: "layout-dashboard" },
  { id: "orchestration", label: "Orchestration", icon: "workflow" },
  { id: "studio", label: "Studio", icon: "palette" },
  { id: "data-config", label: "Data & config", icon: "database" },
  { id: "system", label: "System", icon: "shield" },
  { id: "builder", label: "Builder", icon: "layers" },
];

/** Flat list of all nav items for CommandPalette and for "current branch" derivation */
export function getAllNavItems(): NavItem[] {
  return NAV_GROUPS.flatMap((g) => g.items);
}

/** Get groups for a branch (order preserved) */
export function getGroupsForBranch(branchId: BranchId): NavGroup[] {
  const titles = BRANCH_GROUP_IDS[branchId] ?? [];
  return NAV_GROUPS.filter((g) => titles.includes(g.title));
}

/** Which branch contains this href. Prefer explicit item.branchId; this is FALLBACK only (e.g. dynamic routes). */
export function getBranchForHref(href: string): BranchId | null {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === href || (href !== "/" && href.startsWith(i.href + "/")));
  if (item) return item.branchId;
  for (const [branchId, titles] of Object.entries(BRANCH_GROUP_IDS)) {
    const groups = NAV_GROUPS.filter((g) => titles.includes(g.title));
    if (groups.some((g) => g.items.some((i) => i.href === href || (href.startsWith(i.href + "/"))))) {
      return branchId as BranchId;
    }
  }
  return null;
}
```

### 1.2 Breadcrumb labels (extend existing)

Current labels live in `getBreadcrumbs()` inside `AppShell.tsx`. After extracting nav config, add a shared `SEGMENT_LABELS: Record<string, string>` in `console/src/config/nav.ts` (or keep in AppShell) that includes every path segment used in the app, including any new routes (e.g. `planner`, `cost-dashboard`, `ai-calls`, `mcp-servers`, etc.). AppShell’s `getBreadcrumbs` should read from this map so one place defines both nav items and breadcrumb labels.

---

## 2. Console UI: component and layout changes

### 2.1 New file: `console/src/components/IconBar.tsx`

- **Props:** `activeBranchId: BranchId | null`, `onSelect: (id: BranchId) => void`, `branches: BranchDef[]`.
- **Markup:** `<aside className="w-12 flex flex-col bg-slate-950 border-r border-slate-800">`. Top: logo/home link (optional). Then: `branches.map(b => <button key={b.id} aria-label={b.label} aria-current={activeBranchId === b.id ? "true" : undefined} onClick={() => onSelect(b.id)} className={...}>` + render icon for `b.icon`).
- **Icons:** Inline SVG for each of `layout-dashboard`, `workflow`, `palette`, `database`, `shield`, `layers` (e.g. 24x24 paths). No new icon library; keep SVGs in the same file or a tiny `console/src/components/icons/NavIcons.tsx` that exports React components per icon name.

### 2.2 Changes to `console/src/components/AppShell.tsx`

- **Imports:** Import `BRANCHES`, `getGroupsForBranch`, `getBranchForHref`, `getAllNavItems`, `NAV_GROUPS` (or equivalent) from `@/config/nav`.
- **State:** `const [activeBranchId, setActiveBranchId] = useState<BranchId | null>(null)`. On pathname change: resolve branch from **route config first** (e.g. lookup item by pathname and use `item.branchId`); use `getBranchForHref(pathname)` only as **fallback**; then `setActiveBranchId(resolved ?? "command")`.
- **Layout structure (desktop):**
  - First column: `<IconBar activeBranchId={activeBranchId} onSelect={setActiveBranchId} branches={BRANCHES} />`.
  - Second column: same as current sidebar but content = `<NavContent pathname={pathname} groups={getGroupsForBranch(activeBranchId ?? "command")} onNavClick={...} />` (so NavContent receives a **filtered** list of groups, not all NAV_GROUPS).
- **NavContent signature change:** `NavContent({ pathname, groups, onNavClick }: { pathname: string | null; groups: NavGroup[]; onNavClick?: () => void })`. It renders `groups.map(group => ...)` instead of `NAV_GROUPS.map`.
- **Drawer (mobile):** Content = same as desktop: IconBar (compact) + NavContent with filtered groups. Or: single scrollable list with section headers for each branch and all items (no filtering) so user can open any page without switching branch first. Specify which approach in implementation.
- **Breadcrumbs:** Keep `getBreadcrumbs(pathname)`; ensure it uses the same segment→label map as nav (or import from nav config). Add entries for any new routes.

### 2.3 CommandPalette: single source from nav

- **File:** `console/src/components/CommandPalette.tsx`.
- **Change:** Remove hardcoded `NAV_ITEMS`. Import `getAllNavItems()` from `@/config/nav` and use that for the command list. So CommandPalette always shows all nav items from the central config.

---

## 3. New Console pages (routes and data)

Each new page needs: (1) route file under `console/app/`, (2) layout that wraps with AppShell if not already inherited, (3) API hook or fetch to Control Plane, (4) nav entry in `NAV_GROUPS` and correct `BRANCH_GROUP_IDS`. List:

| Route | Branch | API used | Purpose |
|-------|--------|----------|---------|
| `/planner` | command | GET /v1/initiatives, GET /v1/plans | Aggregated view of initiatives + plans (e.g. list + filters). |
| `/cost-dashboard` | command | GET /v1/usage, /v1/usage/by_job_type, /v1/usage/by_model | Charts/tables for usage and cost. |
| `/ai-calls` | orchestration | GET /v1/llm_calls | List LLM calls with pagination. |
| `/mcp-servers` | data-config | GET /v1/mcp_servers | List MCP server configs; link to existing admin MCP page or new. |
| `/routing-policies` | data-config | GET /v1/routing_policies | List routing policies. |
| `/llm-budgets` | data-config | GET /v1/llm_budgets | List LLM budgets. |
| `/agent-memory` | system or orchestration | GET /v1/agent_memory | List agent memory entries (if not already under admin). |
| `/webhook-outbox` | system only | GET /v1/webhook_outbox (new API) | Monitoring + delivery status; retry/inspect. Requires full outbox schema (see §4.1). |

For each:

- **Route file:** e.g. `console/app/planner/page.tsx`, `console/app/cost-dashboard/page.tsx`, etc.
- **Layout:** Add `console/app/planner/layout.tsx` that does `<AppShell><Outlet or children /></AppShell>` (or rely on parent layout if it already wraps with AppShell).
- **Breadcrumb label:** Add `planner: "Planner"`, `cost-dashboard: "Cost Dashboard"`, etc., to the segment labels map used by `getBreadcrumbs`.
- **Nav:** Add one entry to the appropriate group in `NAV_GROUPS` (e.g. DASHBOARD: "Planner" → `/planner`, MONITORING or new section: "Cost Dashboard" → `/cost-dashboard`).

---

## 4. Schema changes (exact DDL)

### 4.1 Webhook outbox (optional; System only)

If Webhook Outbox is implemented, add a migration with **full outbox semantics** (not just a log). Place nav entry only under **System** (monitoring + delivery status, retry/inspect).

```sql
-- 003_webhook_outbox.sql
BEGIN;

CREATE TABLE webhook_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text,
  next_retry_at   timestamptz,
  idempotency_key text,
  destination     text,  -- webhook_id or endpoint URL
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_outbox_status ON webhook_outbox (status);
CREATE INDEX idx_webhook_outbox_created_at ON webhook_outbox (created_at DESC);
CREATE INDEX idx_webhook_outbox_next_retry ON webhook_outbox (next_retry_at) WHERE status = 'pending';

COMMIT;
```

Control Plane: POST to enqueue, GET to list/filter, PATCH to update status/attempt_count/next_retry_at. Console page under System only.

### 4.2 Stages: no table first

Implement stage as a tag on plan_nodes (tags or metadata.stage). Promote to first-class stages only after stable usage; then add FK if needed.

### 4.3 No schema change for

Planner, Cost Dashboard, AI Calls, MCP Servers, Routing policies, LLM budgets, Agent memory: use existing tables and endpoints.

---

## 5. Control Plane API: additions (only if schema added)

- **Webhook outbox (if implemented):**
  - `GET /v1/webhook_outbox?limit=&offset=&status=` — list rows.
  - `PATCH /v1/webhook_outbox/:id` — body `{ status, attempt_count?, last_error?, next_retry_at?, sent_at? }` to update after send attempt.

No other new API routes are required for the menu/nav or for the new Console pages listed above; they consume existing endpoints.

---

## 6. Implementation order (task-level)

**Phase 1 – Nav config and icon bar (no new pages, no schema)**

1. Add `console/src/config/nav.ts` with types (including `NavItemPredicates`), `BRANCHES`, `BRANCH_GROUP_IDS`, `NAV_GROUPS` (each item with `branchId`; optional `predicates`). Helpers: `getGroupsForBranch`, `getBranchForHref`, `getAllNavItems`. Filter items by predicates (requiresPermission, featureFlag, requiresEnv) when resolving visible nav.
2. Add `console/src/components/IconBar.tsx` with branch icons (SVG) and active state.
3. In `AppShell.tsx`: import nav config; add `activeBranchId` state and `useEffect` to sync from pathname; add IconBar as first column; pass `getGroupsForBranch(activeBranchId)` to NavContent; change NavContent to accept `groups` prop.
4. Update `CommandPalette.tsx` to use `getAllNavItems()` from nav config.
5. Move or duplicate breadcrumb segment labels into nav config (or one shared labels map) and ensure `getBreadcrumbs` uses it.

**Phase 2 – New Console pages (existing API)**

6. Add `/planner` page: composite view with 3 widgets (upcoming runs/jobs, initiatives status rollup, approvals queue + SLA). No new schema. Add to nav and breadcrumb labels.
7. Add `/cost-dashboard` page (usage API); add to nav and labels.
8. Add `/ai-calls` page (llm_calls API); add to nav and labels.
9. Add `/mcp-servers`, `/routing-policies`, `/llm-budgets` pages; add to CONFIG or appropriate group and labels.
10. Add `/agent-memory` if not already under admin; add to nav and labels.

**Phase 3 – Optional: Webhook outbox**

11. Add migration `schemas/003_webhook_outbox.sql` (or Supabase migration) with DDL above.
12. In Control Plane, add GET and PATCH handlers for `/v1/webhook_outbox`; optionally, internal insert when processing webhooks.
13. Add Console page `/webhook-outbox` and nav entry under System.

---

## 7. Files touched (checklist)

| File | Action |
|------|--------|
| `console/src/config/nav.ts` | Create (nav config + types + helpers). |
| `console/src/components/IconBar.tsx` | Create (icon bar UI). |
| `console/src/components/AppShell.tsx` | Modify (IconBar, state, filtered NavContent, breadcrumbs from config). |
| `console/src/components/CommandPalette.tsx` | Modify (use getAllNavItems from config). |
| `console/app/planner/page.tsx` + `layout.tsx` | Create. |
| `console/app/cost-dashboard/page.tsx` + `layout.tsx` | Create. |
| `console/app/ai-calls/page.tsx` + `layout.tsx` | Create. |
| `console/app/mcp-servers/page.tsx` + `layout.tsx` | Create (or link to existing admin MCP). |
| `console/app/routing-policies/page.tsx` + `layout.tsx` | Create. |
| `console/app/llm-budgets/page.tsx` + `layout.tsx` | Create. |
| `console/app/agent-memory/page.tsx` + `layout.tsx` | Create if not under admin. |
| `schemas/003_webhook_outbox.sql` (or supabase/migrations/) | Create if doing webhook outbox. |
| `control-plane/src/api.ts` | Add webhook_outbox GET/PATCH if schema added. |
| `console/app/webhook-outbox/page.tsx` + `layout.tsx` | Create if doing webhook outbox. |

---

## 8. Branch definitions and Observability rule (recap)

- **Command** — High-level ops and **high-level observability**: Overview, Planner (3 widgets), Scheduler Health, Cost Dashboard. No Webhook Outbox (that is System).
- **Orchestration** — Initiatives, Plans, Pipeline Runs, Jobs, Tool Calls, Artifacts, Approvals, AI Calls. No separate "Pipelines" or "Executions" menu items; use tabs or saved views inside Plans/Runs.
- **Studio** — Brand assets authored for output: Brands, Document Templates, Brand Themes. Token/component primitives live in Builder; brand themes reference or override them.
- **Data & config** — Sub-sections: **Runtime policies** (routing policies, budgets, policies), **Integrations** (adapters, MCP servers, webhooks), **Releases** (releases, routes).
- **System** — **Deep observability** (audit, incidents, Webhook Outbox, logs) + Secrets, Email Marketing, Self-heal, Admin, Agent memory. Webhook Outbox only here.
- **Builder** — Platform-level primitives for UI and artifacts: token registry, component registry, template engine, release packaging for builder assets. Nothing else unless it fits this definition.

This document is the detailed plan; implementation should follow the phases and file checklist above.

---

## Related plan: Brand design tokens upgrade

A separate workstream is specified in **[docs/BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md](BRAND_DESIGN_TOKENS_UPGRADE_PLAN.md)** — upgrade brand tokenization to enterprise design tokens (W3C DTCG, ~150–400 semantic tokens, TokenService, flat table, export targets). It can be implemented in parallel or after the menu/nav phases; Studio (BRAND & DESIGN) will consume the new token model once available.
