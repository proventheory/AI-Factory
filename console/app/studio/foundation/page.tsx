"use client";

import Link from "next/link";
import { PageFrame, Stack, PageHeader, CardSection } from "@/components/ui";

const FOUNDATION_LINKS = [
  { href: "/studio/typography", label: "Typography", description: "Font families, sizes, weights, headings, body, caption. Drives Console, emails, and documents." },
  { href: "/studio/colors", label: "Colors", description: "Brand, surface, text, state, border, neutral. Single source for UI and email." },
  { href: "/studio/spacing", label: "Spacing", description: "4px grid spacing scale. Used for layout and component padding/margins." },
];

const DESIGN_SYSTEM_LINKS = [
  { href: "/components", label: "Components", description: "Email and document components (MJML/HTML). Used by templates and email campaigns." },
  { href: "/studio/blocks", label: "Blocks", description: "Reusable blocks (email, deck, report). Same as Component Registry." },
  { href: "/document-templates", label: "Pages", description: "Document templates (email, landing, PDF). Compose from components and tokens." },
  { href: "/brand-themes", label: "Themes", description: "Brand theme variants. Override tokens and component variants per brand." },
  { href: "/releases", label: "Releases", description: "Canary and promoted releases. Affects which tokens and templates are active." },
  { href: "/brands", label: "Brands", description: "Brand profiles. Design tokens, deck theme, report theme per brand." },
  { href: "/tokens", label: "Token Registry", description: "Full token tree by brand. Platform defaults and per-brand overrides." },
];

export default function FoundationPage() {
  return (
    <PageFrame>
      <Stack>
        <PageHeader
          title="Foundation"
          description="Design system foundation: typography, colors, and spacing. These tokens drive the Console, emails, document templates, and landing pages."
        />
        <p className="text-body-small text-text-muted mb-4">
          All values come from <code className="rounded bg-slate-100 px-1">console/src/design-tokens/tokens.ts</code> and
          per-brand overrides in <Link href="/brands" className="text-brand-600 hover:underline">Brands</Link>.
          Email components and templates consume the same tokens via generated CSS and the Component Registry.
        </p>

        <CardSection title="Token foundation">
          <ul className="space-y-3">
            {FOUNDATION_LINKS.map(({ href, label, description }) => (
              <li key={href}>
                <Link href={href} className="font-medium text-brand-600 hover:underline">{label}</Link>
                <p className="text-body-small text-text-muted mt-0.5">{description}</p>
              </li>
            ))}
          </ul>
        </CardSection>

        <CardSection title="Design system & content">
          <ul className="space-y-3">
            {DESIGN_SYSTEM_LINKS.map(({ href, label, description }) => (
              <li key={href}>
                <Link href={href} className="font-medium text-brand-600 hover:underline">{label}</Link>
                <p className="text-body-small text-text-muted mt-0.5">{description}</p>
              </li>
            ))}
          </ul>
        </CardSection>
      </Stack>
    </PageFrame>
  );
}
