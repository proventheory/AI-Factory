import type { Config } from "tailwindcss";
import { tokens } from "./src/design-tokens/tokens";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}", "./app/**/*.{js,ts,jsx,tsx,mdx}"],
  presets: [require("@ai-factory/ui/preset")],
  theme: {
    extend: {
      colors: {
        brand: tokens.color.brand,
        surface: tokens.color.surface,
        text: tokens.color.text,
        state: {
          success: tokens.color.state.success,
          successMuted: tokens.color.state.successMuted,
          warning: tokens.color.state.warning,
          warningMuted: tokens.color.state.warningMuted,
          danger: tokens.color.state.danger,
          dangerMuted: tokens.color.state.dangerMuted,
          info: tokens.color.state.info,
          infoMuted: tokens.color.state.infoMuted,
        },
        border: {
          DEFAULT: "hsl(var(--border))",
          subtle: tokens.color.border.subtle,
          default: tokens.color.border.default,
          strong: tokens.color.border.strong,
        },
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },
      fontFamily: {
        sans: tokens.typography.fontFamily.sans.split(",").map((s) => s.trim()),
        mono: tokens.typography.fontFamily.mono.split(",").map((s) => s.trim()),
      },
      fontSize: {
        ...tokens.typography.fontSize,
        "heading-1": [tokens.typography.heading.h1.size, { lineHeight: String(tokens.typography.heading.h1.lineHeight) }],
        "heading-2": [tokens.typography.heading.h2.size, { lineHeight: String(tokens.typography.heading.h2.lineHeight) }],
        "heading-3": [tokens.typography.heading.h3.size, { lineHeight: String(tokens.typography.heading.h3.lineHeight) }],
        "heading-4": [tokens.typography.heading.h4.size, { lineHeight: String(tokens.typography.heading.h4.lineHeight) }],
        "heading-5": [tokens.typography.heading.h5.size, { lineHeight: String(tokens.typography.heading.h5.lineHeight) }],
        "heading-6": [tokens.typography.heading.h6.size, { lineHeight: String(tokens.typography.heading.h6.lineHeight) }],
        subheading: [tokens.typography.subheading.size, { lineHeight: String(tokens.typography.subheading.lineHeight) }],
        display: [
          tokens.typography.display.size,
          { lineHeight: String(tokens.typography.display.lineHeight), letterSpacing: tokens.typography.display.letterSpacing },
        ],
        "body-default": [tokens.typography.body.default.size, { lineHeight: String(tokens.typography.body.default.lineHeight) }],
        "body-small": [tokens.typography.body.small.size, { lineHeight: String(tokens.typography.body.small.lineHeight) }],
        caption: [tokens.typography.caption.size, { lineHeight: String(tokens.typography.caption.lineHeight) }],
        "caption-small": [tokens.typography.small.size, { lineHeight: String(tokens.typography.small.lineHeight) }],
      },
      fontWeight: {
        normal: String(tokens.typography.fontWeight.normal),
        medium: String(tokens.typography.fontWeight.medium),
        semibold: String(tokens.typography.fontWeight.semibold),
        bold: String(tokens.typography.fontWeight.bold),
      },
      spacing: tokens.spacing,
      borderRadius: {
        ...tokens.radius,
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: tokens.shadow,
      transitionDuration: {
        fast: tokens.motion.duration.fast.replace("ms", ""),
        normal: tokens.motion.duration.normal.replace("ms", ""),
        slow: tokens.motion.duration.slow.replace("ms", ""),
      },
      transitionTimingFunction: tokens.motion.easing,
      maxWidth: tokens.layout.container,
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
