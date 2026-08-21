import { defineConfig } from 'vite';
import {
  DESIGN_SYSTEM,
  serveVendoredDesignSystem,
  vendorDesignSystem,
} from './vendor-design-system';

export default defineConfig({
  build: {
    rollupOptions: {
      // Resolved by the import map in index.html, not by the bundler.
      external: [DESIGN_SYSTEM],
    },
  },
  // `vendorDesignSystem` copies the design system's build into `dist/vendor`
  // on `vite build`; `serveVendoredDesignSystem` serves the same files
  // straight from its `dist/` on `vite dev`, since `build` is the only one
  // of the two a bundling step runs.
  plugins: [vendorDesignSystem(), serveVendoredDesignSystem()],
});
