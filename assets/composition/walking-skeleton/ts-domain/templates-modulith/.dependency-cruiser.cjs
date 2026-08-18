/**
 * The walls the `exports` map cannot hold, enforced at lint time.
 *
 * Two of the modulith's rules are real module resolution and need no
 * help: `@<scope>/<ctx>` reaches the context's facade, `/service` its
 * peer seam, and anything deeper is rejected by tsc (`TS2307`) and by
 * Node (`ERR_PACKAGE_PATH_NOT_EXPORTED`). What resolution cannot see
 * is a **relative path** that walks into another package's tree, and
 * an import that stays inside one package but crosses its layers.
 * Those are the two rules below.
 *
 * `enhancedResolveOptions` is load-bearing, not tuning. Without it
 * dependency-cruiser resolves every `@<scope>/*` import to a bare
 * specifier, follows nothing, and reports **zero** violations over a
 * tree that is in violation — a lint that passes by failing to look.
 * With `exportsFields` and `.ts` in `extensions` it resolves each
 * workspace import to the file the map actually publishes, and the
 * rules below have something to match against.
 */
module.exports = {
  forbidden: [
    {
      name: 'context-through-its-aperture',
      severity: 'error',
      comment:
        'Reach a bounded context only through its published entry points — @scope/<ctx> for the facade, @scope/<ctx>/service for the peer seam. A relative path into its tree bypasses the exports map, which is the only wall TypeScript enforces on its own.',
      from: { path: '^(application|platform)/' },
      to: {
        path: '^modules/[^/]+/src/',
        pathNot: '^modules/[^/]+/src/(index|service)\\.ts$',
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
      name: 'domain-knows-no-platform',
      severity: 'error',
      comment:
        "A context's domain is written against ports, not against the runtime it happens to run on: no node: builtins inside src/domain/. This one has to be a lint. tsconfig's types: [] looks like it covers it and does not — it suppresses the automatic global @types, while an explicit `import … from 'node:async_hooks'` still resolves and typechecks clean.",
      from: { path: '^modules/[^/]+/src/domain/' },
      to: { dependencyTypes: ['core'] },
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
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types'],
    },
  },
};
