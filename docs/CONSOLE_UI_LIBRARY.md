# Console UI Library and Tailwind Blocks

## How reusable elements are created

The Console uses **shadcn/ui** (Radix primitives + Tailwind) plus custom layout primitives. Reusable elements are:

1. **Design tokens (single source of truth):** `console/src/design-tokens/tokens.ts` defines **every** brand UI/UX value: colors (brand, surface, text, state, border), typography (font families, heading h1–h6, subheading, body, caption, small, weights, line heights), spacing (4px grid), radius, shadow, motion, border width. **Everything is tokenized** so the same system drives the Console, **emails**, **landing pages**, and **PDFs**. Generated CSS variables in `console/src/design-tokens/generated.css` expose all tokens as `--brand-*` for use outside Tailwind. See **`docs/DESIGN_TOKENS.md`**.
2. **React components** in `console/src/components/ui/`: shadcn components plus **layout primitives** (PageFrame, Stack, CardSection, TableFrame) for every Ops/Admin page; all use Tailwind and token-based classes (e.g. `text-heading-2`, `text-brand-600`, `rounded-md`).
3. **Tailwind theme** in `console/tailwind.config.ts` extends from `tokens.ts` so all Tailwind classes map to tokens.
4. **Single export surface:** `console/src/components/ui/index.ts` re-exports every primitive so pages import from `@/components/ui`.

See [UI_AND_CURSOR.md](UI_AND_CURSOR.md) and [UI_DEBUGGING.md](UI_DEBUGGING.md) for layout rules and 8px grid. Larger blocks (e.g. run detail header, initiative card) are built in page or feature components by composing these primitives.

## Component list and usage

See **`console/src/components/ui/README.md`** for the full list (Button, Input, Select, Badge, Card, Tabs, DataTable, FilterBar, Modal, Drawer, LoadingSkeleton, ErrorBoundary, EmptyState, etc.) and usage examples.

## Adding new reusable blocks

1. Add `ComponentName.tsx` under `console/src/components/ui/`.
2. Use only Tailwind classes (and existing theme tokens).
3. Export from `console/src/components/ui/index.ts`.
4. Update the UI README if it’s a new primitive.

This keeps the design system in-repo and aligned with the Control Plane console without external block dependencies.
