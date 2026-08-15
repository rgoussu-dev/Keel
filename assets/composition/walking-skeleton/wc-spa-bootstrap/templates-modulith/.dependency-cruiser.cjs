/**
 * The walls module resolution cannot hold, enforced at lint time.
 *
 * Two of the modulith's rules are real resolution and need no help:
 * `@<scope>/<ctx>` reaches a context's facade, `/elements` its
 * registration, `/service` its peer seam, and anything deeper is a
 * `TS2307` from tsc and an `ERR_PACKAGE_PATH_NOT_EXPORTED` from Node.
 * What resolution cannot see is a **relative path** into another
 * package's tree, and an import that stays inside one package while
 * crossing its layers.
 *
 * `enhancedResolveOptions` is load-bearing, not tuning. Without it
 * dependency-cruiser resolves every `@<scope>/*` import to a bare
 * specifier, follows nothing, and reports **zero** violations over a
 * tree that is in violation.
 */
module.exports = {
  forbidden: [
    {
      name: 'context-through-its-aperture',
      severity: 'error',
      comment:
        'Reach a bounded context only through its published entry points — the facade, ./elements, ./service. A relative path into its tree bypasses the exports map, which is the only wall the toolchain enforces on its own.',
      from: { path: '^(application|platform|design-system)/' },
      to: {
        path: '^modules/[^/]+/src/',
        pathNot: '^modules/[^/]+/src/(index|elements|service)\\.ts$',
      },
    },
    {
      name: 'domain-owns-no-adapters',
      severity: 'error',
      comment:
        "A context's domain is the inside of the hexagon: it declares ports and never imports the adapters that implement them, its own included. Dependencies point inward.",
      from: { path: '^modules/[^/]+/src/domain/' },
      to: { path: '^modules/[^/]+/src/(user-side|infra)/' },
    },
    {
      name: 'domain-knows-no-dom',
      severity: 'error',
      comment:
        "A context's domain is DOM-less: it is the half that must keep compiling and testing without a browser. Elements, the context protocol and the design system live outside src/domain/.",
      from: { path: '^modules/[^/]+/src/domain/' },
      to: { path: '^(design-system|platform/context)/' },
    },
    {
      name: 'design-system-is-domain-blind',
      severity: 'error',
      comment:
        'The design system is consumed by every context and knows none of them. A domain-aware atom is the fastest way to make it un-shareable — and it is the package the import map deduplicates, so it must stay a leaf.',
      from: { path: '^design-system/' },
      to: { path: '^(modules|platform|application)/' },
    },
    {
      name: 'peers-meet-at-the-service-seam',
      severity: 'error',
      comment:
        "One context reaches another only through its ./service entry point. Naming a peer's facade couples you to its domain vocabulary; the seam exists to carry the consumer's.",
      from: { path: '^modules/([^/]+)/' },
      to: {
        path: '^modules/[^/]+/src/',
        pathNot: '^modules/($1/|[^/]+/src/service\\.ts$)',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'browser', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
