/**
 * End-to-end test for the `code-style` vertical on the JVM — the one
 * claim in the vertical that only a real build can settle.
 *
 * keel's templates are `.ejs` files full of placeholders, so no Java
 * formatter can be run over them and keel cannot mechanically keep
 * the *rendered* output format-clean. The vertical's answer is a
 * deferred `spotlessApply` at scaffold time, making the tree clean by
 * construction. Whether that actually works is not knowable from a
 * unit test: it depends on what prince-of-space does to keel's real
 * emitted Java.
 *
 * It is load-bearing rather than belt-and-braces, and that was
 * measured: with the deferred action disabled, `spotlessCheck` on a
 * fresh `quarkus-cli` scaffold fails on
 * `domain/kernel/…/Command.java`, which keel writes as
 * `public interface Command<R> {}` and prince-of-space wants split
 * across two lines. So this suite is the thing that fails if the
 * action is ever dropped, or if a template lands in a shape the
 * formatter would rewrite.
 *
 * The second case asserts the enforcement model itself: with a
 * violation present, `./gradlew build` must still pass
 * (`isEnforceCheck = false`) while `spotlessCheck` must fail. That
 * pair is the whole "hook fixes, CI gates" decision, and inverting
 * either half would break a freshly scaffolded project's first build.
 *
 * One `GRADLE_USER_HOME` for the file rather than per case: the
 * second case reuses almost everything the first resolved, and a
 * fresh home would hand it a cold Spotless download for nothing (the
 * `add-module` cache lesson in AGENTS.md §9).
 */

import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import fs from 'fs-extra';
import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  buildProject,
  compileFails,
  scaffold,
  skipJvmE2E,
  jvmTestEnv,
  type JvmProjectSpec,
} from '../support/jvm-e2e.js';

const SPEC: JvmProjectSpec = {
  stack: 'quarkus-cli',
  bootstrapId: 'walking-skeleton/quarkus-cli-bootstrap',
  buildSystem: 'gradle',
};

/** The kernel marker interface prince-of-space reflows; see the file docs. */
const KERNEL_COMMAND = path.join(
  'domain',
  'kernel',
  'src',
  'main',
  'java',
  'com',
  'acme',
  'e2e',
  'kernel',
  'Command.java',
);

let cwd: string;
let gradleUserHome: string;

beforeAll(async () => {
  gradleUserHome = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-style-home-'));
});

afterAll(async () => {
  await fs.remove(gradleUserHome);
});

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-e2e-style-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Runs one Gradle task, returning its exit status and output. */
function gradle(task: string): { status: number | null; output: string } {
  const r = spawnSync(path.join(cwd, 'gradlew'), ['--no-daemon', '--console=plain', task], {
    cwd,
    env: { ...jvmTestEnv(), GRADLE_USER_HOME: gradleUserHome },
    encoding: 'utf8',
  });
  return { status: r.status, output: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

describe.skipIf(skipJvmE2E)('code-style e2e (JVM)', () => {
  it(
    'scaffolds a project whose first `spotlessCheck` is already green',
    async () => {
      await scaffold(SPEC, cwd);

      // The editor contract, emitted for every stack.
      await expect(fs.pathExists(path.join(cwd, '.editorconfig'))).resolves.toBe(true);
      await expect(fs.pathExists(path.join(cwd, '.gitattributes'))).resolves.toBe(true);

      const editorconfig = await fs.readFile(path.join(cwd, '.editorconfig'), 'utf8');
      // Java and Kotlin must resolve to the width prince-of-space and
      // ktlint are configured with, not the `[*]` baseline's 2.
      expect(editorconfig).toContain('[{*.java,*.kt,*.kts}]');
      expect(editorconfig).toContain('indent_size = 4');

      // The build wiring, and the enforcement decision inside it.
      const build = await fs.readFile(path.join(cwd, 'build.gradle.kts'), 'utf8');
      expect(build).toContain('com.diffplug.spotless');
      expect(build).toContain('princeOfSpace');
      expect(build).toContain('isEnforceCheck = false');

      // The hook auto-fixes; CI checks.
      const hook = await fs.readFile(
        path.join(cwd, '.claude', 'hooks', 'pre-commit-format.sh'),
        'utf8',
      );
      expect(hook).toContain('./gradlew spotlessApply >/dev/null');

      // The claim: the scaffold is format-clean without the user
      // doing anything, so its first CI run is green.
      const check = gradle('spotlessCheck');
      expect(check.status, `spotlessCheck failed on a fresh scaffold:\n${check.output}`).toBe(0);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'lets `build` pass on a formatting violation while `spotlessCheck` fails',
    async () => {
      await scaffold(SPEC, cwd);

      const target = path.join(cwd, KERNEL_COMMAND);
      const original = await fs.readFile(target, 'utf8');
      await fs.writeFile(
        target,
        original.replace('public interface Command<R> {', '  public   interface   Command<R>  {'),
      );

      // `isEnforceCheck = false` — formatting never blocks the build.
      buildProject(SPEC, cwd, gradleUserHome, []);

      // …but CI's gate does catch it, and says how to fix it.
      const output = compileFails(SPEC, cwd, gradleUserHome, ['spotlessCheck']);
      expect(output).toContain('spotlessApply');
    },
    E2E_TIMEOUT_MS,
  );
});
