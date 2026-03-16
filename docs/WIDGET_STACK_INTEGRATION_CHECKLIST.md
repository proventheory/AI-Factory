# Widget Stack Integration — 1,000 Item Checklist

Actionable to-dos for integrating the recommended widget stack into the AI Factory Console. **Current count: 1,000 explicit checklist items** (Sections 1–43). Covers: Recharts (charts), React Flow (DAG/workflow visualization), React Hook Form + Zod (forms), TipTap (rich editor), Nivo (advanced visualization), Radix/shadcn expansion, testing, Storybook, accessibility, responsive, performance, documentation, and verification. Key references: [STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md), [PLATFORM_UI_REVAMP_CHECKLIST.md](PLATFORM_UI_REVAMP_CHECKLIST.md), [FULL_IMPLEMENTATION_5000_ITEMS.md](FULL_IMPLEMENTATION_5000_ITEMS.md).

**Already in Console:** shadcn/ui (New York), Radix UI (8 primitives), TanStack Table, React Query, Tailwind + @ai-factory/ui tokens, lucide-react, cmdk.

**Added by this checklist:** Recharts, React Flow (@xyflow/react), React Hook Form + @hookform/resolvers + Zod, TipTap, Nivo, dagre, 10+ new Radix primitives, 15+ new shadcn components.

**Skipped (with rationale):** Headless UI (Radix covers), AG Grid (TanStack Table sufficient), ECharts (Recharts + Nivo sufficient), Craft.js (no page builder needed), FormKit (React Hook Form chosen), MapLibre (no geo features), Refine (hand-built per PLATFORM_UI_REVAMP_CHECKLIST §4), TailGrids (reference only).

---

## 1. Recharts — Installation and Configuration

- [x] Install recharts in console (`npm i recharts`)
- [x] Add recharts to console/package.json dependencies
- [x] Verify recharts version compatible with React version in console
- [x] Create console/src/components/charts/ directory
- [x] Create console/src/components/charts/index.ts barrel export
- [x] Add chart color tokens to design system (packages/ui or console tokens)
- [x] Map chart colors to design token CSS variables (--chart-primary, --chart-secondary, --chart-success, --chart-destructive, --chart-warning, --chart-muted)
- [x] Add chart color tokens for light mode
- [x] Add chart color tokens for dark mode (if dark mode supported)
- [x] Create base ChartContainer wrapper component with ResponsiveContainer
- [x] Add Tailwind utility classes for chart containers (min-h, aspect-ratio)
- [x] Document chart component conventions in docs/UI_AND_CURSOR.md
- [x] Add chart components to component registry or barrel export
- [x] Verify recharts tree-shaking works with Next.js build (import individual chart types)
- [x] Add "use client" directive to all chart components (Next.js App Router)

---

## 2. Recharts — Base Chart Components

- [x] Create LineChart base component (console/src/components/charts/LineChart.tsx)
- [x] LineChart: accept data prop (array of objects)
- [x] LineChart: accept dataKey and xAxisKey props
- [x] LineChart: accept color/stroke from design tokens
- [x] LineChart: ResponsiveContainer wrapping
- [x] LineChart: tooltip with shadcn-styled tooltip container
- [x] LineChart: optional legend
- [x] LineChart: optional grid lines
- [x] Create AreaChart base component (console/src/components/charts/AreaChart.tsx)
- [x] AreaChart: accept data, dataKey, xAxisKey
- [x] AreaChart: gradient fill from design tokens
- [x] AreaChart: tooltip with shadcn-styled container
- [x] AreaChart: ResponsiveContainer
- [x] Create BarChart base component (console/src/components/charts/BarChart.tsx)
- [x] BarChart: accept data, dataKey, xAxisKey
- [x] BarChart: fill color from design tokens
- [x] BarChart: tooltip with shadcn-styled container
- [x] BarChart: ResponsiveContainer
- [x] BarChart: optional stacked mode
- [x] Create PieChart base component (console/src/components/charts/PieChart.tsx)
- [x] PieChart: accept data with name and value
- [x] PieChart: colors from design tokens palette
- [x] PieChart: tooltip
- [x] PieChart: optional legend
- [x] Create RadarChart base component (for multi-axis comparison)
- [x] RadarChart: accept data and multiple dataKeys
- [x] Create ComposedChart base component (line + bar overlay)
- [x] ComposedChart: accept multiple series with different types
- [x] Create ChartTooltip component styled with shadcn Card
- [x] Create ChartLegend component styled with design tokens

---

## 3. Recharts — Dashboard Charts

- [x] Dashboard page: add chart section below stats cards
- [x] Dashboard: runs-over-time LineChart (x: date, y: count)
- [x] Dashboard: runs-over-time chart — fetch data from GET /v1/runs with date grouping
- [x] Dashboard: runs-over-time chart — React Query hook useRunsOverTime()
- [x] Dashboard: runs-over-time chart — loading skeleton
- [x] Dashboard: runs-over-time chart — empty state
- [x] Dashboard: runs-over-time chart — error state with retry
- [x] Dashboard: success-rate AreaChart (x: date, y: percentage)
- [x] Dashboard: success-rate — compute from runs (succeeded / total)
- [x] Dashboard: success-rate — React Query hook useSuccessRate()
- [x] Dashboard: success-rate — loading skeleton
- [x] Dashboard: run-status PieChart (queued, running, succeeded, failed, blocked)
- [x] Dashboard: run-status — compute from runs list or dedicated endpoint
- [x] Dashboard: run-status — React Query hook useRunStatusDistribution()
- [x] Dashboard: run-status — loading skeleton
- [x] Dashboard: jobs-by-type BarChart (x: job_type, y: count)
- [x] Dashboard: jobs-by-type — fetch from GET /v1/job_runs grouped by type
- [x] Dashboard: jobs-by-type — React Query hook useJobsByType()
- [x] Dashboard: jobs-by-type — loading skeleton
- [x] Dashboard: avg-duration BarChart (x: job_type, y: avg seconds)
- [x] Dashboard: avg-duration — compute from job_runs started_at/finished_at
- [x] Dashboard: avg-duration — React Query hook useAvgDuration()
- [x] Dashboard: chart cards wrapped in shadcn Card with CardHeader title
- [x] Dashboard: chart cards responsive grid (1 col mobile, 2 col tablet, 3 col desktop)
- [x] Dashboard: chart time-range selector (7d, 30d, 90d)
- [x] Dashboard: time-range selector updates all charts via shared state
- [x] Dashboard: time-range selector uses shadcn Select or Tabs
- [x] Dashboard: chart refresh button or auto-refresh interval
- [x] Dashboard: Number Ticker stats cards update on data refresh
- [x] Dashboard: Bento Grid layout for chart + stats sections

---

## 4. Recharts — Cost/Usage Analytics Charts

- [x] Cost page: verify route /admin/costs exists and loads
- [x] Cost page: total-cost-over-time AreaChart (x: date, y: cost USD)
- [x] Cost page: total-cost — fetch from GET /v1/usage
- [x] Cost page: total-cost — React Query hook useUsageCost()
- [x] Cost page: total-cost — loading skeleton
- [x] Cost page: total-cost — empty state
- [x] Cost page: cost-by-model BarChart (x: model, y: cost)
- [x] Cost page: cost-by-model — parse usage response by model
- [x] Cost page: cost-by-model — React Query hook useCostByModel()
- [x] Cost page: cost-by-model — loading skeleton
- [x] Cost page: cost-by-job-type BarChart (x: job_type, y: cost)
- [x] Cost page: cost-by-job-type — parse usage response by job_type
- [x] Cost page: cost-by-job-type — React Query hook useCostByJobType()
- [x] Cost page: tokens-over-time LineChart (x: date, y: tokens)
- [x] Cost page: tokens-over-time — input tokens vs output tokens (two lines)
- [x] Cost page: tokens-over-time — React Query hook useTokensOverTime()
- [x] Cost page: cost-per-initiative BarChart (x: initiative name, y: cost)
- [x] Cost page: cost-per-initiative — fetch from usage grouped by initiative_id
- [x] Cost page: daily-spend LineChart with budget threshold line
- [x] Cost page: budget threshold configurable (env var or setting)
- [x] Cost page: summary stat cards (total cost, total tokens, avg cost/run, avg cost/job)
- [x] Cost page: summary stat cards use Number Ticker
- [x] Cost page: date-range picker for all cost charts
- [x] Cost page: date-range picker uses shadcn DatePicker or Select
- [x] Cost page: export CSV button for cost data
- [x] Cost page: cost table below charts (model, job_type, tokens, cost per row)
- [x] Cost page: cost table uses TanStack Table / DataTable
- [x] Cost page: cost table sortable by cost, tokens, date
- [x] Cost page: cost trend indicator (up/down arrow vs previous period)
- [x] Cost page: Langfuse link (if NEXT_PUBLIC_LANGFUSE_URL configured)

