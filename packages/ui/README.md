# @ai-factory/ui

Shared design tokens and Tailwind preset for AI Factory Console and email-marketing-factory.

## Usage

### Tailwind preset

In your app's `tailwind.config.ts`:

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  presets: [require("@ai-factory/ui/tailwind.preset.js")],
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./src/**/*.{js,ts,jsx,tsx}"],
  // ... rest of config
};
```

Or with path (if not using workspace):

```ts
presets: [require("../packages/ui/tailwind.preset.js")],
```

### Tokens (JS)

```ts
import { tokens } from "@ai-factory/ui";
// or from "~/../packages/ui"
```

## MUI → shadcn mapping (for email-marketing-factory)

| MUI | shadcn |
|-----|--------|
| Button | Button |
| TextField | Input + Label |
| Select | Select |
| Card | Card |
| Dialog | Dialog |
| Table | Table (use with TanStack Table) |
| Tabs | Tabs |
| Menu / Dropdown | DropdownMenu |
| IconButton | Button variant="ghost" size="icon" |

Use Lucide for icons (shadcn default) instead of @mui/icons-material.
