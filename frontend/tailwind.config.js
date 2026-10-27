/** @type {import('tailwindcss').Config} */
// Warna menunjuk ke CSS variables di src/index.css (diambil dari token
// src/styles.css versi lama), jadi mode gelap ikut otomatis.
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        sunk: "var(--sunk)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        bean: { DEFAULT: "var(--bean)", on: "var(--on-bean)", soft: "var(--bean-soft)" },
        roast: { DEFAULT: "var(--roast)", soft: "var(--roast-soft)" },
        ok: { DEFAULT: "var(--ok)", soft: "var(--ok-soft)" },
        warn: { DEFAULT: "var(--warn)", soft: "var(--warn-soft)" },
        bad: { DEFAULT: "var(--bad)", soft: "var(--bad-soft)" },
      },
      fontFamily: {
        display: ["Bricolage Grotesque", "Segoe UI", "system-ui", "sans-serif"],
        sans: ["IBM Plex Sans", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "Menlo", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