---

## 5. Recharts — Run/Job Analytics Charts

- [x] Runs list page: add chart section above table (collapsible)
- [x] Runs list: runs-per-day BarChart
- [x] Runs list: runs-per-day — React Query hook
- [x] Runs list: run-status-distribution PieChart
- [x] Runs list: avg-run-duration trend LineChart
- [x] Run detail /runs/[id]: execution timeline chart (Gantt-style horizontal bar)
- [x] Run detail: timeline chart — x: time, bars per job_run
- [x] Run detail: timeline chart — color by status (succeeded green, failed red, running blue)
- [x] Run detail: timeline chart — tooltip with job details
- [x] Run detail: timeline chart — fetch from GET /v1/runs/:id + job_runs
- [x] Run detail: duration stat card
- [x] Run detail: total-tokens stat card
- [x] Run detail: artifacts-produced stat card
- [x] Jobs list page: jobs-by-status PieChart
- [x] Jobs list: jobs-by-type BarChart
- [x] Jobs list: avg-job-duration-by-type BarChart
- [x] Initiatives detail: runs-per-initiative LineChart over time
- [x] Initiatives detail: success-rate-per-initiative stat
- [x] Initiatives detail: total-cost-per-initiative stat
- [x] Plans detail: node-completion-rate BarChart (per plan_node)
- [x] Plans detail: plan-edge-flow visualization (link to React Flow DAG)
- [x] Approvals page: approvals-by-status PieChart
- [x] Approvals page: avg-approval-time stat card
- [x] Artifacts page: artifacts-by-type PieChart
- [x] Artifacts page: artifacts-over-time LineChart
- [x] Tool calls page: tool-calls-by-name BarChart
- [x] Tool calls page: avg-tool-call-duration BarChart
- [x] Health page: system-health chart (uptime/response-time over time)
- [x] Health page: health-status indicators with colored badges
- [x] All analytics charts: skeleton loading state

---

## 6. Recharts — Per-Page Integration Verification

- [x] /dashboard: chart section renders without errors
- [x] /admin/costs: all cost charts render
- [x] /runs: runs analytics chart section renders
- [x] /runs/[id]: timeline chart renders
- [x] /jobs: jobs analytics section renders
- [x] /initiatives/[id]: initiative-scoped charts render
- [x] /plans/[id]: plan-scoped charts render
- [x] /approvals: approvals analytics render
- [x] /artifacts: artifacts analytics render
- [x] /tool-calls: tool calls analytics render
- [x] /health: health charts render
- [x] All chart pages: no console errors
- [x] All chart pages: responsive at mobile breakpoint
- [x] All chart pages: responsive at tablet breakpoint
- [x] All chart pages: charts visible and correctly sized at desktop

---

## 7. Recharts — Theming and Design Tokens

- [x] Define chart color palette in design tokens (6–8 colors)
- [x] Map chart-primary to brand color token
- [x] Map chart-secondary to secondary token
- [x] Map chart-success to success/green token
- [x] Map chart-destructive to destructive/red token
- [x] Map chart-warning to warning/amber token
- [x] Map chart-muted to muted token
- [x] Chart tooltip background matches shadcn Card background
- [x] Chart tooltip text matches foreground token
- [x] Chart tooltip border matches border token
- [x] Chart legend text matches muted-foreground token
- [x] Chart axis labels use font from design system
- [x] Chart axis labels size matches body-sm or label token
- [x] Chart grid lines use border/muted color
- [x] Dark mode: chart colors adjust (if dark mode supported)
- [x] Dark mode: tooltip/legend colors adjust
- [x] Verify chart colors meet WCAG contrast on light background
- [x] Verify chart colors meet WCAG contrast on dark background (if applicable)
- [x] Document chart token names in design system README
- [x] Add chart token examples to Storybook or docs

---

## 8. React Flow — Installation and Configuration

- [x] Install @xyflow/react in console (`npm i @xyflow/react`)
- [x] Add @xyflow/react to console/package.json dependencies
- [x] Verify @xyflow/react version compatible with React version
- [x] Create console/src/components/flow/ directory
- [x] Create console/src/components/flow/index.ts barrel export
- [x] Import React Flow base CSS in console globals or flow wrapper component
- [x] Override React Flow CSS variables with design tokens
- [x] Create base FlowCanvas wrapper component
- [x] FlowCanvas: accept nodes and edges props
- [x] FlowCanvas: responsive container (fill parent)
- [x] FlowCanvas: fit-view on mount
- [x] Add React Flow to dynamic import (next/dynamic) for SSR safety
- [x] Document flow component conventions in docs/UI_AND_CURSOR.md
- [x] Add flow components to component registry
- [x] Verify React Flow works with Next.js App Router ("use client" directive)

---

## 9. React Flow — Base Node and Edge Components

- [x] Create PlanNodeComponent (custom node type for plan nodes)
- [x] PlanNodeComponent: display_name label
- [x] PlanNodeComponent: agent_role badge (shadcn Badge)
- [x] PlanNodeComponent: status indicator (queued/running/succeeded/failed/blocked)
- [x] PlanNodeComponent: status-driven border color from design tokens
- [x] PlanNodeComponent: icon per job_type (lucide icon mapping)
- [x] PlanNodeComponent: click handler (navigate to detail or expand)
- [x] PlanNodeComponent: hover tooltip with node metadata
- [x] PlanNodeComponent: selected state styling
- [x] PlanNodeComponent: source handle (bottom)
- [x] PlanNodeComponent: target handle (top)
- [x] Create JobNodeComponent (for execution-level view)
- [x] JobNodeComponent: job_type label
- [x] JobNodeComponent: status badge
- [x] JobNodeComponent: duration display
- [x] JobNodeComponent: artifact count indicator
- [x] Create StartNode component (entry point marker)
- [x] StartNode: "Start" label with play icon
- [x] Create EndNode component (completion marker)
- [x] EndNode: "End" label with check icon
- [x] Create custom edge component (styled edge)
- [x] Custom edge: animated dash when run is active
- [x] Custom edge: color from design tokens
- [x] Custom edge: label for edge type or metadata
- [x] Custom edge: success/failure state (green/red)
- [x] Create edge label component styled with shadcn Badge
- [x] Create minimap component styled with design tokens
- [x] Create controls component (zoom in/out/fit) styled with shadcn Button
- [x] Create background component with dot pattern and token colors
- [x] Document all custom node types in README

---

## 10. React Flow — Plan DAG Viewer

- [x] Create PlanDagViewer component (console/src/components/flow/PlanDagViewer.tsx)
- [x] PlanDagViewer: accept plan_id prop
- [x] PlanDagViewer: fetch plan_nodes from GET /v1/plans/:id
- [x] PlanDagViewer: fetch plan_edges from GET /v1/plans/:id (or separate endpoint)
- [x] PlanDagViewer: React Query hook usePlanNodes(planId)
- [x] PlanDagViewer: React Query hook usePlanEdges(planId)
- [x] PlanDagViewer: transform plan_nodes to React Flow nodes
- [x] PlanDagViewer: transform plan_edges to React Flow edges
- [x] PlanDagViewer: auto-layout using dagre or elkjs
- [x] Install dagre (`npm i dagre @types/dagre`) for automatic graph layout
- [x] Configure dagre layout direction (top-to-bottom)
- [x] Configure dagre node spacing
- [x] Configure dagre rank spacing
- [x] PlanDagViewer: loading skeleton
- [x] PlanDagViewer: empty state (plan has no nodes)
- [x] PlanDagViewer: error state with retry
- [x] PlanDagViewer: fit-view after layout completes
- [x] PlanDagViewer: zoom controls (shadcn-styled)
- [x] PlanDagViewer: minimap (collapsible)
- [x] PlanDagViewer: fullscreen toggle
- [x] PlanDagViewer: node click opens detail panel/drawer
- [x] PlanDagViewer: detail panel shows node metadata (agent_role, job_type, sequence)
- [x] PlanDagViewer: detail panel shows linked job_runs
- [x] PlanDagViewer: detail panel shows linked artifacts
- [x] PlanDagViewer: node context menu (right-click) with options
- [x] PlanDagViewer: highlight critical path (longest dependency chain)
- [x] PlanDagViewer: color nodes by status when viewing run context
- [x] PlanDagViewer: animate edges during active execution
- [x] PlanDagViewer: legend showing node status colors
- [x] PlanDagViewer: export DAG as PNG or SVG

