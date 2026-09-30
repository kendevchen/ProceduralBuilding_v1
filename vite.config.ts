import { defineConfig } from 'vite';

// GitHub Pages serves the site under /<repo>/, so production builds prefix every
// asset URL with it (vite preview mirrors that); the dev server stays at /.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/ProceduralBuilding_v1/' : '/',
  server: {
    port: 5173,
    open: true
  }
}));
