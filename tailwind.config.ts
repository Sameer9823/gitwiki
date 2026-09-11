import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic color tokens
        primary: {
          DEFAULT: "#6C7BFF",
          hover: "#5A6AE8",
          foreground: "#FFFFFF",
        },
        accent: {
          DEFAULT: "#6C7BFF",
          hover: "#5A6AE8",
          foreground: "#FFFFFF",
        },
        background: "#10131A",
        surface: "#171B24",
        "surface-muted": "#1E2330",
        "surface-hover": "#242936",
        border: "#2A3040",
        "border-strong": "#3A4050",
        text: "#E6E9F0",
        "text-muted": "#8B93A7",
        "text-subtle": "#6B7387",
        success: {
          DEFAULT: "#4FD1A5",
          bg: "#0E2A1E",
          border: "#1E4D3A",
        },
        warning: {
          DEFAULT: "#F2B85C",
          bg: "#2E240A",
          border: "#4D3A0F",
        },
        error: {
          DEFAULT: "#EF6B6B",
          bg: "#2E0E0E",
          border: "#4D1A1A",
        },
        info: {
          DEFAULT: "#6C7BFF",
          bg: "#0E142E",
          border: "#1A244D",
        },
        // Legacy aliases for backward compatibility
        bg: "#10131A",
        "surface-2": "#1E2330",
        ink: "#E6E9F0",
        muted: "#8B93A7",
        gold: "#F2B85C",
        danger: "#EF6B6B",
        good: "#4FD1A5",
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
