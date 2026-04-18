/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      colors: {
        // Dye-channel accents tied to the CLC assay dyes (BIOLOGY.md §3)
        dye: {
          B: '#1e6fdb',  // 6-FAM (blue)
          G: '#16a34a',  // HEX (green)
          Y: '#ca8a04',  // TAMRA (gold/yellow, darker for contrast)
          R: '#dc2626',  // ROX (red)
          O: '#ea580c',  // Orange (size standard)
        },
      },
      boxShadow: {
        soft: '0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)',
      },
    },
  },
  plugins: [],
};
