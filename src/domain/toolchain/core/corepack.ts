/**
 * The corepack provider record — pnpm and nothing else, the other
 * half of the `nvm+corepack` combination.
 *
 * corepack is Node's own package-manager shim: it ships with Node,
 * so it needs no bootstrap of its own beyond a Node install, and it
 * reads the version from the field the project already carries —
 * `packageManager` in `package.json`. That makes this the one record
 * whose "native file" is a file the *project* owns rather than one
 * the manager owns, so it merges the field in place instead of
 * rendering a file from scratch: the block stays the source of
 * truth (a pin bump reaches `package.json` on the next install)
 * without keel reformatting a file it did not write.
 *
 * Its status probe is the shim itself. Run without a TTY, corepack
 * refuses to download a version it has not cached rather than
 * fetching one, which is exactly the read-only answer
 * `keel toolchain check` needs: exit 0 means cached and satisfied,
 * non-zero means missing — and nothing was installed either way.
 */

import type { ProcessResult } from '../../contract/ports/process-runner.js';
import type { ToolchainNeed } from '../../contract/toolchain.js';
import type { SpelledNeed, ToolchainProvider } from './provider.js';

/** The project file corepack reads the package-manager pin from. */
const PACKAGE_JSON = 'package.json';

/** The `packageManager` field, wherever it sits in the file. */
const FIELD = /("packageManager"\s*:\s*")([^"]*)(")/;

function spell(need: ToolchainNeed): SpelledNeed {
  return { name: need.tool, version: need.version };
}

/** Adds the field to a `package.json` that has none, in place. */
function withField(existing: string, value: string): string {
  const brace = existing.indexOf('{');
  if (brace < 0) throw new Error(`${PACKAGE_JSON} is not a JSON object`);
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const rest = existing.slice(brace + 1);
  const comma = rest.trimStart().startsWith('}') ? '' : ',';
  return `${existing.slice(0, brace + 1)}${eol}  "packageManager": "${value}"${comma}${rest}`;
}

/** The corepack record. */
export const corepackProvider: ToolchainProvider = {
  id: 'corepack',
  label: "corepack — pnpm from package.json's packageManager field",
  covers: ['pnpm'],
  spell,
  render(needs, read) {
    const pnpm = needs.find((need) => need.tool === 'pnpm');
    if (pnpm === undefined) return [];
    const existing = read(PACKAGE_JSON);
    if (existing === undefined) {
      throw new Error(
        `corepack declares the package manager in ${PACKAGE_JSON}, and the project root has none`,
      );
    }
    const value = `pnpm@${pnpm.version}`;
    return [
      {
        path: PACKAGE_JSON,
        content: FIELD.test(existing)
          ? existing.replace(FIELD, `$1${value}$3`)
          : withField(existing, value),
      },
    ];
  },
  probe: { command: 'corepack', args: ['--version'] },
  // `enable` installs the shims, `install` caches the version the
  // rendered `packageManager` field names; both are idempotent.
  install: () => [
    { command: 'corepack', args: ['enable'] },
    { command: 'corepack', args: ['install'] },
  ],
  status: { command: 'pnpm', args: ['--version'] },
  parseStatus(result: ProcessResult, spelled) {
    const reported = result.status === 0 ? result.stdout.trim() : '';
    return new Map(spelled.map((need) => [need.name, reported === need.version]));
  },
  bootstrap:
    'corepack is not available.\n' +
    'It ships with Node — install Node first (nvm, mise, or nodejs.org),\n' +
    'or enable it explicitly with:  npm install --global corepack@latest',
};
