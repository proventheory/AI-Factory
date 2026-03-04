# UI and Cursor — primitives and prompts

Console and email-marketing-factory use a **unified design system** (shadcn/ui + Tailwind + design tokens). This doc lists canonical components and example prompts so Cursor (and Bolt/GPT Engineer–style flows) generate pages that match our stack.

## Canonical components and primitives

- **Sidebar / AppShell** — `console/src/components/AppShell.tsx` (sidebar + topbar + breadcrumbs). Use for layout.
- **DataTable** — `@/components/ui` — `DataTable` with `Column[]` and `data`. Use for all list tables (Initiatives, Runs, Jobs, Approvals, etc.).
- **Command menu** — `@/components/CommandPalette` — ⌘K for navigation. Rendered in AppShell.
- **PageHeader** — `@/components/ui` — `title`, optional `description`, optional actions.
- **EmptyState** — `@/components/ui` — when list has no data.
- **FilterBar** — `@/components/ui` — filter chips + clear.
- **Card, CardHeader, CardContent** — `@/components/ui`.
- **PageFrame, Stack, CardSection, TableFrame** — `@/components/ui` — **layout primitives**. Use on every page: wrap content in **PageFrame**; use **Stack** for vertical rhythm (gap-6); use **CardSection** for card blocks with optional title/right slot; use **TableFrame** around DataTable or any wide table so only the table scrolls horizontally. See [UI_DEBUGGING.md](UI_DEBUGGING.md) and "Layout primitives and 8px grid" below.
- **Button, Badge, Input, Select, Modal, Tabs** — `@/components/ui`.
- **LoadingSkeleton, PageLoadingSkeleton** — `@/components/ui` for loading states.

Design tokens: `console/src/design-tokens/tokens.ts` (and `packages/ui` for shared preset). Use classes like `text-brand-600`, `bg-surface-raised`, `text-state-success`, `border-border-subtle`, `text-body-small`, `text-heading-3`.

## Data and API

- **React Query** — use hooks from `@/hooks/use-api`: `useRuns`, `useRun`, `useInitiatives`, `useInitiative`, `useCreateInitiative`, `usePlans`, `usePlan`, `useJobRuns`, `useArtifacts`, `useArtifact`, `useApprovals`, `usePendingApprovals`, `useApproval`, `useRerunRun`.
- **API layer** — `@/lib/api.ts`: `getRuns`, `getRun`, `getInitiatives`, etc. Call Control Plane at `NEXT_PUBLIC_CONTROL_PLANE_API`.

## Example prompts for Cursor

1. **"Add a new Orchestration page with a table and filters using our DataTable and PageHeader."**  
   → Create a page under `app/`, use `PageHeader`, `DataTable` with columns, `useRuns` or the right hook, `EmptyState` when no data, optional `FilterBar`. Wrap in a layout that uses `AppShell`.

2. **"Generate a dashboard page using our Sidebar, DataTable, and PageHeader."**  
   → Use `AppShell` (via dashboard layout), `PageHeader`, `Card` for stats, `DataTable` or simple table for a list, `LoadingSkeleton` while loading.

3. **"Add a Run detail tab for tool calls using TanStack Table and shadcn Card."**  
   → In `app/runs/[id]/page.tsx`, use `Tabs`, `TabsContent` with a table of tool calls, `Card` for sections. Use `useRun(id)` and render nested data.

4. **"Add an approval drawer with diff preview using shadcn Sheet and our design tokens."**  
   → Use `Drawer` (or Sheet when we add it) from `@/components/ui`, show approval payload/diff inside. Use `text-*` and `border-*` token classes.

## Admin (Option A)

- **Resource registry** — `console/src/lib/admin-registry.ts`. `ADMIN_RESOURCES` defines key, label, table, listColumns, editableFields.
- **Routes** — `/admin` (index), `/admin/[resource]` (list), `/admin/[resource]/[id]` (show), `/admin/[resource]/new`, `/admin/[resource]/[id]/edit`.
- **To add a new Admin resource:** add an entry to `ADMIN_RESOURCES`, then add `app/admin/[resource]/page.tsx` (list) and `app/admin/[resource]/[id]/page.tsx` (show). Use same layout shell as Ops UI.

## Ops UI routes (product)

