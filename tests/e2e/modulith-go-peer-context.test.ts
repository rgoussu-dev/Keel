/**
 * End-to-end test for the Go peer context —
 * `--module-layout=modulith --with-peer-context`.
 *
 * Not a grid cell: it is the suite that proves the peer-context
 * adapter family is additive on Go and, more to the point, that the
 * seam is **exercised** rather than merely present. With one context
 * the modulith's claim that contexts meet only at `userside/service`
 * is asserted by nothing; `guestbook` is the consumer that asserts
 * it.
 *
 * What it checks that a file-existence test would miss:
 *
 *   - the gateway's import block names the **seam** and not the
 *     peer's domain — read as imports, not as a substring, because
 *     the file's own doc comment names what it must not import;
 *   - the wiring is part of the assembly's package, which in Go is
 *     what "declared in the assembly" means: a file in a `cmd/`
 *     directory joins that package by existing, so there is no `mod`
 *     line to forget and the equivalent mistake is landing it
 *     somewhere else;
 *   - the cross-context call really runs, by running it;
 *   - **and the forbidden import does not compile.** That last one is
 *     the assertion that actually proves a wall. Go's is stronger
 *     than Rust's here: a domain type cannot flow across this seam
 *     because the package cannot be reached at all.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  E2E_TIMEOUT_MS,
  goRun,
  goRunFails,
  mkTempDir,
  scaffold,
  skipGoE2E,
} from '../support/go-e2e.js';

let goHome: string;
let cwd: string;

beforeAll(async () => {
  goHome = await mkTempDir('keel-e2e-go-peer-home-');
});

afterAll(async () => {
  await fs.remove(goHome);
});

beforeEach(async () => {
  cwd = await mkTempDir('keel-e2e-go-peer-');
});

afterEach(async () => {
  await fs.remove(cwd);
});

const read = (...rel: readonly string[]): Promise<string> =>
  fs.readFile(path.join(cwd, ...rel), 'utf8');

/**
 * The project-import specifiers of a Go file, comments stripped.
 *
 * Stripping first is not tidiness. The gateway's doc comment explains
 * which import it must *not* write, so a substring check matches the
 * prose that documents the rule and fails a file that obeys it.
 */
function projectImports(source: string): readonly string[] {
  const code = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const block = /import \(\n([\s\S]*?)\n\)/.exec(code)?.[1] ?? '';
  return block
    .split('\n')
    .map((line) => /"(example\.com\/[^"]+)"/.exec(line)?.[1])
    .filter((spec): spec is string => spec !== undefined)
    .sort();
}

describe.skipIf(skipGoE2E)('go peer-context e2e', () => {
  it(
    'scaffolds a second context that reaches the first only through its seam',
    async () => {
      await scaffold(
        { stack: 'go-cli', projectName: 'skel', moduleLayout: 'modulith', withPeerContext: true },
        cwd,
      );

      // The edge that defines the seam: the gateway imports
      // greeting's seam package and nothing else of greeting's.
      const gateway = await read('internal/modules/guestbook/infra/greetinggateway/gateway.go');
      expect(projectImports(gateway)).toEqual([
        'example.com/skel/internal/modules/greeting/userside/service',
        'example.com/skel/internal/modules/guestbook/internal/domain',
      ]);

      // Emitted is not the same as bound. Go binds by directory, so
      // what there is to check is that the wiring landed in the
      // assembly and claims its package.
      const wiring = await read('cmd/cli/guestbook.go');
      expect(wiring).toContain('package main');
      expect(wiring).toContain('func wireGuestbook() signing.Signer');

      // Everything compiles, vets and every test passes — including
      // the wiring test, which drives guestbook across the seam with
      // no fakes anywhere.
      goRun(cwd, goHome, ['vet', './...']);
      goRun(cwd, goHome, ['test', './...']);
      goRun(cwd, goHome, ['build', './...']);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    'holds the seam wall: the gateway cannot reach the peer’s domain',
    async () => {
      await scaffold(
        { stack: 'go-cli', projectName: 'skel', moduleLayout: 'modulith', withPeerContext: true },
        cwd,
      );

      const gateway = path.join(
        cwd,
        'internal/modules/guestbook/infra/greetinggateway/gateway.go'.replace(/\//g, path.sep),
      );
      const original = await fs.readFile(gateway, 'utf8');
      await fs.writeFile(
        gateway,
        original.replace(
          'import (',
          'import (\n\t"example.com/skel/internal/modules/greeting/internal/domain"',
        ),
      );

      // Go's `internal/` rule, doing the whole job: greeting's domain
      // is unreachable from another context, full stop. This is also
      // the regression guard for the *placement* — move the domain
      // out from behind `internal/` and this import would start
      // compiling.
      expect(goRunFails(cwd, goHome, ['build', './internal/modules/guestbook/...'])).toContain(
        'use of internal package',
      );
    },
    E2E_TIMEOUT_MS,
  );
});
