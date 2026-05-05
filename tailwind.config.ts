import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0d12",
          surface: "#11141b",
          elevated: "#161a23",
          border: "#222734",
        },
        accent: {
          DEFAULT: "#7c5cff",
          hover: "#6a4ae8",
          glow: "rgba(124, 92, 255, 0.25)",
        },
        ink: {
          DEFAULT: "#e6e8ee",
          muted: "#9aa0ad",
          dim: "#6b7280",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(124, 92, 255, 0.4), 0 8px 32px -8px rgba(124, 92, 255, 0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
