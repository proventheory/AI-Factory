# Browser snapshot analysis — Run detail & Pipeline Runs flow

**Date:** 2026-03-05  
**Base URL:** https://ai-factory-console-git-main-proventheorys-projects.vercel.app  
**Flow:** Run detail (Overview → Artifacts → Flow) → Pipeline Runs list

---

## Snapshot 1 — Run detail, Overview tab

**URL:** `/runs/86d38878-8440-4059-b65c-904af5b2c469`  
**Tab:** Overview (selected)

### What’s visible (from a11y tree)
- Nav: Home, Command, Orchestration (current), Studio, Data & config, System, Builder
- Sidebar: ProfessorX, Initiatives, Plans, Pipeline Runs (current), Jobs, Tool Calls, Artifacts, Approvals, AI Calls
- Breadcrumb: ← Runs, Detail
- Environment combobox: value `sandbox`; options sandbox, staging, prod
- Actions: Re-run, Cancel run, Rollback, Approve, Reject, Export .mdd
- Tabs: Overview (selected), Flow, Tool Calls, Artifacts, Validations, Secrets Access, Events, Notes
- Headings: Run 86d38878…, Run context, Node progress
- Node progress list: “Node 69f396f7 … — eligible”, “Node f34d3e70 … — pending”
- Notifications region (alt+T)

### Analysis / potential issues
- **Run status not in snapshot:** No explicit “running” / “succeeded” / “failed” label in the tree; may be in Run context (text not exposed in this snapshot). **Note:** Consider ensuring run status is in a visible heading or region for screen readers and automation.
- **Node IDs truncated:** “69f396f7 …” and “f34d3e70 …” — truncation is expected; ensure full ID is available on focus or in a tooltip for debugging.
- **Duplicate “Pipeline Runs”:** Appears as sidebar link (e52) and again as listitem (e82); could be intentional (nav + breadcrumb/section). No bug if by design.
- **Re-run / Cancel / Rollback:** All present and actionable. No errors observed.

---

## Snapshot 2 — Run detail, Artifacts tab

**URL:** same run  
**Tab:** Artifacts (active, focused, selected)

### What’s visible
- Tab Artifacts has states: active, focused, selected (correct).
- Heading (level 2): “Artifacts”.
- Empty state: “No artifacts” and “No artifacts recorded for this run.” (refs e107, e108).
- No table, no “Open preview” link, no artifact rows.

### Analysis / potential issues
- **Empty state is clear:** Copy explains that no artifacts were recorded for this run. Good for UX.
- **No run-status context here:** User doesn’t see on this tab whether the run is still running (jobs pending) or already finished. **Suggestion:** Optional short line under the heading, e.g. “Run status: running” or “Run completed — no artifacts produced,” so empty state is easier to interpret.
- **No errors in DOM:** No visible error messages or broken refs.

---

## Snapshot 3 — Run detail, Flow tab

**URL:** same run (`/runs/86d38878-...`)  
**Tab:** Flow (active, focused, selected)

### What’s visible
- Tab Flow has states: active, focused, selected.
- Heading (level 2): “Execution flow”.
- No graph nodes, edges, or job labels in the a11y tree — only the heading and Notifications region.

### Analysis / potential issues
- **Flow content not exposed in snapshot:** The execution DAG (nodes/edges) is likely rendered in a canvas or SVG; the snapshot does not show node names, status, or links. **Note:** For a11y and test automation, consider adding `aria-label` on the flow container and/or exposing key node names as hidden text or use a `role="img"` with a descriptive label (e.g. “Execution flow: 2 nodes, copy_generate eligible, landing_page pending”).
- **No errors:** No visible error refs or failed state.

---

## Snapshot 4 — Pipeline Runs list

**URL:** `/runs`  
**Page:** Pipeline Runs list

### What’s visible
- Heading (level 1): “Pipeline Runs” with subtitle “Orchestration run history. Create an initiative and run a plan to see runs here.”
- Run links (truncated IDs): df5908af …, 96096cc6 …, 582a2b46 …, 0f99bdf7 …, b7c4e76e …, 86d38878 … (refs e89–e94).
- Same nav/sidebar as before; Environment combobox (sandbox).
- No table column headers (e.g. Status, Plan, Started) visible in the snapshot — list may be table/grid with headers not exposed.

### Analysis / potential issues
- **Run list is navigable:** Each run is a link; good for keyboard and automation.
- **Truncated IDs only:** Screen reader users may not get status or date without opening a run. **Suggestion:** If the table has Status/Started columns, ensure they are associated (e.g. row scope or aria-describedby) so they appear in the a11y tree.
- **No errors:** No error messages or broken refs in snapshot.

---

## Summary

| Snapshot | Page / tab           | Issues / notes                                                                 |
|----------|----------------------|---------------------------------------------------------------------------------|
| 1        | Run detail, Overview | Run status not in tree; node IDs truncated (OK); duplicate “Pipeline Runs” (likely intentional). |
| 2        | Run detail, Artifacts| Clear empty state; optional: show run status on this tab for context.            |
| 3        | Run detail, Flow     | DAG content not exposed in a11y tree; consider aria-label or descriptive summary. |
| 4        | Pipeline Runs list   | Run links work; table headers/status not visible in snapshot — improve a11y if possible. |

**Bugs found:** None (no functional errors or broken UI).  
**Improvements suggested:** Run status visibility (Overview/Artifacts), Flow DAG a11y, Runs list column exposure for screen readers.

---

## Snapshot 5 — Landing page (home)

**URL:** `https://ai-factory-console-git-main-proventheorys-projects.vercel.app/`  
**Path:** `/` (root)

### How we got here
- No run in the list had a **landing_page artifact** (API returned empty `items` for all runs). So the “landing page” from a pipeline run (Open preview) does not exist yet.
- Navigated to the **app landing page** by clicking **Home** in the nav: now on `/`.

### What’s visible
- **Sign in** (link)
- **Dashboard** (link)
- **Heading (h1):** ProfessorX
- **Tagline:** When an individual acquires great power, the use or misuse of that power is everything.
- Notifications region (alt+T)

### Analysis
- **Landing page is minimal and clear:** Two actions (Sign in, Dashboard), branding and tagline. No errors in snapshot.
- **Pipeline “landing page” artifact:** To see a **generated** landing page (from a run), a run must complete with a `landing_page` artifact; then in Run → Artifacts you’d see “Open preview.” Currently no runs have artifacts — ensure the Render worker is healthy and re-run (or start a new run) until jobs complete and artifacts appear.

---
