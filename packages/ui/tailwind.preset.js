/** @type {import('tailwindcss').Config} */
// Self-contained preset aligned with design tokens (see src/tokens.ts)
module.exports = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eff6ff", 100: "#dbeafe", 200: "#bfdbfe", 300: "#93c5fd",
          400: "#60a5fa", 500: "#3b82f6", 600: "#2563eb", 700: "#1d4ed8",
          800: "#1e40af", 900: "#1e3a8a",
        },
        surface: { base: "#ffffff", raised: "#f8fafc", sunken: "#f1f5f9" },
        text: { primary: "#0f172a", secondary: "#334155", muted: "#64748b", inverse: "#ffffff" },
        state: {
          success: "#059669", successMuted: "#d1fae5", warning: "#d97706", warningMuted: "#fef3c7",
          danger: "#dc2626", dangerMuted: "#fee2e2", info: "#2563eb", infoMuted: "#dbeafe",
        },
        border: { subtle: "#e2e8f0", default: "#cbd5e1", strong: "#94a3b8" },
        neutral: {
          50: "#f8fafc", 100: "#f1f5f9", 200: "#e2e8f0", 300: "#cbd5e1", 400: "#94a3b8",
          500: "#64748b", 600: "#475569", 700: "#334155", 800: "#1e293b", 900: "#0f172a",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
      },
      spacing: { 0: "0", 1: "0.25rem", 2: "0.5rem", 3: "0.75rem", 4: "1rem", 5: "1.25rem", 6: "1.5rem", 8: "2rem", 10: "2.5rem", 12: "3rem", 16: "4rem", 20: "5rem", 24: "6rem" },
      borderRadius: { none: "0", sm: "0.25rem", default: "0.375rem", md: "0.5rem", lg: "0.75rem", xl: "1rem", full: "9999px" },
      boxShadow: {
        sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        default: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)",
      },
      maxWidth: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
      transitionDuration: { fast: "150", normal: "250", slow: "350" },
      transitionTimingFunction: { standard: "cubic-bezier(0.4, 0, 0.2, 1)", emphasized: "cubic-bezier(0.2, 0, 0, 1)" },
    },
  },
};