---

## 11. React Flow — Run Execution Visualization

- [x] Create RunFlowViewer component (console/src/components/flow/RunFlowViewer.tsx)
- [x] RunFlowViewer: accept run_id prop
- [x] RunFlowViewer: fetch run data from GET /v1/runs/:id
- [x] RunFlowViewer: fetch plan data from run's plan_id
- [x] RunFlowViewer: fetch job_runs from GET /v1/runs/:id/status or /v1/job_runs?run_id=
- [x] RunFlowViewer: React Query hook useRunFlow(runId)
- [x] RunFlowViewer: overlay job_run status on plan_nodes
- [x] RunFlowViewer: node color reflects execution status
- [x] RunFlowViewer: running nodes pulse animation (CSS keyframes)
- [x] RunFlowViewer: failed nodes show error indicator
- [x] RunFlowViewer: blocked nodes show lock/pause indicator
- [x] RunFlowViewer: completed nodes show checkmark
- [x] RunFlowViewer: edge animation for active transitions
- [x] RunFlowViewer: tooltip on node shows job_run duration and timestamps
- [x] RunFlowViewer: tooltip on node shows artifact count
- [x] RunFlowViewer: click node navigates to job_run detail
- [x] RunFlowViewer: progress indicator (X of Y nodes completed)
- [x] RunFlowViewer: auto-refresh while run is active (poll or refetchInterval)
- [x] RunFlowViewer: stop auto-refresh when run completes
- [x] RunFlowViewer: loading skeleton
- [x] RunFlowViewer: error state with retry
- [x] RunFlowViewer: re-run button in flow toolbar
- [x] RunFlowViewer: cancel button in flow toolbar (if run is active)
- [x] RunFlowViewer: compare mode (overlay two runs on same plan)
- [x] RunFlowViewer: compare — different border style for run A vs run B

---

## 12. React Flow — Plan Templates Visualization

- [x] Create TemplateFlowViewer component
- [x] TemplateFlowViewer: render plan compiler template as DAG
- [x] TemplateFlowViewer: support software template
- [x] TemplateFlowViewer: support issue_fix template
- [x] TemplateFlowViewer: support migration template
- [x] TemplateFlowViewer: support factory_ops template
- [x] TemplateFlowViewer: support ci_gate template
- [x] TemplateFlowViewer: support crew template
- [x] TemplateFlowViewer: nodes show template placeholders vs concrete values
- [x] TemplateFlowViewer: read-only mode (no editing)
- [x] TemplateFlowViewer: use in /plans page or docs
- [x] TemplateFlowViewer: loading skeleton
- [x] Create FlowToolbar component (shared across viewers)
- [x] FlowToolbar: zoom in button
- [x] FlowToolbar: zoom out button
- [x] FlowToolbar: fit view button
- [x] FlowToolbar: fullscreen toggle button
- [x] FlowToolbar: export button (PNG/SVG)
- [x] FlowToolbar: styled with shadcn Button variants
- [x] FlowToolbar: positioned as overlay (top-right or bottom-right)

---

## 13. React Flow — Integration with Console Pages

- [x] /plans/[id]: embed PlanDagViewer in detail page
- [x] /plans/[id]: DAG viewer in shadcn Tabs (tab: "Graph" alongside "Details" and "Nodes")
- [x] /plans/[id]: DAG viewer loading skeleton while data fetches
- [x] /runs/[id]: embed RunFlowViewer in detail page
- [x] /runs/[id]: flow viewer in shadcn Tabs (tab: "Flow" alongside "Timeline" and "Jobs")
- [x] /runs/[id]: flow viewer shows real-time status during active run
- [x] /initiatives/[id]: optional plan DAG thumbnail for latest plan
- [x] /initiatives/[id]: click thumbnail navigates to plan detail
- [x] /dashboard: optional mini flow preview for most recent active run
- [x] /dashboard: click mini flow navigates to run detail
- [x] /admin/plans/[id]: embed read-only PlanDagViewer
- [x] /admin/plan_nodes: link to plan DAG from node list
- [x] /admin/plan_edges: link to plan DAG from edge list
- [x] All flow viewers: wrapped in shadcn Card with CardHeader
- [x] All flow viewers: minimum height constraint (e.g. 400px)
- [x] All flow viewers: responsive — full width on mobile, constrained on desktop
- [x] All flow viewers: no console errors
- [x] All flow viewers: keyboard accessible (tab through nodes)
- [x] DAG viewer and Run flow viewer share base FlowCanvas and custom nodes
- [x] Document flow viewer integration patterns in docs/UI_AND_CURSOR.md

---

## 14. React Hook Form — Installation and Configuration

- [x] Install react-hook-form in console (`npm i react-hook-form`)
- [x] Install @hookform/resolvers in console (`npm i @hookform/resolvers`)
- [x] Verify zod installed in console (install if not: `npm i zod`)
- [x] Add react-hook-form to console/package.json dependencies
- [x] Add @hookform/resolvers to console/package.json dependencies
- [x] Add zod to console/package.json dependencies (if not present)
- [x] Create console/src/lib/form-utils.ts for shared form helpers
- [x] Create console/src/components/forms/ directory
- [x] Create console/src/components/forms/index.ts barrel export
- [x] Add shadcn Form component to console (`npx shadcn@latest add form`)
- [x] Verify shadcn Form component works with react-hook-form
- [x] Verify shadcn FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage available
- [x] Document form component conventions in docs/UI_AND_CURSOR.md
- [x] Document form + Zod pattern in docs/UI_AND_CURSOR.md
- [x] Add form components to component registry

---

## 15. React Hook Form — Base Form Components

- [x] Create reusable FormInput component (shadcn Input + FormField wrapper)
- [x] FormInput: accept name, label, placeholder, description props
- [x] FormInput: display validation error via FormMessage
- [x] FormInput: support disabled state
- [x] Create reusable FormSelect component (shadcn Select + FormField wrapper)
- [x] FormSelect: accept name, label, options, placeholder props
- [x] FormSelect: display validation error via FormMessage
- [x] Create reusable FormTextarea component (shadcn Textarea + FormField wrapper)
- [x] FormTextarea: accept name, label, placeholder, rows props
- [x] FormTextarea: display validation error
- [x] Create reusable FormCheckbox component (shadcn Checkbox + FormField wrapper)
- [x] FormCheckbox: accept name, label, description props
- [x] Create reusable FormSwitch component (shadcn Switch + FormField wrapper)
- [x] FormSwitch: accept name, label, description props
- [x] Create reusable FormDatePicker component
- [x] FormDatePicker: accept name, label props
- [x] FormDatePicker: use shadcn Calendar + Popover
- [x] Create reusable FormCombobox component (shadcn Combobox + FormField wrapper)
- [x] FormCombobox: accept name, label, options, searchable props
- [x] Create FormSection component (group fields with heading + description)
- [x] FormSection: styled with shadcn Card or Separator
- [x] Create FormActions component (submit + cancel buttons row)
- [x] FormActions: accept loading state for submit button
- [x] FormActions: accept onCancel handler
- [x] Create form toast/notification helper for success/error
- [x] Toast: install shadcn Sonner component if not present (`npx shadcn@latest add sonner`)
- [x] Configure Sonner in console/app/layout.tsx (add Toaster to Providers)
- [x] Create useFormSubmit hook (wraps mutation + toast + redirect)
- [x] useFormSubmit: handle optimistic updates
- [x] useFormSubmit: handle error mapping (API errors → form field errors)

---

## 16. React Hook Form — Initiative Forms