- `/dashboard`, `/initiatives`, `/plans`, `/runs`, `/runs/[id]`, `/jobs`, `/artifacts`, `/artifacts/[id]`, `/approvals`, `/tool-calls`, `/releases`, `/policies`, `/adapters`, `/incidents`, `/audit`, `/secrets`, `/health`.
- **Email Marketing Factory** (optional): `/email-marketing` — proxied to the Email Marketing Factory app when `NEXT_PUBLIC_EMAIL_MARKETING_ORIGIN` is set. See [EMAIL_MARKETING_FACTORY_INTEGRATION.md](EMAIL_MARKETING_FACTORY_INTEGRATION.md).

## Prompt templates (Bolt / GPT Engineer / Reflex Build)

- **"Generate a dashboard page using our Sidebar, DataTable, and PageHeader. Data from Control Plane API via React Query hooks in @/hooks/use-api."**
- **"Generate a list page for [resource] with DataTable, PageHeader, filters, and empty state. Use useRuns/useInitiatives/useApprovals from @/hooks/use-api."**
- **"Add a detail page for [resource] with Card, Badge, Tabs, and a link back to the list. Use useRun(id) from @/hooks/use-api."**

Keep new pages on **Next.js App Router**, **Tailwind**, **design tokens**, and **React Query** for API state.

## Layout primitives and 8px grid

- **PageFrame** — Single wrapper for all page content: `mx-auto w-full max-w-[1400px] px-4 py-4 md:px-6 md:py-6`. Every Ops/Admin page under AppShell should wrap its content in PageFrame (padding lives here, not in AppShell main).
- **Stack** — Vertical rhythm: `flex flex-col gap-6`. Use between PageHeader and CardSections, or between sections.
- **CardSection** — Card with optional title + right slot; consistent header/body padding (e.g. header `px-4 py-3 md:px-6`, body `px-4 py-4 md:px-6`). Replaces ad-hoc Card + CardHeader + CardContent for "section with title."
- **TableFrame** — Wraps tables so only the table scrolls horizontally (no full-page horizontal scroll). Use around DataTable or any wide `<table>`.
- **8px grid** — Use only `gap-2` (8px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px) and equivalent `p-*` inside PageFrame, CardSection, TableFrame. Avoid ad-hoc padding elsewhere; keep spacing in primitives. See [UI_DEBUGGING.md](UI_DEBUGGING.md) for design rules when a layout test fails.

## v0 / Cursor UI generation

When using **v0** (Vercel) or **Cursor** to generate UI, prompt for: **"PageFrame, Stack, CardSection, TableFrame"** and our **8px grid** (gap-2/4/6/8 only) so generated code matches the layout system. Example: "Build a dashboard page using PageFrame, Stack, CardSection, and TableFrame; use 8px grid spacing (gap-4, gap-6)."

---

## Cursor rules (optional)

If using `.cursor/rules` or project instructions, add:

- Use shadcn components from `@/components/ui` (Console) or `@ai-factory/ui` when building shared UI.
- Use **TanStack Table** for tables; use the shared **DataTable** component with `Column[]` and `keyExtractor`.
- Use **React Query** for Control Plane API: import hooks from `@/hooks/use-api`. Do not use raw `fetch` + `useState` for list/detail data when a hook exists.
- Use design token classes: `text-brand-600`, `bg-surface-raised`, `text-state-success`, `border-border-subtle`, `text-body-small`, `text-heading-3`, etc.
- **Layout / padding:** Avoid ad-hoc padding and margin; use only layout primitives (PageFrame, Stack, CardSection, TableFrame) for page structure and spacing. If you add an ESLint or CI grep rule to restrict `p-*`, `px-*`, `py-*`, `m-*`, `mx-*`, `my-*` to specific files, the allowlist is: `PageFrame.tsx`, `CardSection.tsx`, `TableFrame.tsx`, `Stack.tsx`, `AppShell.tsx`. Elsewhere use only `gap-*` inside Stack or the primitives’ own classes. See [UI_DEBUGGING.md](UI_DEBUGGING.md).

---

## Integrations (studied ecosystems)

- **Continue:** Optional `.continue/checks/` for PR quality (e.g. no hardcoded secrets). Document compatibility with Continue + Cursor.
- **GPT Engineer:** Use preprompt/prompt-file pattern for "generate new Console page"; agent identity and primitives in docs.
- **OpenHands (OpenDevin):** Executor reference; Cloud RBAC/collab if multi-user or hosted agents.
- **AutoDev:** SDLC-phase mapping (Requirements → Ops) and MCP when extending runners or agent types.
- **SWE-agent / mini-SWE-agent:** Reference for "agent solves issues" benchmarks.
- **Reflex Build / Bolt.new:** Example prompts in this doc produce output that matches our stack.
- **AppFlowy / Sweep:** Product and automation references only; no code dependency.
