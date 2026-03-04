# Console UI Library (Tailwind blocks)

Reusable UI is built as **React components that use Tailwind CSS** in `console/src/components/ui/`. There is no separate “block” file format; each component is a TypeScript/React module. Tailwind’s `content` in `tailwind.config.ts` includes `./src/**/*.{js,ts,jsx,tsx,mdx}` and `./app/**/*.{js,ts,jsx,tsx,mdx}`, so any class used in these components is included in the build.

## How the library is structured

- **Single source of truth:** Components live under `src/components/ui/` and are re-exported from `src/components/ui/index.ts`. Pages and other components import from `@/components/ui` (or `@/components/ui/ComponentName`).
- **Tailwind-only styling:** No component CSS files; all styling is via Tailwind utility classes. Design tokens (e.g. `brand.*`) are defined in `tailwind.config.ts`.
- **Composition:** Larger “blocks” (e.g. a card with header and table) are built by composing these primitives in page or feature components, not as separate block files.

## Design tokens (fully tokenized)

All brand UI/UX comes from **`src/design-tokens/tokens.ts`**. Tailwind theme extends from it; CSS variables in **`src/design-tokens/generated.css`** drive emails, landing pages, PDFs. See **`docs/DESIGN_TOKENS.md`**.

- **Colors:** `brand`, `surface`, `state`, `border`, `neutral`. Use `text-brand-600`, `bg-surface-raised`, `text-state-success`, etc.
- **Typography:** `text-heading-1` … `text-heading-6` (use with `font-bold` / `font-semibold`), `text-subheading font-medium`, `text-body-default`, `text-body-small`, `text-caption`, `text-caption-small`.
- **Spacing:** 4px grid via `tokens.spacing` — `p-4`, `gap-6`, etc.
- **Radius, shadow, motion:** `rounded-md`, `shadow-default`, `transition-normal`, `easing-standard`.

## Components (primitives)

| Component      | Purpose |
|----------------|--------|
| `Button`       | Primary, secondary, ghost, danger variants |
| `Input`        | Text input with border and focus ring |
| `Select`       | Native select styled for forms |
| `Checkbox`     | Checkbox input |
| `Switch`       | Toggle switch |
| `Badge`        | Status pill (success, warning, error, neutral, info) |
| `Card`, `CardHeader`, `CardContent` | Bordered container with optional header |
| `Panel`        | Simple bordered panel with optional title |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Tabbed content |
| `Modal`        | Overlay modal with title and close |
| `Drawer`       | Side drawer (left/right) |
| `DataTable`    | Table with columns, optional sort and row click |
| `FilterBar`    | Filter chips with optional clear-all |
| `LoadingSkeleton`, `PageLoadingSkeleton` | Loading placeholders |
| `ErrorBoundary`| React error boundary with fallback UI |
| `EmptyState`   | Empty list / no-data message and optional action |

## Usage

```tsx
import { Button, Card, Badge, DataTable } from "@/components/ui";

<Card>
  <CardHeader>Title</CardHeader>
  <CardContent>
    <Badge variant="success">OK</Badge>
    <Button variant="primary" onClick={...}>Save</Button>
  </CardContent>
</Card>
```

## Adding new blocks

1. Add a new `.tsx` under `src/components/ui/` (e.g. `ArtifactCard.tsx`).
2. Use only Tailwind classes (and existing tokens). Avoid inline styles.
3. Export from `src/components/ui/index.ts`.
4. Optionally add a row to this README.

We use **shadcn/ui** (New York style) alongside these primitives; design tokens and this library stay aligned with the Control Plane console. See [docs/UI_AND_CURSOR.md](../../../docs/UI_AND_CURSOR.md) for canonical components and Cursor prompts.