- [x] Define Zod schema for initiative create: initiativeCreateSchema
- [x] initiativeCreateSchema: intent_type (required, enum)
- [x] initiativeCreateSchema: goal_state (required, string, min length)
- [x] initiativeCreateSchema: source_ref (optional, string URL)
- [x] initiativeCreateSchema: template_id (optional, enum of templates)
- [x] initiativeCreateSchema: metadata (optional, JSON object)
- [x] Create InitiativeCreateForm component (console/src/components/forms/InitiativeCreateForm.tsx)
- [x] InitiativeCreateForm: use useForm with zodResolver(initiativeCreateSchema)
- [x] InitiativeCreateForm: FormInput for goal_state
- [x] InitiativeCreateForm: FormSelect for intent_type
- [x] InitiativeCreateForm: FormInput for source_ref
- [x] InitiativeCreateForm: FormSelect for template_id (software, issue_fix, migration, factory_ops, ci_gate, crew)
- [x] InitiativeCreateForm: FormActions (Create + Cancel)
- [x] InitiativeCreateForm: mutation calls POST /v1/initiatives
- [x] InitiativeCreateForm: on success — toast + redirect to /initiatives/[id]
- [x] InitiativeCreateForm: on error — display API error
- [x] InitiativeCreateForm: loading state on submit button
- [x] Wire InitiativeCreateForm into /admin/initiatives/new page
- [x] Define Zod schema for initiative edit: initiativeEditSchema
- [x] initiativeEditSchema: same fields as create, pre-populated
- [x] Create InitiativeEditForm component
- [x] InitiativeEditForm: pre-populate fields from existing initiative data
- [x] InitiativeEditForm: mutation calls PUT/PATCH /v1/initiatives/:id
- [x] InitiativeEditForm: on success — toast + redirect
- [x] Wire InitiativeEditForm into /admin/initiatives/[id]/edit page

---

## 17. React Hook Form — Plan and Run Forms

- [x] Define Zod schema for plan trigger: planTriggerSchema
- [x] planTriggerSchema: initiative_id (required, UUID)
- [x] planTriggerSchema: template_id (optional, enum)
- [x] Create PlanTriggerForm component (trigger plan compilation for initiative)
- [x] PlanTriggerForm: FormSelect for initiative (populated from initiatives list)
- [x] PlanTriggerForm: FormSelect for template_id
- [x] PlanTriggerForm: mutation calls POST /v1/initiatives/:id/plan
- [x] PlanTriggerForm: on success — toast + redirect to /plans/[id]
- [x] Wire PlanTriggerForm into /initiatives/[id] detail page (action button)
- [x] Define Zod schema for run trigger: runTriggerSchema
- [x] runTriggerSchema: plan_id (required, UUID)
- [x] runTriggerSchema: environment (optional, enum: dev/staging/prod)
- [x] Create RunTriggerForm component (trigger run from plan)
- [x] RunTriggerForm: FormSelect for plan (or pre-filled from context)
- [x] RunTriggerForm: FormSelect for environment
- [x] RunTriggerForm: mutation calls POST /v1/runs
- [x] RunTriggerForm: on success — toast + redirect to /runs/[id]
- [x] Wire RunTriggerForm into /plans/[id] detail page (action button)
- [x] Create RerunConfirmDialog component (confirm re-run via AlertDialog)
- [x] RerunConfirmDialog: shadcn AlertDialog with description and consequences
- [x] RerunConfirmDialog: mutation calls POST /v1/runs/:id/rerun
- [x] Wire RerunConfirmDialog into /runs/[id] detail page (Re-run button)

---

## 18. React Hook Form — Approval Forms

- [x] Define Zod schema for approval decision: approvalDecisionSchema
- [x] approvalDecisionSchema: decision (required, enum: approved/rejected)
- [x] approvalDecisionSchema: reason (optional, string)
- [x] Create ApprovalDecisionForm component
- [x] ApprovalDecisionForm: RadioGroup or button group for approved/rejected
- [x] ApprovalDecisionForm: FormTextarea for reason
- [x] ApprovalDecisionForm: show diff preview (payload from approval request)
- [x] ApprovalDecisionForm: mutation calls POST /v1/approvals
- [x] ApprovalDecisionForm: on success — toast + invalidate approvals query
- [x] ApprovalDecisionForm: loading state on submit
- [x] Wire ApprovalDecisionForm into /approvals page (inline or drawer)
- [x] Wire ApprovalDecisionForm into /admin/approvals/[id] page
- [x] Create ApprovalDrawer component (shadcn Sheet with form inside)
- [x] ApprovalDrawer: open from approval list row action
- [x] ApprovalDrawer: show approval metadata (type, run_id, plan_node_id)
- [x] ApprovalDrawer: show diff preview panel
- [x] ApprovalDrawer: embed ApprovalDecisionForm
- [x] Bulk approve: select multiple approvals and approve in batch
- [x] Bulk approve: confirm dialog before bulk action
- [x] Approval list: pending count badge in sidebar nav item

---

## 19. React Hook Form — Settings and Config Forms

- [x] Define Zod schema for secret create: secretCreateSchema
- [x] secretCreateSchema: key (required, string, no spaces)
- [x] secretCreateSchema: value (required, string)
- [x] secretCreateSchema: environment (optional, enum: dev/staging/prod)
- [x] Create SecretCreateForm component
- [x] SecretCreateForm: FormInput for key
- [x] SecretCreateForm: FormInput for value (type password, with reveal toggle)
- [x] SecretCreateForm: FormSelect for environment
- [x] Wire SecretCreateForm into /secrets page (dialog or inline)
- [x] Define Zod schema for adapter config: adapterConfigSchema
- [x] Create AdapterConfigForm component
- [x] Wire AdapterConfigForm into /adapters page
- [x] Define Zod schema for policy create: policyCreateSchema
- [x] Create PolicyCreateForm component
- [x] Wire PolicyCreateForm into /policies page
- [x] Define Zod schema for MCP server config: mcpServerSchema
- [x] mcpServerSchema: name (required), url (required, valid URL), capabilities (optional), enabled (boolean)
- [x] Create McpServerForm component
- [x] McpServerForm: FormInput for name
- [x] McpServerForm: FormInput for URL
- [x] McpServerForm: FormCheckbox for enabled
- [x] Wire McpServerForm into /admin/mcp_servers/new page
- [x] Define Zod schema for MCP server edit: mcpServerEditSchema
- [x] Create McpServerEditForm component (pre-populated)
- [x] Wire McpServerEditForm into /admin/mcp_servers/[id] page

---

## 20. React Hook Form — Admin CRUD Forms

- [x] Admin initiatives: create Zod schema for admin create/edit
- [x] Admin initiatives: create form with all editable fields
- [x] Admin initiatives: edit form pre-populated from API data
- [x] Admin plans: create Zod schema
- [x] Admin plans: create form
- [x] Admin plans: edit form
- [x] Admin plan_nodes: create Zod schema
- [x] Admin plan_nodes: create form
- [x] Admin plan_nodes: edit form
- [x] Admin plan_edges: create Zod schema
- [x] Admin plan_edges: create form
- [x] Admin plan_edges: edit form
- [x] Admin job_runs: create Zod schema
- [x] Admin job_runs: create form
- [x] Admin job_runs: edit form
- [x] Admin runs: create Zod schema
- [x] Admin runs: create form
- [x] Admin runs: edit form
- [x] Admin artifacts: create Zod schema
- [x] Admin artifacts: create form
- [x] Admin artifacts: edit form
- [x] Admin tool_calls: create Zod schema
- [x] Admin tool_calls: create form
- [x] Admin tool_calls: edit form
- [x] Admin agent_memory: create Zod schema
- [x] Admin agent_memory: create form
- [x] Admin agent_memory: edit form
- [x] Admin approvals: edit form (approve/reject + reason)
- [x] Admin mcp_servers: create Zod schema
- [x] Admin mcp_servers: create form with all fields

---

## 21. React Hook Form — Validation and Error Handling

- [x] All forms: required fields show asterisk or "required" hint
- [x] All forms: validation errors display inline below field (FormMessage)
- [x] All forms: validation fires on blur (mode: 'onBlur') or on submit
- [x] All forms: server-side errors mapped to form fields where possible
- [x] All forms: generic server error shown as toast or banner
- [x] All forms: submit button disabled during submission
- [x] All forms: submit button shows loading spinner during submission
- [x] All forms: cancel button navigates back or closes drawer
- [x] All forms: unsaved changes warning (optional, beforeunload)
- [x] All forms: reset form state on successful submission
- [x] Initiative create: goal_state min length validation error message
- [x] Initiative create: intent_type required validation error message
- [x] Approval decision: decision required validation error message
- [x] Secret create: key required validation error message
- [x] Secret create: value required validation error message
- [x] MCP server: name required validation error message
- [x] MCP server: url valid URL validation error message
- [x] All admin forms: required field validation errors display correctly
- [x] Form error: network error (API unreachable) — toast with retry
- [x] Form error: 401/403 — redirect to login or show permission error
- [x] Form error: 409 conflict — show conflict message
- [x] Form error: 422 validation — map to field-level errors
- [x] Form error: 500 — show generic error toast
- [x] Document form error handling patterns in docs/UI_AND_CURSOR.md
- [x] Document Zod schema conventions (naming, location, reuse) in docs

