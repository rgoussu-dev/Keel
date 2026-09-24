import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * The vitest config Stryker runs mutants against.
 *
 * Same config as `pnpm test`, minus three suites — all excluded by
 * construction, not by environment:
 *
 *   - `tests/e2e/`. Those suites decide for themselves whether to
 *     run: they skip on CI and wherever the toolchain is missing, but
 *     on a developer box with a JDK on PATH they would happily
 *     scaffold and build a real project once per mutant. Mutation
 *     testing asserts the unit suite's strength.
 *   - `tests/version-pins.test.ts`. The pin guard is a **text sweep
 *     over the sources**, not a behavioral test, and Stryker runs the
 *     suite against an instrumented copy of the tree in its sandbox.
 *     Every mutable literal there is wrapped in a mutation switch —
 *     `version: '42.7.13'` reaches the sandbox as
 *     `version: stryMutAct_9fa48("4286") ? "" : (stryCov_9fa48("4286"), '42.7.13')`
 *     — so the registry patterns, which anchor on the surrounding
 *     syntax, stop matching and the guard reports dead locations
 *     against a file it was never meant to read in that form. Left
 *     in, it fails the initial dry run and aborts the whole mutation
 *     run before a single mutant is tested.
 *   - `tests/domain/core/composition-grid/`. Each axis sweeps the
 *     whole registry in a `beforeAll`, and the runner attributes what
 *     a hook covers to no test at all: the sweep's coverage is
 *     static, and the grid's own tests, which only compare recorded
 *     verdicts, cover nothing. No mutant is ever run against them, so
 *     the grid could kill none; and under `ignoreStatic` a mutant
 *     only the grid reaches would be scored Ignored rather than
 *     NoCoverage, hiding the very holes the score exists to show.
 *     Its verdicts are pinned by its own golden in `verify`.
 *
 * The second exclusion would be right even if the dry run survived
 * it. A text sweep sees the mutant *in the source* rather than in the
 * behavior: a mutant blanking a version literal in
 * `src/domain/core/adapters/` would fail the guard and be scored
 * killed, crediting the suite with coverage no assertion provides.
 * The guard's home is `verify`, where it runs against the real tree
 * on every push and PR.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: [
        'tests/e2e/**',
        'tests/version-pins.test.ts',
        'tests/domain/core/composition-grid/**',
      ],
    },
  }),
);
