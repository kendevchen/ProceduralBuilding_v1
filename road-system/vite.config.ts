import { defineConfig } from "vite";

// Standalone lab page for the road / city-block system (run: npm run dev:road).
// Own dependency cache so it can run beside the building project's dev server
// without the two re-optimizing each other's deps.
export default defineConfig({
  cacheDir: "../node_modules/.vite-road",
  server: { port: 5175, strictPort: true },
});
