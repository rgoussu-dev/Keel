// @ts-check

/**
 * Mutation testing over the domain layer (roadmap #74).
 *
 * Scope is `src/domain` deliberately: the engine (predicate, resolver,
 * answers, apply, install) is where a surviving mutant means a real
 * hole in the composition logic's coverage. Widening to
 * `src/application` / `src/infrastructure` is follow-up work.
 *
 * The gate is report-only: `thresholds.break` stays `null` until the
 * baseline is known and has settled — a hard gate on an unknown
 * baseline blocks unrelated PRs. `high`/`low` only color the report.
 *
 * Incremental mode is on so local re-runs and the CI job (which caches
 * `reports/stryker-incremental.json`) only re-test mutants whose code
 * or covering tests changed; `pnpm mutation` on a warm cache is
 * minutes, cold it is the full run.
 *
 * @type {import('@stryker-mutator/api/core').PartialStrykerOptions}
 */
const config = {
  // Named explicitly because the default `@stryker-mutator/*` glob
  // resolves from the core package's own directory, which pnpm's
  // isolated store defeats — the runner is a sibling, not a child.
  plugins: ['@stryker-mutator/vitest-runner'],
  mutate: ['src/domain/**/*.ts'],
  testRunner: 'vitest',
  vitest: { configFile: 'vitest.stryker.config.ts' },
  coverageAnalysis: 'perTest',
  // Static mutants — code run at module load, so coverage cannot be
  // attributed per test — are 2274 of the 9085 mutants here (the
  // module-level adapter/vertical definition tables) and were
  // estimated at 71% of the run, each one re-running the whole
  // suite. Ignored: their guard is the unit assertions over emitted
  // trees plus the e2e grid, and keeping them triples the bill to
  // re-prove it. This is the one deliberate hole in the score.
  ignoreStatic: true,
  reporters: ['html', 'clear-text', 'progress'],
  thresholds: { high: 80, low: 60, break: null },
  incremental: true,
};

export default config;
