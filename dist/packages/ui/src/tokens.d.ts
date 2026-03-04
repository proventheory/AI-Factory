/**
 * Design tokens — single source of truth for brand UI/UX.
 * Shared by Console and email-marketing-factory.
 */
export declare const tokens: {
    readonly color: {
        readonly brand: {
            readonly 50: "#eff6ff";
            readonly 100: "#dbeafe";
            readonly 200: "#bfdbfe";
            readonly 300: "#93c5fd";
            readonly 400: "#60a5fa";
            readonly 500: "#3b82f6";
            readonly 600: "#2563eb";
            readonly 700: "#1d4ed8";
            readonly 800: "#1e40af";
            readonly 900: "#1e3a8a";
        };
        readonly surface: {
            readonly base: "#ffffff";
            readonly raised: "#f8fafc";
            readonly sunken: "#f1f5f9";
        };
        readonly text: {
            readonly primary: "#0f172a";
            readonly secondary: "#334155";
            readonly muted: "#64748b";
            readonly inverse: "#ffffff";
        };
        readonly state: {
            readonly success: "#059669";
            readonly successMuted: "#d1fae5";
            readonly warning: "#d97706";
            readonly warningMuted: "#fef3c7";
            readonly danger: "#dc2626";
            readonly dangerMuted: "#fee2e2";
            readonly info: "#2563eb";
            readonly infoMuted: "#dbeafe";
        };
        readonly border: {
            readonly subtle: "#e2e8f0";
            readonly default: "#cbd5e1";
            readonly strong: "#94a3b8";
        };
        readonly neutral: {
            readonly 50: "#f8fafc";
            readonly 100: "#f1f5f9";
            readonly 200: "#e2e8f0";
            readonly 300: "#cbd5e1";
            readonly 400: "#94a3b8";
            readonly 500: "#64748b";
            readonly 600: "#475569";
            readonly 700: "#334155";
            readonly 800: "#1e293b";
            readonly 900: "#0f172a";
        };
    };
    readonly typography: {
        readonly fontFamily: {
            readonly sans: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
            readonly mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
        };
        readonly fontSize: {
            readonly xs: "0.75rem";
            readonly sm: "0.875rem";
            readonly base: "1rem";
            readonly lg: "1.125rem";
            readonly xl: "1.25rem";
            readonly "2xl": "1.5rem";
            readonly "3xl": "1.875rem";
            readonly "4xl": "2.25rem";
            readonly "5xl": "3rem";
        };
        readonly heading: {
            readonly h1: {
                readonly size: "2.25rem";
                readonly weight: 700;
                readonly lineHeight: 1.2;
            };
            readonly h2: {
                readonly size: "1.875rem";
                readonly weight: 700;
                readonly lineHeight: 1.25;
            };
            readonly h3: {
                readonly size: "1.5rem";
                readonly weight: 600;
                readonly lineHeight: 1.3;
            };
            readonly h4: {
                readonly size: "1.25rem";
                readonly weight: 600;
                readonly lineHeight: 1.35;
            };
            readonly h5: {
                readonly size: "1.125rem";
                readonly weight: 600;
                readonly lineHeight: 1.4;
            };
            readonly h6: {
                readonly size: "1rem";
                readonly weight: 600;
                readonly lineHeight: 1.5;
            };
        };
        readonly subheading: {
            readonly size: "1.125rem";
            readonly weight: 500;
            readonly lineHeight: 1.4;
        };
        readonly body: {
            readonly default: {
                readonly size: "1rem";
                readonly weight: 400;
                readonly lineHeight: 1.5;
            };
            readonly small: {
                readonly size: "0.875rem";
                readonly weight: 400;
                readonly lineHeight: 1.5;
            };
        };
        readonly caption: {
            readonly size: "0.875rem";
            readonly weight: 400;
            readonly lineHeight: 1.4;
        };
        readonly small: {
            readonly size: "0.75rem";
            readonly weight: 400;
            readonly lineHeight: 1.4;
        };
        readonly fontWeight: {
            readonly normal: 400;
            readonly medium: 500;
            readonly semibold: 600;
            readonly bold: 700;
        };
        readonly lineHeight: {
            readonly tight: 1.25;
            readonly snug: 1.375;
            readonly normal: 1.5;
            readonly relaxed: 1.625;
            readonly loose: 2;
        };
    };
    readonly spacing: {
        readonly 0: "0";
        readonly 1: "0.25rem";
        readonly 2: "0.5rem";
        readonly 3: "0.75rem";
        readonly 4: "1rem";
        readonly 5: "1.25rem";
        readonly 6: "1.5rem";
        readonly 8: "2rem";
        readonly 10: "2.5rem";
        readonly 12: "3rem";
        readonly 16: "4rem";
        readonly 20: "5rem";
        readonly 24: "6rem";
    };
    readonly layout: {
        readonly container: {
            readonly sm: "640px";
            readonly md: "768px";
            readonly lg: "1024px";
            readonly xl: "1280px";
            readonly "2xl": "1536px";
        };
    };
    readonly radius: {
        readonly none: "0";
        readonly sm: "0.25rem";
        readonly default: "0.375rem";
        readonly md: "0.5rem";
        readonly lg: "0.75rem";
        readonly xl: "1rem";
        readonly full: "9999px";
    };
    readonly shadow: {
        readonly sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)";
        readonly default: "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)";
        readonly md: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)";
        readonly lg: "0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)";
        readonly xl: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)";
    };
    readonly motion: {
        readonly duration: {
            readonly fast: "150ms";
            readonly normal: "250ms";
            readonly slow: "350ms";
        };
        readonly easing: {
            readonly standard: "cubic-bezier(0.4, 0, 0.2, 1)";
            readonly emphasized: "cubic-bezier(0.2, 0, 0, 1)";
        };
    };
    readonly border: {
        readonly width: {
            readonly thin: "1px";
            readonly default: "1px";
            readonly thick: "2px";
        };
    };
};
export type DesignTokens = typeof tokens;
//# sourceMappingURL=tokens.d.ts.map