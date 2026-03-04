# UI debugging tools and layout rules

This doc describes external tools and in-repo setup for debugging Console UI (layout, responsive, a11y) and what to do when layout tests fail.

## External tools (no repo code)

| Tool | Role | When to use |
|------|------|-------------|
| **Polypane** | Premium; multi-viewport + a11y | Optional for devs; manual layout and a11y checks when you need multiple viewports and built-in a11y. |
| **Responsively App** ([responsively-org/responsively-app](https://github.com/responsively-org/responsively-app)) | Free, local; synced viewports | **Recommended** for local responsive debugging. Run the app, point at localhost:3000, use synced device frames. |
| **Locofy Lightning** | Figma → Tailwind / layout validation | Reference only when converting Figma designs to Tailwind or validating structure. |
| **tailwindcss-debug-screens** | Shows active breakpoint in corner | Optional dev dependency in Console; enable only in development (`NODE_ENV=development`) so production is unchanged. Add to Tailwind and show current breakpoint label in a corner. |

## In-repo: Storybook and Playwright

- **Storybook** (`npm run storybook`) — Component isolation and viewport testing. Stories for PageFrame, Stack, CardSection, TableFrame, PageHeader, Card, EmptyState, FilterBar live in `console/src/components/ui/*.stories.tsx`. Use Viewport addon for mobile/tablet/desktop; use a11y addon to catch issues early.
- **Playwright** (`npm run test:e2e`) — E2E layout and responsive tests in `console/tests/`. Projects: mobile (375×812), tablet (768×1024), desktop (1440×900). Specs: `layout.spec.ts` (AppShell, main content, no horizontal overflow), `responsive.spec.ts` (routes load, sidebar/button visibility by viewport).

## When a layout test fails

1. **Playwright fails (layout or responsive)** — Screenshot/diff is in the test output. Fix using the **layout primitives** and **8px grid** (see [UI_AND_CURSOR.md](UI_AND_CURSOR.md#layout-primitives-and-8px-grid)).
2. **Rules:** Wrap page content in **PageFrame**; use **Stack** for vertical sections (gap-6); use **CardSection** for card blocks; wrap tables in **TableFrame**; use only gap-2/4/6/8 and padding inside primitives; put `min-w-0` on flex children that contain text/tables; use `overflow-x-auto` only around tables (TableFrame), not the whole page; max-width 1400px for main content.
3. Re-run: `npm run test:e2e` (or `npm run test:e2e -- --grep "layout|responsive"`).

## Optional: autonomous and visual QA

- **browser-use** ([browser-use/browser-use](https://github.com/browser-use/browser-use)) — Autonomous browser agent for human-like UI flows. Use optionally for smoke or exploratory QA after Playwright covers layout/responsive/visual.
- **Flowise / Langflow** — Visual node editors for LLM workflows. Use optionally to debug agent pipelines (prompt chains, agent flows) alongside Console’s run/DAG view.

## Design rules for agents (layout)

When generating or fixing UI (Cursor, v0, or scripts), follow:

1. **PageFrame** wraps every page content.
2. **Stack** for vertical sections with `gap-6`.
3. **CardSection** for card blocks (optional title + right slot).
4. **TableFrame** wraps tables so only the table scrolls horizontally.
5. **8px grid:** use only `gap-2` (8px), `gap-4` (16px), `gap-6` (24px), `gap-8` (32px) and equivalent `p-*` inside primitives.
6. **min-w-0** on flex children that contain tables or long text.
7. **overflow-x-auto** only around tables (TableFrame), not the whole page.
8. **Max-width** 1400px (or 1280px) for dashboard/main content (PageFrame handles this).
