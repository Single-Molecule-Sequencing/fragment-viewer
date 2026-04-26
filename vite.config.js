import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages base path. Set to repo name when deployed under
// https://single-molecule-sequencing.github.io/fragment-viewer/.
const base = process.env.GH_PAGES_BASE || "/";

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    // Split vendor + per-tab chunks so the main bundle isn't a single
    // ~500 KB blob. Caching wins on revisits + faster initial paint.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          recharts: ["recharts"],
          icons: ["lucide-react"],
        },
      },
    },
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
  },
});