---

## 22. TipTap — Installation and Configuration

- [x] Install @tiptap/react in console (`npm i @tiptap/react`)
- [x] Install @tiptap/starter-kit in console (`npm i @tiptap/starter-kit`)
- [x] Install @tiptap/pm in console (`npm i @tiptap/pm`)
- [x] Install @tiptap/extension-placeholder in console
- [x] Add TipTap dependencies to console/package.json
- [x] Create console/src/components/editor/ directory
- [x] Create console/src/components/editor/index.ts barrel export
- [x] Create base RichEditor component wrapping useEditor
- [x] RichEditor: accept content (JSON) and onUpdate props
- [x] RichEditor: styled container matching design tokens (border, radius, padding)
- [x] Import TipTap CSS or write custom styles matching design tokens
- [x] Add RichEditor to dynamic import (next/dynamic) for SSR safety
- [x] Document editor component conventions in docs/UI_AND_CURSOR.md
- [x] Verify TipTap works with Next.js App Router ("use client" directive)
- [x] Add editor components to component registry

---

## 23. TipTap — Base Editor Components

- [x] Create EditorToolbar component (bold, italic, heading, list, code, link, undo/redo)
- [x] EditorToolbar: bold toggle button
- [x] EditorToolbar: italic toggle button
- [x] EditorToolbar: heading dropdown (H1, H2, H3)
- [x] EditorToolbar: bullet list toggle
- [x] EditorToolbar: ordered list toggle
- [x] EditorToolbar: code block toggle
- [x] EditorToolbar: link insert button
- [x] EditorToolbar: undo button
- [x] EditorToolbar: redo button
- [x] EditorToolbar: styled with shadcn Button, Toggle, and ToggleGroup
- [x] Install shadcn Toggle and ToggleGroup (`npx shadcn@latest add toggle toggle-group`)
- [x] Create EditorBubbleMenu component (floating toolbar on text selection)
- [x] EditorBubbleMenu: bold, italic, link options
- [x] Create EditorSlashMenu component (slash command menu)
- [x] EditorSlashMenu: heading option
- [x] EditorSlashMenu: bullet list option
- [x] EditorSlashMenu: code block option
- [x] EditorSlashMenu: styled with shadcn Command component
- [x] Install @tiptap/extension-link for link support
- [x] Install @tiptap/extension-code-block-lowlight for syntax highlighting
- [x] Create ReadOnlyViewer component (render TipTap content without editing)
- [x] ReadOnlyViewer: accept JSON or HTML content
- [x] ReadOnlyViewer: styled consistently with editor output
- [x] Create EditorSkeleton loading component

---

## 24. TipTap — Initiative Goal/Prompt Editor

- [x] Replace goal_state plain text input with RichEditor in InitiativeCreateForm
- [x] RichEditor for goal_state: placeholder text "Describe the initiative goal..."
- [x] RichEditor for goal_state: output JSON content on form submit
- [x] RichEditor for goal_state: validate non-empty content via Zod
- [x] Replace goal_state plain text in InitiativeEditForm with RichEditor
- [x] InitiativeEditForm: pre-populate RichEditor with existing JSON content
- [x] Initiative detail /initiatives/[id]: render goal_state with ReadOnlyViewer
- [x] Initiative detail: render goal_state as formatted rich text
- [x] Admin initiative show: render goal_state with ReadOnlyViewer
- [x] Store goal_state as JSON (TipTap JSON) in database (migration if needed)
- [x] Document goal_state format change in migration notes
- [x] Backward compatibility: render plain text goal_state as paragraph if not JSON
- [x] Create useGoalStateEditor hook (wraps useEditor with goal_state config)
- [x] Goal editor: autosave draft (optional, localStorage)
- [x] Goal editor: character count display

---

## 25. TipTap — Run Notes and Annotations

- [x] Create RunNotesEditor component
- [x] RunNotesEditor: accept run_id prop
- [x] RunNotesEditor: fetch existing notes (if notes field or separate store)
- [x] RunNotesEditor: save notes on blur or explicit save button
- [x] RunNotesEditor: React Query mutation for saving notes
- [x] RunNotesEditor: loading skeleton
- [x] RunNotesEditor: empty state ("Add notes...")
- [x] Wire RunNotesEditor into /runs/[id] detail page (tab: "Notes")
- [x] RunNotesEditor: placed in shadcn Tabs alongside Flow, Timeline, Jobs tabs
- [x] Create ArtifactAnnotation component (comment on artifact)
- [x] ArtifactAnnotation: text input + save button
- [x] Wire ArtifactAnnotation into /artifacts/[id] detail page
- [x] Create ApprovalCommentEditor (rich text reason for approval decisions)
- [x] Replace plain textarea in ApprovalDecisionForm with RichEditor (optional)
- [x] ApprovalCommentEditor: limited extensions (bold/italic/list only, no headings)

---

## 26. TipTap — Extensions and Plugins

- [x] Install @tiptap/extension-mention for @-mentions
- [x] Configure mention to suggest initiative names or run IDs
- [x] Mention: fetch suggestions from API (initiatives, runs)
- [x] Mention: styled dropdown using shadcn Command component
- [x] Install @tiptap/extension-task-list and @tiptap/extension-task-item
- [x] Task list: checkbox items in editor for action items
- [x] Install @tiptap/extension-highlight
- [x] Highlight: text highlighting for emphasis
- [x] Install @tiptap/extension-typography (smart quotes, dashes)
- [x] Install @tiptap/extension-character-count
- [x] Character count: display below editor when enabled
- [x] Configure max character limit where appropriate (e.g. goal_state)
- [x] Document all installed TipTap extensions in README
- [x] Extension compatibility: verify all extensions work together without conflicts
- [x] Performance: lazy-load editor extensions only when editor mounts

---

## 27. Nivo — Installation and Configuration

- [x] Install @nivo/core in console (`npm i @nivo/core`)
- [x] Install @nivo/heatmap in console
- [x] Install @nivo/treemap in console
- [x] Install @nivo/network in console
- [x] Install @nivo/sunburst in console
- [x] Add Nivo dependencies to console/package.json
- [x] Create console/src/components/charts/nivo/ directory
- [x] Configure Nivo theme object to match design tokens (colors, font, grid)
- [x] Nivo theme: colors from chart color palette
- [x] Nivo theme: font family and size from design system

---

## 28. Nivo — Specialized Chart Types

- [x] Create HeatmapChart component (Nivo ResponsiveHeatMap)
- [x] HeatmapChart: accept data and keys props
- [x] HeatmapChart: responsive container
- [x] HeatmapChart: tooltip styled with design tokens
- [x] Use HeatmapChart for: run activity heatmap (day of week x hour of day)
- [x] Run activity heatmap: fetch run timestamps and bucket by day/hour
- [x] Run activity heatmap: React Query hook useRunActivity()
- [x] Run activity heatmap: loading skeleton
- [x] Use HeatmapChart for: job_type x status matrix
- [x] Create TreemapChart component (Nivo ResponsiveTreeMap)
- [x] TreemapChart: accept hierarchical data
- [x] TreemapChart: responsive container
- [x] Use TreemapChart for: cost breakdown by initiative > plan > job_type
- [x] Cost treemap: fetch from usage data and build hierarchy
- [x] Cost treemap: React Query hook useCostTreemap()
- [x] Create NetworkGraph component (Nivo ResponsiveNetwork)
- [x] NetworkGraph: accept nodes and links
- [x] NetworkGraph: responsive container
- [x] Use NetworkGraph for: initiative dependency graph (optional future use)
- [x] Create SunburstChart component (Nivo ResponsiveSunburst)
- [x] SunburstChart: accept hierarchical data
- [x] Use SunburstChart for: artifact breakdown by type > producer > initiative
- [x] All Nivo charts: loading skeleton
- [x] All Nivo charts: empty state
- [x] All Nivo charts: no console errors

---

## 29. Nivo — Analytics Dashboard Integration

- [x] Create /analytics page (dedicated analytics dashboard)
- [x] /analytics: PageHeader with title "Analytics" and description
- [x] /analytics: sidebar nav item under Monitoring section
- [x] /analytics: run activity heatmap section
- [x] /analytics: cost treemap section
- [x] /analytics: job_type x status heatmap section
- [x] /analytics: artifact breakdown sunburst section
- [x] /analytics: time-range selector shared across all charts
- [x] /analytics: responsive grid layout (1 col mobile, 2 col desktop)
- [x] /analytics: loading skeletons for all charts
- [x] /analytics: empty state when no data
- [x] /analytics: error state with retry
- [x] /analytics: export button (export chart data as CSV)
- [x] Wire /analytics into sidebar navigation
- [x] Document /analytics page in docs/UI_AND_CURSOR.md

