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
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.mjs"],
  },
});
