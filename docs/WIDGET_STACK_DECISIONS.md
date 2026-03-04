# Widget Stack Decisions

Locked decisions for the Console widget stack. Override by updating this doc.

## Adopted

| Category | Library | Why |
|----------|---------|-----|
| Charts (primary) | Recharts | Already in email-marketing-factory; shadcn/ui ships chart components built on Recharts; covers line/area/bar/pie for dashboard and cost analytics |
| Charts (advanced) | Nivo (@nivo/heatmap, treemap, network, sunburst) | Specialized visualizations (heatmaps, treemaps, sunburst) for /analytics page; complements Recharts for advanced use cases |
| DAG / Workflow visualization | React Flow (@xyflow/react) | Purpose-built for node-based graphs; visualizes plan_nodes + plan_edges DAGs and run execution flow; used by Zapier, n8n, Langflow |
| Graph layout | dagre | Standard library for directed acyclic graph layout; computes node positions for React Flow from plan_edges |
| Forms | React Hook Form + @hookform/resolvers + Zod | Standard pairing with shadcn/ui; Zod already used for validation; React Hook Form isolates re-renders per field |
| Rich text editor | TipTap (@tiptap/react + extensions) | Notion-style editor for initiative goal_state, run notes, approval comments; extensible with slash commands, mentions, task lists |
| Toasts | sonner | Lightweight toast library recommended by shadcn/ui; used for form success/error feedback |
| UI primitives | Radix UI (10 new primitives) | Accordion, AlertDialog, ContextMenu, HoverCard, Popover, Progress, RadioGroup, ScrollArea, Slider, Toggle/ToggleGroup, Tooltip, Collapsible |

## Skipped

| Library | Reason |
|---------|--------|
| Headless UI | Radix UI covers the same space; mixing two headless primitive libraries adds confusion |
| AG Grid | TanStack Table already in use and sufficient; AG Grid is overkill unless Excel-level pivot/editing needed |
| ECharts | Recharts + Nivo covers all Console chart needs; ECharts adds significant bundle weight |
| Craft.js | No drag-and-drop page builder requirement in Console |
| FormKit | React Hook Form is the standard for the shadcn/Radix stack |
| MapLibre | No geospatial features in Console |
| Refine | Evaluated in PLATFORM_UI_REVAMP_CHECKLIST §4; decision was Option (b) hand-built shadcn + TanStack Table |
| TailGrids | Reference for landing pages only; Console is an app dashboard, not a marketing site |

## Integration points

- **Charts**: `console/src/components/charts/` — base Recharts components; `console/src/components/charts/nivo/` — advanced Nivo charts
- **Flow**: `console/src/components/flow/` — FlowCanvas, PlanDagViewer, RunFlowViewer, custom nodes
- **Forms**: `console/src/components/forms/` — FormInput, FormSelect, FormTextarea, FormCheckbox, FormSwitch; `console/src/schemas/` — Zod schemas
- **Editor**: `console/src/components/editor/` — RichEditor, EditorToolbar, ReadOnlyViewer
- **UI primitives**: `console/src/components/ui/` — AlertDialog, Progress, Tooltip, ScrollArea, Accordion, HoverCard, Popover, RadioGroup, Sheet, Slider, Sonner, ContextMenu

## References

- [STACK_AND_DECISIONS.md](STACK_AND_DECISIONS.md)
- [PLATFORM_UI_REVAMP_CHECKLIST.md](PLATFORM_UI_REVAMP_CHECKLIST.md)
- [WIDGET_STACK_INTEGRATION_CHECKLIST.md](WIDGET_STACK_INTEGRATION_CHECKLIST.md)