---

## 30. Radix Primitives Expansion

- [x] Install @radix-ui/react-accordion in console
- [x] Add shadcn Accordion component (`npx shadcn@latest add accordion`)
- [x] Use Accordion on FAQ sections, settings pages, or collapsible info
- [x] Install @radix-ui/react-alert-dialog in console
- [x] Add shadcn AlertDialog component (`npx shadcn@latest add alert-dialog`)
- [x] Use AlertDialog for destructive confirmations (delete, cancel run)
- [x] Install @radix-ui/react-context-menu in console
- [x] Add shadcn ContextMenu component (`npx shadcn@latest add context-menu`)
- [x] Use ContextMenu on DataTable rows (right-click actions: view, edit, re-run, delete)
- [x] Install @radix-ui/react-hover-card in console
- [x] Add shadcn HoverCard component (`npx shadcn@latest add hover-card`)
- [x] Use HoverCard for quick preview on initiative/run links in tables
- [x] Install @radix-ui/react-popover in console
- [x] Add shadcn Popover component (`npx shadcn@latest add popover`)
- [x] Use Popover for filter dropdowns and date picker
- [x] Install @radix-ui/react-progress in console
- [x] Add shadcn Progress component (`npx shadcn@latest add progress`)
- [x] Use Progress for run completion percentage on run detail and list
- [x] Install @radix-ui/react-radio-group in console
- [x] Add shadcn RadioGroup component (`npx shadcn@latest add radio-group`)
- [x] Use RadioGroup in approval decision form (approve/reject)
- [x] Install @radix-ui/react-scroll-area in console
- [x] Add shadcn ScrollArea component (`npx shadcn@latest add scroll-area`)
- [x] Use ScrollArea in DAG viewer side panel and long lists
- [x] Install @radix-ui/react-slider in console
- [x] Add shadcn Slider component (`npx shadcn@latest add slider`)
- [x] Use Slider for time-range or threshold controls on charts
- [x] Install @radix-ui/react-toggle in console
- [x] Add shadcn Toggle and ToggleGroup components (`npx shadcn@latest add toggle toggle-group`)
- [x] Use Toggle in TipTap editor toolbar

---

## 31. shadcn Component Expansion

- [x] Add shadcn Sheet component (`npx shadcn@latest add sheet`)
- [x] Use Sheet for mobile navigation sidebar drawer
- [x] Use Sheet for approval drawer
- [x] Add shadcn Textarea component (`npx shadcn@latest add textarea`)
- [x] Use Textarea in forms (approval reason, notes, descriptions)
- [x] Add shadcn Calendar component (`npx shadcn@latest add calendar`)
- [x] Use Calendar in date picker form fields
- [x] Add shadcn DatePicker pattern (build from Calendar + Popover)
- [x] Use DatePicker in filter bars for date range selection
- [x] Add shadcn Breadcrumb component (`npx shadcn@latest add breadcrumb`)
- [x] Use Breadcrumb on all detail pages (consistent with existing breadcrumbs)
- [x] Add shadcn Collapsible component (`npx shadcn@latest add collapsible`)
- [x] Use Collapsible for sidebar groups and collapsible chart sections
- [x] Add shadcn NavigationMenu component (if top-nav pattern needed)
- [x] Use NavigationMenu for sub-navigation within admin or settings
- [x] Add shadcn Pagination component (`npx shadcn@latest add pagination`)
- [x] Use Pagination on all DataTable list pages with server-side pagination
- [x] Add shadcn Sonner toast component (`npx shadcn@latest add sonner`)
- [x] Use Sonner for form success/error notifications across all forms
- [x] Add shadcn Tooltip component (`npx shadcn@latest add tooltip`)
- [x] Use Tooltip on icon-only buttons, chart data points, and truncated text
- [x] Add shadcn ResizablePanel component (`npx shadcn@latest add resizable`)
- [x] Use ResizablePanel for flow viewer + detail panel split layout
- [x] Add shadcn AspectRatio component (`npx shadcn@latest add aspect-ratio`)
- [x] Use AspectRatio for chart containers or artifact previews

---

## 32. Testing — Chart Components

- [x] Unit test: LineChart renders without errors
- [x] Unit test: LineChart renders with sample data
- [x] Unit test: LineChart shows correct number of data points
- [x] Unit test: AreaChart renders without errors
- [x] Unit test: AreaChart renders with sample data
- [x] Unit test: BarChart renders without errors
- [x] Unit test: BarChart renders with sample data
- [x] Unit test: PieChart renders without errors
- [x] Unit test: PieChart renders with sample data
- [x] Unit test: chart tooltip appears on hover (or simulated event)
- [x] Unit test: chart uses design token colors (check className or style)
- [x] Unit test: chart responsive container resizes correctly
- [x] Unit test: dashboard charts render with mock data
- [x] Unit test: dashboard charts show loading skeleton when data pending
- [x] Unit test: dashboard charts show empty state when no data
- [x] Unit test: cost charts render with mock usage data
- [x] Unit test: cost-by-model chart shows correct number of bars
- [x] Unit test: cost-by-job-type chart shows correct number of bars
- [x] Unit test: tokens-over-time chart shows two lines (input/output)
- [x] Unit test: run analytics charts render
- [x] Unit test: run timeline chart renders with mock job_runs
- [x] Snapshot test: LineChart with known data
- [x] Snapshot test: BarChart with known data
- [x] Snapshot test: PieChart with known data
- [x] Snapshot test: dashboard chart section

---

## 33. Testing — React Flow Components

- [x] Unit test: PlanNodeComponent renders with props
- [x] Unit test: PlanNodeComponent shows display_name
- [x] Unit test: PlanNodeComponent shows status badge with correct variant
- [x] Unit test: PlanNodeComponent shows agent_role
- [x] Unit test: JobNodeComponent renders with props
- [x] Unit test: StartNode renders
- [x] Unit test: EndNode renders
- [x] Unit test: custom edge renders between two nodes
- [x] Unit test: FlowCanvas renders with nodes and edges
- [x] Unit test: PlanDagViewer renders with mock plan data
- [x] Unit test: PlanDagViewer shows loading skeleton while fetching
- [x] Unit test: PlanDagViewer shows empty state for plan with no nodes
- [x] Unit test: PlanDagViewer shows error state on fetch failure
- [x] Unit test: RunFlowViewer renders with mock run data
- [x] Unit test: RunFlowViewer overlays job_run status on plan nodes
- [x] Unit test: RunFlowViewer shows progress indicator (X of Y)
- [x] Unit test: dagre layout produces valid node positions
- [x] Unit test: FlowToolbar buttons render correctly
- [x] Unit test: zoom controls call correct React Flow methods
- [x] Snapshot test: PlanDagViewer with known plan structure
- [x] Snapshot test: RunFlowViewer with known run data
- [x] Integration test: PlanDagViewer fetches plan and renders nodes (MSW mock)
- [x] Integration test: RunFlowViewer fetches run and renders flow (MSW mock)
- [x] E2E test: navigate to /plans/[id] and verify Graph tab visible
- [x] E2E test: navigate to /runs/[id] and verify Flow tab visible

---

## 34. Testing — Form Components

- [x] Unit test: FormInput renders with label
- [x] Unit test: FormInput shows validation error when invalid
- [x] Unit test: FormSelect renders options
- [x] Unit test: FormSelect shows validation error when no selection
- [x] Unit test: FormTextarea renders and accepts text
- [x] Unit test: FormCheckbox renders with label and toggles
- [x] Unit test: FormSwitch renders with label and toggles
- [x] Unit test: FormDatePicker renders and opens calendar
- [x] Unit test: FormActions renders submit and cancel buttons
- [x] Unit test: InitiativeCreateForm renders all fields
- [x] Unit test: InitiativeCreateForm validates required fields on submit
- [x] Unit test: InitiativeCreateForm calls mutation with valid data
- [x] Unit test: InitiativeCreateForm shows API error on failure
- [x] Unit test: InitiativeEditForm pre-populates fields from data
- [x] Unit test: InitiativeEditForm calls mutation with updated data
- [x] Unit test: ApprovalDecisionForm renders decision options
- [x] Unit test: ApprovalDecisionForm validates decision required
- [x] Unit test: ApprovalDecisionForm submits approved decision
- [x] Unit test: ApprovalDecisionForm submits rejected decision with reason
- [x] Unit test: SecretCreateForm validates required key and value
- [x] Unit test: McpServerForm validates required name and URL
- [x] Unit test: RerunConfirmDialog renders and confirms on accept
- [x] Unit test: PlanTriggerForm renders and submits
- [x] Unit test: RunTriggerForm renders and submits
- [x] Snapshot test: InitiativeCreateForm
- [x] Snapshot test: ApprovalDecisionForm
- [x] Integration test: form submit calls API and shows toast (MSW mock)
- [x] Integration test: form validation prevents submit with invalid data
- [x] E2E test: create initiative flow (fill form, submit, see detail page)
- [x] E2E test: approve pending approval (open drawer, click approve, enter reason, confirm)

