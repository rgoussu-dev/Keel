/**
 * The dependency rule, enforced (binding spec §1). TypeScript erases
 * types at runtime, so the hexagonal walls live at module resolution —
 * this config makes a rule-breaking import fail `pnpm lint` before it
 * can ship. The composition-root exception is pinned to
 * `application/cli/executable` only.
 */
module.exports = {
  forbidden: [
    {
      name: 'kernel-depends-on-nothing',
      comment: 'domain/kernel is the innermost ring: no imports from any other layer.',
      severity: 'error',
      from: { path: '^src/domain/kernel/' },
      to: { path: '^src/', pathNot: '^src/domain/kernel/' },
    },
    {
      name: 'contract-depends-only-on-kernel',
      comment: 'domain/contract may import domain/kernel (and pure libraries) only.',
      severity: 'error',
      from: { path: '^src/domain/contract/' },
      to: { path: '^src/', pathNot: '^src/domain/(kernel|contract)/' },
    },
    {
      name: 'core-stays-inside-the-hexagon',
      comment: 'domain/core never imports application/ or infrastructure/.',
      severity: 'error',
      from: { path: '^src/domain/core/' },
      to: { path: '^src/(application|infrastructure)/' },
    },
    {
      name: 'infrastructure-sees-contract-only',
      comment:
        'infrastructure adapters depend on domain/kernel and domain/contract; never on domain/core, domain/toolchain, or application/.',
      severity: 'error',
      from: { path: '^src/infrastructure/' },
      to: { path: '^src/(application|domain/(core|toolchain))/' },
    },
    {
      name: 'toolchain-context-meets-keel-at-the-contract',
      comment:
        'the provisioning context is its own hexagon: it sees domain/kernel and domain/contract (the toolchain block schema and the shared ports) only — never domain/core, application/, or infrastructure/. This seam is what makes the context extractable (roadmap item N).',
      severity: 'error',
      from: { path: '^src/domain/toolchain/' },
      to: { path: '^src/', pathNot: '^src/domain/(kernel|contract|toolchain)/' },
    },
    {
      name: 'keel-core-never-enters-the-toolchain-context',
      comment:
        'the seam is two-sided: the composition engine never reaches into the provisioning context — they meet only at the toolchain block in domain/contract.',
      severity: 'error',
      from: { path: '^src/domain/core/' },
      to: { path: '^src/domain/toolchain/' },
    },
    {
      name: 'toolchain-contract-is-a-contract',
      comment: 'the context keeps its own trisection: its contract never imports its core.',
      severity: 'error',
      from: { path: '^src/domain/toolchain/contract/' },
      to: { path: '^src/domain/toolchain/core/' },
    },
    {
      name: 'infrastructure-adapters-stay-apart',
      comment: 'one infrastructure adapter never imports another.',
      severity: 'error',
      from: { path: '^src/infrastructure/([^/]+)/' },
      to: { path: '^src/infrastructure/', pathNot: '^src/infrastructure/$1/' },
    },
    {
      name: 'cli-contract-is-a-dumb-adapter',
      comment:
        'application/cli/contract maps transport to commands and Results back; it may not touch domain/core, domain/toolchain/core, or infrastructure — wiring is the executable’s job.',
      severity: 'error',
      from: { path: '^src/application/cli/contract/' },
      to: { path: '^src/(domain/(core|toolchain/core)|infrastructure)/' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
