import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./hooks/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editorial light palette
        cream: "#FAFAF8",
        paper: "#FFFFFF",
        ink: "#111111",
        "ink-soft": "#3A3A38",
        muted: "#6B6B66",
        line: "#E5E5E3",
        // The single committed accent — swap via the --accent CSS var
        accent: "var(--accent)",
        "accent-ink": "var(--accent-ink)",
        // Interview room (the only dark surface)
        charcoal: "#1C1C1E",
        "charcoal-deep": "#141416",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        soft: "12px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(17,17,17,0.04), 0 8px 24px -12px rgba(17,17,17,0.12)",
        lift: "0 2px 4px rgba(17,17,17,0.04), 0 24px 48px -20px rgba(17,17,17,0.20)",
        glow: "0 0 0 1px rgba(245,158,11,0.20), 0 12px 40px -12px rgba(245,158,11,0.35)",
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.95)", opacity: "0.7" },
          "70%": { transform: "scale(1.3)", opacity: "0" },
          "100%": { transform: "scale(1.3)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.16,1,0.3,1) forwards",
        marquee: "marquee 32s linear infinite",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.16,1,0.3,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