---

## 35. Testing — Editor Components

- [x] Unit test: RichEditor renders without errors
- [x] Unit test: RichEditor accepts initial JSON content
- [x] Unit test: RichEditor calls onUpdate on content change
- [x] Unit test: EditorToolbar renders all buttons
- [x] Unit test: EditorToolbar bold toggle toggles bold mark
- [x] Unit test: EditorToolbar italic toggle toggles italic mark
- [x] Unit test: ReadOnlyViewer renders JSON content as HTML
- [x] Unit test: ReadOnlyViewer renders plain text fallback for non-JSON
- [x] Unit test: EditorSlashMenu renders command options
- [x] Unit test: RunNotesEditor renders
- [x] Unit test: RunNotesEditor saves on blur
- [x] Unit test: ArtifactAnnotation renders and saves on submit
- [x] Snapshot test: RichEditor with sample content
- [x] Snapshot test: ReadOnlyViewer with sample content
- [x] E2E test: type in goal editor and submit initiative form

---

## 36. Testing — Integration and E2E

- [x] E2E test: dashboard loads with chart section visible
- [x] E2E test: dashboard charts render (no blank areas or errors)
- [x] E2E test: /admin/costs charts render with data
- [x] E2E test: /runs list chart section renders
- [x] E2E test: /runs/[id] Flow tab shows DAG with nodes
- [x] E2E test: /plans/[id] Graph tab shows DAG with nodes
- [x] E2E test: click node in DAG opens detail panel or navigates
- [x] E2E test: /analytics page loads all Nivo charts
- [x] E2E test: time-range selector updates charts on dashboard
- [x] E2E test: form submit on /admin/initiatives/new creates initiative
- [x] E2E test: form edit on /admin/initiatives/[id]/edit saves changes
- [x] E2E test: approval drawer opens from approvals list row action
- [x] E2E test: approve action in drawer updates approval status
- [x] E2E test: secret create form submits successfully
- [x] E2E test: MCP server create form submits successfully
- [x] E2E test: RerunConfirmDialog triggers rerun and shows toast
- [x] E2E test: rich editor in initiative create renders and accepts input
- [x] E2E test: responsive — charts resize on viewport change
- [x] E2E test: responsive — flow viewer resizes on viewport change
- [x] E2E test: responsive — forms usable on mobile width

---

## 37. Accessibility

- [x] All charts: provide aria-label describing the chart type and data
- [x] All charts: include screen reader text summarizing key data points
- [x] All charts: keyboard accessible tooltips (or provide data table alternative)
- [x] React Flow: keyboard navigation between nodes (tab/arrow keys)
- [x] React Flow: aria-label on each node with display_name and status
- [x] React Flow: aria-label on edges describing the connection
- [x] React Flow: zoom controls accessible via keyboard (tab + enter)
- [x] Forms: all fields have associated labels (via shadcn FormLabel)
- [x] Forms: validation errors linked to fields via aria-describedby (shadcn handles this)
- [x] Forms: focus moves to first error field on submission failure
- [x] Forms: submit button has clear accessible name
- [x] Editor: TipTap editor has role="textbox" and aria-label
- [x] Editor: toolbar buttons have aria-label (e.g. "Bold", "Italic")
- [x] Editor: slash menu navigable with keyboard (arrow keys + enter)
- [x] New Radix primitives: verify keyboard interaction per Radix accessibility docs
- [x] AlertDialog: focus trapped inside dialog on open
- [x] Sheet: focus trapped inside sheet on open
- [x] HoverCard: accessible via keyboard focus (not hover-only)
- [x] ContextMenu: triggered via keyboard (Shift+F10 or context menu key)
- [x] Progress: has aria-valuenow, aria-valuemin, aria-valuemax attributes
- [x] All interactive chart elements: sufficient color contrast (4.5:1 minimum)
- [x] All flow nodes: sufficient color contrast for status indicators
- [x] All forms: error messages meet WCAG color contrast requirements
- [x] Tab order: logical through charts, flow viewer, forms on each page
- [x] Skip link: skip to main content (if not already present in AppShell)

---

## 38. Responsive and Mobile

- [x] Dashboard charts: stack to single column on mobile (<768px)
- [x] Dashboard charts: readable at 320px width
- [x] Cost charts: stack to single column on mobile
- [x] Run analytics charts: stack on mobile
- [x] Nivo charts: responsive at mobile breakpoint
- [x] React Flow viewer: touch gestures for pan/zoom on mobile
- [x] React Flow viewer: nodes readable at mobile width (scale down)
- [x] React Flow viewer: minimap hidden on mobile (save space)
- [x] React Flow viewer: controls repositioned for touch accessibility
- [x] Forms: full-width inputs on mobile
- [x] Forms: stacked layout (no side-by-side fields) on mobile
- [x] Forms: submit button full-width on mobile
- [x] Editor: toolbar wraps on small screens (overflow or multi-row)
- [x] Editor: editor area full-width on mobile
- [x] Approval drawer (Sheet): full height on mobile
- [x] Chart time-range selector: full-width on mobile
- [x] FlowToolbar: icon-only buttons on mobile (hide text labels)
- [x] All new components: tested at 320px, 768px, 1024px, 1440px breakpoints
- [x] Nivo charts: hide legend on mobile (or move below chart)
- [x] DataTable with charts: charts above table, both independently scrollable

---

## 39. Performance and Bundle Optimization

- [x] Recharts: import only used chart types (avoid importing entire library)
- [x] Recharts: lazy-load chart components on dashboard (next/dynamic)
- [x] React Flow: lazy-load with next/dynamic (ssr: false)
- [x] React Flow: lazy-load dagre layout library
- [x] TipTap: lazy-load editor with next/dynamic (ssr: false)
- [x] TipTap: lazy-load extensions only when editor mounts
- [x] Nivo: lazy-load Nivo components on /analytics page
- [x] Nivo: import only used chart types (heatmap, treemap, network, sunburst)
- [x] Bundle analysis: run `next build` and check chart library bundle impact
- [x] Bundle analysis: ensure recharts < 100KB gzipped contribution
- [x] Bundle analysis: ensure @xyflow/react < 80KB gzipped contribution
- [x] Bundle analysis: ensure TipTap total < 60KB gzipped contribution
- [x] Bundle analysis: ensure Nivo total < 80KB gzipped contribution
- [x] React Query: staleTime for chart data (e.g. 60s for dashboard, 300s for costs)
- [x] React Query: cacheTime configured for chart data queries
- [x] React Query: refetchOnWindowFocus disabled for expensive chart queries
- [x] React Flow: virtualization for large DAGs (>100 nodes) if needed
- [x] Recharts: pagination or sampling for large datasets (>1000 data points)
- [x] Forms: no unnecessary re-renders (react-hook-form isolates renders per field)
- [x] All new pages: code-split via Next.js dynamic imports where appropriate
- [x] All new pages: no layout shift (skeletons in place before data loads)
- [x] All new pages: first contentful paint < 1.5s target
- [x] Measure: Lighthouse performance score on /dashboard page
- [x] Measure: Lighthouse performance score on /admin/costs page
- [x] Measure: Lighthouse performance score on /plans/[id] (with DAG viewer)

---

## 40. Storybook Stories

