import { defineConfig } from 'vite';
import {
  DESIGN_SYSTEM,
  serveVendoredDesignSystem,
  vendorDesignSystem,
} from './vendor-design-system';

/**
 * The dev-server proxy for the sibling backend, added to — not
 * instead of — the design system's externalisation. Dropping the
 * plugin here would inline the design system back into the app
 * bundle, which is invisible until a second bundle exists and then
 * costs half the page's element registrations. `serveVendoredDesignSystem`
 * is what keeps that externalisation working under `vite dev` too, same
 * as the plain app config.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      external: [DESIGN_SYSTEM],
    },
  },
  plugins: [vendorDesignSystem(), serveVendoredDesignSystem()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/api/, ''),
      },
    },
  },
});
