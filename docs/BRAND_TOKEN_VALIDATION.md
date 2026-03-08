# Brand Token Validation

Validation rules for design_tokens (and deck_theme / report_theme references) so the edit form and API do not accept invalid or inconsistent data. **Legacy shapes must remain allowed** (see Backward compatibility in the Brand System View plan).

## Colors

| Rule | Description |
|------|--------------|
| Hex format | If present, values for `color.brand.*` must be valid hex (#RGB or #RRGGBB). |
| No duplicate token names | Within `color.brand`, keys must be unique. |
| Numeric palette keys | Allowed set: 50, 100, 200, 300, 400, 500, 600, 700, 800, 900. |
| Legacy aliases | `primary`, `primary_dark` are allowed and must not be rejected. |
| New named keys | If adding role names beyond legacy, restrict to approved set (e.g. secondary, accent) or store via roleMapping. |
| Optional | Contrast checks for primary CTA / text roles (WCAG AA). |

Validation must **allow** existing brands with only `500`, `600`, `primary`, `primary_dark`.

## Typography

| Rule | Description |
|------|--------------|
| Font family shape | String or comma-separated stack; no empty string if key present. |
| Size values | Normalized to rem or px; reject negative or zero for font size. |
| Weight values | Restricted to allowed integers: 400, 500, 600, 700 (and optionally 300). |
| Heading scale | If present, heading.h1–h6 sizes should be monotonic descending (h1 ≥ h2 ≥ … ≥ h6). |
| Body/caption fallback | If typography.body is missing, fallback to default; do not reject. |

Validation must **allow** legacy `typography.fonts.heading`, `typography.fonts.body`, `font_headings`, `font_body`.

## Mappings (deck_theme / report_theme)

| Rule | Description |
|------|--------------|
| References to design_tokens | If deck_theme or report_theme references e.g. `color.brand.700`, that key should exist in design_tokens or a fallback rule is documented (e.g. "fallback to 500"). |
| Typography roles | If report_theme references a typography role (e.g. heading font), it must exist in design_tokens or fallback cleanly. |

Validation can **warn** on missing referenced keys rather than hard-fail, so existing themes keep working.

## When to run validation

- **On read:** For resolved-token view and completeness; do not block rendering.
- **On write:** Before saving from Console edit form or API; can block save for invalid new data while allowing legacy shapes.
