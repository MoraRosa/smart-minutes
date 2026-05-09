import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import path from "node:path";

// Standalone SPA build for GitHub Pages.
// Uses pages/index.html as entry and outputs to dist-pages/.
// Set BASE_PATH env var to your repo name when deploying to user.github.io/repo-name/
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react(), tailwindcss(), tsconfigPaths()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "pages/index.html"),
    },
  },
});
