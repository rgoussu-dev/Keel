import { defineConfig, mergeConfig } from 'vitest/config';
import base from './vitest.config';

/**
 * The vitest config Stryker runs mutants against.
 *
 * Same config as `pnpm test` with one exclusion: `tests/e2e/`. Those
 * suites decide for themselves whether to run — they skip on CI and
 * wherever the toolchain is missing, but on a developer box with a JDK
 * on PATH they would happily scaffold and build a real project once
 * per mutant. Mutation testing asserts the unit suite's strength;
 * the e2e suites are excluded by construction, not by environment.
 */
export default mergeConfig(
  base,
  defineConfig({
    test: {
      exclude: ['tests/e2e/**'],
    },
  }),
);
