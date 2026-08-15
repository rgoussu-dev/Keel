import { defineConfig } from 'vite';

/**
 * A library build, because the design system is loaded as an
 * **external** by every bundle that uses it and deduplicated through
 * the import map in the app's `index.html`.
 *
 * That is a correctness requirement rather than a size one: a package
 * defining custom elements must exist exactly once per page, and a
 * second inlined copy throws `NotSupportedError` on its first
 * registration — aborting the rest of that bundle's registrations, so
 * part of the page silently stops upgrading.
 *
 * `cssCodeSplit: false` keeps the token layers in one stylesheet the
 * app can link beside the module, since an external module's CSS is
 * not something the consuming bundle can inline for it.
 */
export default defineConfig({
  build: {
    cssCodeSplit: false,
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'design-system.js',
      cssFileName: 'design-system',
    },
  },
});