- [x] Story: LineChart with sample data (multiple variants)
- [x] Story: AreaChart with sample data
- [x] Story: BarChart with sample data (regular and stacked)
- [x] Story: PieChart with sample data
- [x] Story: ComposedChart with sample data
- [x] Story: RadarChart with sample data
- [x] Story: PlanNodeComponent (queued state)
- [x] Story: PlanNodeComponent (running state, with pulse animation)
- [x] Story: PlanNodeComponent (succeeded state)
- [x] Story: PlanNodeComponent (failed state)
- [x] Story: JobNodeComponent (with duration and artifacts)
- [x] Story: FlowCanvas with sample nodes and edges
- [x] Story: PlanDagViewer with mock plan data
- [x] Story: RunFlowViewer with mock run data (active run)
- [x] Story: FormInput (default, error, disabled states)
- [x] Story: FormSelect (default, error states)
- [x] Story: FormTextarea (default, error states)
- [x] Story: FormCheckbox
- [x] Story: FormSwitch
- [x] Story: FormDatePicker
- [x] Story: InitiativeCreateForm (empty)
- [x] Story: ApprovalDecisionForm (with sample approval data)
- [x] Story: RichEditor (empty, with content)
- [x] Story: EditorToolbar (all buttons)
- [x] Story: ReadOnlyViewer with sample content
- [x] Story: HeatmapChart with sample data
- [x] Story: TreemapChart with sample data
- [x] Story: Progress component (0%, 50%, 100% states)
- [x] Story: AlertDialog (with destructive action)
- [x] Story: HoverCard (with initiative preview)

---

## 41. Documentation

- [x] Update docs/STACK_AND_DECISIONS.md §1: add Recharts to Console stack
- [x] Update docs/STACK_AND_DECISIONS.md §1: add React Flow to Console stack
- [x] Update docs/STACK_AND_DECISIONS.md §1: add React Hook Form to Console stack
- [x] Update docs/STACK_AND_DECISIONS.md §1: add TipTap to Console stack (when adopted)
- [x] Update docs/STACK_AND_DECISIONS.md §1: add Nivo to Console stack (when adopted)
- [x] Update docs/STACK_AND_DECISIONS.md §8: document widget stack decision reference
- [x] Create docs/WIDGET_STACK_DECISIONS.md documenting which libraries adopted and why
- [x] WIDGET_STACK_DECISIONS.md: document Recharts chosen over Nivo/ECharts for primary charts
- [x] WIDGET_STACK_DECISIONS.md: document React Flow chosen for DAG/workflow visualization
- [x] WIDGET_STACK_DECISIONS.md: document React Hook Form + Zod chosen for forms
- [x] WIDGET_STACK_DECISIONS.md: document TipTap chosen for rich editing
- [x] WIDGET_STACK_DECISIONS.md: document Nivo for advanced/specialized charts
- [x] WIDGET_STACK_DECISIONS.md: document Headless UI skipped (Radix covers same space)
- [x] WIDGET_STACK_DECISIONS.md: document AG Grid skipped (TanStack Table sufficient)
- [x] WIDGET_STACK_DECISIONS.md: document ECharts skipped (Recharts + Nivo sufficient)
- [x] WIDGET_STACK_DECISIONS.md: document Craft.js skipped (no page builder needed)
- [x] WIDGET_STACK_DECISIONS.md: document FormKit skipped (React Hook Form chosen)
- [x] WIDGET_STACK_DECISIONS.md: document MapLibre skipped (no geo features in Console)
- [x] WIDGET_STACK_DECISIONS.md: document Refine skipped (hand-built per PLATFORM_UI_REVAMP_CHECKLIST §4)
- [x] WIDGET_STACK_DECISIONS.md: document TailGrids as reference only (not installed)
- [x] Update docs/UI_AND_CURSOR.md: add chart component section (usage, props, tokens)
- [x] Update docs/UI_AND_CURSOR.md: add flow component section (usage, custom nodes, layout)
- [x] Update docs/UI_AND_CURSOR.md: add form component section (usage, Zod patterns, hooks)
- [x] Update docs/UI_AND_CURSOR.md: add editor component section (usage, extensions, TipTap config)
- [x] Update docs/UI_AND_CURSOR.md: example Cursor prompt for adding a new chart to a page
- [x] Update docs/UI_AND_CURSOR.md: example Cursor prompt for adding a flow viewer to a detail page
- [x] Update docs/UI_AND_CURSOR.md: example Cursor prompt for adding a new form with Zod validation
- [x] Update console README: mention new dependencies (Recharts, React Flow, RHF, TipTap, Nivo)
- [x] Update packages/ui README: mention chart color tokens
- [x] Document dagre layout configuration in code comments or flow README
- [x] Document React Flow custom node creation pattern (how to add new node types)
- [x] Document form + Zod pattern with example (schema → useForm → FormField → mutation)
- [x] Document TipTap extension installation pattern (install → configure → register)
- [x] Add CHANGELOG entry for widget stack additions
- [x] Cross-reference: link WIDGET_STACK_DECISIONS.md from STACK_AND_DECISIONS.md
- [x] Cross-reference: link WIDGET_STACK_DECISIONS.md from PLATFORM_UI_REVAMP_CHECKLIST.md
- [x] Cross-reference: link from FULL_IMPLEMENTATION_5000_ITEMS.md
- [x] Update .cursor/rules (if exists): add chart, flow, form, editor conventions for AI generation
- [x] Document: which sections of FULL_IMPLEMENTATION_5000_ITEMS.md are addressed by this checklist
- [x] Document: which sections of PLATFORM_UI_REVAMP_CHECKLIST.md are addressed by this checklist

---

## 42. Verification — Per Page with New Widgets

- [x] /dashboard: charts section renders (no console errors)
- [x] /dashboard: charts use design tokens for colors
- [x] /dashboard: charts responsive at mobile breakpoint
- [x] /dashboard: time-range selector updates all charts
- [x] /dashboard: Number Ticker and chart data consistent
- [x] /admin/costs: all cost charts render with real or mock data
- [x] /admin/costs: date-range selector filters charts
- [x] /admin/costs: export CSV produces valid file
- [x] /runs: analytics chart section renders above table
- [x] /runs/[id]: Flow tab renders DAG from real plan data
- [x] /runs/[id]: Flow nodes show correct execution status
- [x] /runs/[id]: Flow auto-refreshes during active run
- [x] /runs/[id]: Notes tab renders TipTap editor
- [x] /plans/[id]: Graph tab renders DAG from real plan nodes/edges
- [x] /plans/[id]: DAG nodes clickable (open detail panel)
- [x] /plans/[id]: DAG layout is readable (no overlapping nodes)
- [x] /initiatives/[id]: charts render for initiative-scoped data
- [x] /initiatives/[id]: goal_state rendered with ReadOnlyViewer
- [x] /analytics: all Nivo charts render
- [x] /analytics: time-range selector updates all charts
- [x] /admin/initiatives/new: form renders all fields
- [x] /admin/initiatives/new: form validates on submit
- [x] /admin/initiatives/new: form submits successfully to API
- [x] /admin/initiatives/[id]/edit: form pre-populates from data
- [x] /admin/initiatives/[id]/edit: form saves changes
- [x] /approvals: approval drawer opens with decision form
- [x] /approvals: approve/reject actions work and update list
- [x] /secrets: create form renders and submits
- [x] /admin/mcp_servers/new: form renders and submits
- [x] /admin/mcp_servers/[id]: edit form renders and saves

---

## 43. Cross-Library Integration and Consistency

- [x] Chart tooltips and flow node tooltips use same visual style (shadcn Card)
- [x] Chart cards and flow cards use same shadcn Card wrapper with CardHeader
- [x] Form components used consistently in both Ops and Admin forms
- [x] Loading skeletons for charts, flow viewers, and forms match existing skeleton style
- [x] Empty states for charts, flow viewers, and forms match existing EmptyState component
- [x] Error states for charts, flow viewers, and forms match existing error pattern
- [x] All new components respect dark mode tokens (if dark mode enabled)
- [x] All new components use lucide-react for icons (consistent with shadcn)
- [x] All new pages follow PageHeader + content pattern
- [x] All new detail page sections use shadcn Tabs
- [x] FilterBar works alongside chart sections on list pages
- [x] DataTable and chart sections have consistent spacing (gap, margin)
- [x] React Flow detail panel uses same Card/Badge components as rest of app
- [x] Form toast notifications use same toast library (Sonner) as rest of app
- [x] Editor toolbar button style matches shadcn Button/Toggle variants
- [x] New Radix primitives styled consistently with existing Radix components
- [x] Chart legends and flow legends use same font/color tokens
- [x] All new interactive elements have focus-visible ring matching design system
- [x] All new buttons follow existing size/variant conventions
- [x] Navigation: new pages (/analytics) added to sidebar with appropriate icon
- [x] Navigation: new pages in correct sidebar group (Monitoring for analytics)
- [x] Breadcrumbs: new pages have correct breadcrumb trail
- [x] Command palette: new pages registered in command menu (⌘K → "Go to Analytics")

---

*End of checklist. Mark items with `[x]` as you complete them. Total items: 1,000.*
