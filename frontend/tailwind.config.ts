import type { Config } from "tailwindcss";

export default {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // Ajitama design tokens (docs/design.md); the same values live as --aj-* in app/globals.css.
        aj: {
          yolk: "#F4BC2B",
          ink: "#1E1B18",
          "ink-soft": "#5A4512",
          muted: "#625B52",
          line: "#ECE8DF",
          page: "#F5F4F0",
          surface: "#FFFFFF",
          "yolk-tint": "#FFF2CC",
          chili: "#E0482B",
          "alert-ink": "#12100E",
          "chili-tint": "#FDE2DA",
          "chili-text": "#A3260F",
          "detail-bg": "#FFFAED",
          "detail-line": "#B0AFAE",
        },
      },
      boxShadow: {
        "aj-control": "0 3px 0 #1E1B18",
        "aj-dropdown": "0 2px 0 #1E1B18",
        "aj-pressed": "0 1px 0 #1E1B18",
        "aj-popup": "7px 7px 0 #1E1B18",
      },
      fontFamily: {
        "aj-display": ["var(--font-dela)", "Dela Gothic One", "Arial Black", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
