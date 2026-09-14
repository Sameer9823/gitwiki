import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens — backed by CSS variables (see globals.css
        // :root / .light) so the whole app retheme with one class toggle.
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          hover: "rgb(var(--color-primary-hover) / <alpha-value>)",
          secondary: "rgb(var(--color-accent-secondary) / <alpha-value>)",
          foreground: "#FFFFFF",
        },
        background: "rgb(var(--color-background) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        "surface-muted": "rgb(var(--color-surface-muted) / <alpha-value>)",
        "surface-hover": "rgb(var(--color-surface-hover) / <alpha-value>)",
        border: "rgb(var(--color-border) / 0.08)",
        "border-strong": "rgb(var(--color-border) / 0.16)",
        text: "rgb(var(--color-text) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        "text-subtle": "rgb(var(--color-text-subtle) / <alpha-value>)",
        success: {
          DEFAULT: "#22C55E",
          bg: "#0E2A1E",
          border: "#1E4D3A",
        },
        warning: {
          DEFAULT: "#F59E0B",
          bg: "#2E240A",
          border: "#4D3A0F",
        },
        error: {
          DEFAULT: "#EF4444",
          bg: "#2E0E0E",
          border: "#4D1A1A",
        },
        info: {
          DEFAULT: "#38BDF8",
          bg: "#0E142E",
          border: "#1A244D",
        },
        // Legacy aliases — kept theme-reactive (same CSS vars as their
        // modern counterparts) since they're still used throughout the app.
        bg: "rgb(var(--color-background) / <alpha-value>)",
        "surface-2": "rgb(var(--color-surface-muted) / <alpha-value>)",
        ink: "rgb(var(--color-text) / <alpha-value>)",
        muted: "rgb(var(--color-text-muted) / <alpha-value>)",
        gold: "#F59E0B",
        danger: "#EF4444",
        good: "#22C55E",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Typography scale — only lineHeight / letterSpacing / fontWeight are valid here
        "page-title": ["clamp(1.875rem, 4vw, 2.5rem)", { lineHeight: "1.1", fontWeight: "500" }],
        "page-subtitle": ["clamp(1rem, 2vw, 1.125rem)", { lineHeight: "1.5", fontWeight: "400" }],
        "section-heading": ["1.125rem", { lineHeight: "1.4", fontWeight: "500" }],
        "card-title": ["1rem", { lineHeight: "1.4", fontWeight: "500" }],
        body: ["0.9375rem", { lineHeight: "1.6" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5" }],
        secondary: ["0.875rem", { lineHeight: "1.5" }],
        caption: ["0.75rem", { lineHeight: "1.4" }],
        code: ["0.8125rem", { lineHeight: "1.5" }],
      },
      spacing: {
        // Consistent spacing rhythm
        "page-x": "1.5rem", // 24px
        "page-y": "2rem", // 32px
        "section": "2.5rem", // 40px
        "card": "1.5rem", // 24px
        "card-sm": "1rem", // 16px
        "list": "0.5rem", // 8px
        "sidebar": "1rem", // 16px
        "button-h-sm": "2rem", // 32px
        "button-h-md": "2.5rem", // 40px
        "button-h-lg": "3rem", // 48px
        "input-h": "2.5rem", // 40px
        "modal": "1.5rem", // 24px
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3)",
        modal: "0 8px 32px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)",
        dropdown: "0 4px 16px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
      },
      transitionDuration: {
        fast: "120ms",
        normal: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        default: "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      maxWidth: {
        "page-narrow": "42rem", // 672px
        "page-normal": "56rem", // 896px
        "page-wide": "72rem", // 1152px
        "page-full": "88rem", // 1408px
      },
    },
  },
  plugins: [],
} satisfies Config;
