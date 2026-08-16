import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: false,
    reporters: 'default',

    /**
     * Vitest's 5s default is a wall-clock budget none of these tests
     * meant to assert, and the domain suite is full of tests that
     * scaffold a whole project through the real mediator — hundreds of
     * files written to a temp directory, plus a real `git init`.
     * Uncontended those run in well under a second; on a runner
     * executing ~124 files across four cores they do not, and
     * `new-project.test.ts` timed out at 5s on `verify (node 22)`
     * while `verify (node 24)` passed the same commit. A test that
     * goes red because the box was busy reports a defect that is not
     * there and hides the schedule that is.
     *
     * 30s is far above anything measured and far below a hang, so it
     * still fails a test that has genuinely stopped. The e2e suites
     * are unaffected either way: every one of them passes its own
     * explicit timeout at the `it`, since a JVM build needs minutes.
     *
     * `hookTimeout` moves with it for the same reason — these suites
     * create and recursively remove those trees in `beforeEach` /
     * `afterEach`, which is the same I/O under the same contention.
     */
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
