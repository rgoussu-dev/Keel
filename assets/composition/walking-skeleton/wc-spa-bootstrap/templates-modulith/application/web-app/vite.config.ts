import { defineConfig } from 'vite';
import { DESIGN_SYSTEM, vendorDesignSystem } from './vendor-design-system';

export default defineConfig({
  build: {
    rollupOptions: {
      // Resolved by the import map in index.html, not by the bundler.
      external: [DESIGN_SYSTEM],
    },
  },
  plugins: [vendorDesignSystem()],
});
