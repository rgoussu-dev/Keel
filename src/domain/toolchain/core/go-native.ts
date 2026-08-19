/**
 * The Go ecosystem's native no-op — the dial's "no manager needed"
 * answer, and the one record that installs nothing at all.
 *
 * Since Go 1.21 the `toolchain` directive in `go.mod` makes any
 * installed Go auto-provision the toolchain the module asks for: the
 * go command downloads and runs it on the next build, with no
 * manager, no shell hook and no second declaration. Forcing mise or
 * asdf onto a Go project would be keel routing around a problem the
 * ecosystem already solved, so the dial offers this instead —
 * alongside the general-purpose managers, never in place of them.
 *
 * Its "native file" is therefore `go.mod`, a file the **project**
 * owns — the corepack situation, and handled the same way: the
 * record merges the `toolchain` directive in place rather than
 * rendering a file from scratch, so the block stays the source of
 * truth (a pin bump reaches `go.mod` on the next install) without
 * keel reformatting a file it did not write. That merge is also the
 * consistency check the choice exists to provide: `keel toolchain
 * check` reports `go.mod` as out of date the moment its directive
 * and the recorded need disagree, and `keel toolchain install`
 * writes the directive back.
 *
 * The block pins a Go *minor* (`1.24`) where a toolchain name wants
 * a release (`go1.24.0`). That is not a downgrade: the directive is
 * a **floor**, not a pin — the go command uses the local toolchain
 * whenever it is at least as new, and fetches the named one only
 * when it is not.
 */

import type { ProcessResult } from '../../contract/ports/process-runner.js';
import type { ToolchainNeed } from '../../contract/toolchain.js';
import type { SpelledNeed, ToolchainProvider } from './provider.js';

/** The file the directive lives in — the project's own. */
const GO_MOD = 'go.mod';

// Both directives stop *before* any line terminator — the lookahead
// rather than `$` — so a CRLF `go.mod` keeps its `\r` when the
// toolchain line is inserted after the anchor or replaced in place.
/** The `go` directive, whose line the `toolchain` one follows. */
const GO_DIRECTIVE = /^go[ \t]+(\S+)[ \t]*(?=\r?$)/m;

/** The `toolchain` directive, wherever it sits in the file. */
const TOOLCHAIN_DIRECTIVE = /^(toolchain[ \t]+)(\S+)[ \t]*(?=\r?$)/m;

function spell(need: ToolchainNeed): SpelledNeed {
  // A toolchain name is a release: `1.24` names the 1.24 release,
  // which is spelled `go1.24.0`.
  const release = /^\d+\.\d+$/.test(need.version) ? `${need.version}.0` : need.version;
  return { name: 'go', version: `go${release}` };
}

/** The `goX.Y.Z` name as a comparable tuple; empty when unparsable. */
function parts(name: string): readonly number[] {
  const match = /^go(\d+)\.(\d+)(?:\.(\d+))?/.exec(name);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] ?? '0')] : [];
}

/**
 * Whether the reported toolchain is at least the required one — the
 * go command's own floor semantics, which is what makes a newer local
 * Go satisfy an older directive.
 */
function atLeast(reported: string, required: string): boolean {
  const [got, want] = [parts(reported), parts(required)];
  if (got.length === 0 || want.length === 0) return false;
  for (let index = 0; index < want.length; index += 1) {
    const left = got[index] ?? 0;
    const right = want[index] ?? 0;
    if (left !== right) return left > right;
  }
  return true;
}

/** The Go native-directive record. */
export const goNativeProvider: ToolchainProvider = {
  id: 'go-native',
  label: "go-native — no manager: go.mod's toolchain directive provisions Go itself",
  covers: ['go'],
  spell,
  render(needs, read) {
    const go = needs.find((need) => need.tool === 'go');
    if (go === undefined) return [];
    const existing = read(GO_MOD);
    if (existing === undefined) {
      throw new Error(`the toolchain directive lives in ${GO_MOD}, and the project root has none`);
    }
    const value = spell(go).version;
    if (TOOLCHAIN_DIRECTIVE.test(existing)) {
      return [{ path: GO_MOD, content: existing.replace(TOOLCHAIN_DIRECTIVE, `$1${value}`) }];
    }
    const anchor = GO_DIRECTIVE.exec(existing);
    if (anchor === null) {
      throw new Error(`${GO_MOD} declares no 'go' directive to anchor the toolchain one to`);
    }
    const at = anchor.index + anchor[0].length;
    const eol = existing.includes('\r\n') ? '\r\n' : '\n';
    return [
      {
        path: GO_MOD,
        content: `${existing.slice(0, at)}${eol}toolchain ${value}${existing.slice(at)}`,
      },
    ];
  },
  probe: { command: 'go', args: ['version'] },
  // Nothing to run: the directive *is* the provisioning, and the go
  // command acts on it at the next build. An empty sequence is a
  // legal record — the "no manager needed" answer, honestly spelled.
  install: () => [],
  // `GOTOOLCHAIN` says whether the go command may switch toolchains
  // at all; `GOVERSION` says which one is here now. Neither reads the
  // network and neither installs.
  status: { command: 'go', args: ['env', 'GOTOOLCHAIN', 'GOVERSION'] },
  parseStatus(result: ProcessResult, spelled) {
    if (result.status !== 0) {
      const detail = (result.stderr || result.stdout).trim();
      throw new Error(`go env exited ${String(result.status)}${detail ? `: ${detail}` : ''}`);
    }
    const [selector = '', reported = ''] = result.stdout.split('\n').map((line) => line.trim());
    // An empty selector means a go too old to know the variable, and
    // `local` means an operator who turned switching off; either way
    // the local toolchain is all there will ever be, so it has to
    // answer the need on its own. Otherwise the go command will fetch
    // whatever the directive names.
    const switches = selector.length > 0 && selector !== 'local';
    return new Map(spelled.map((need) => [need.name, switches || atLeast(reported, need.version)]));
  },
  bootstrap:
    'Go is not installed.\n' +
    'Install any Go toolchain from https://go.dev/dl/ (or your package manager) —\n' +
    "from Go 1.21 on, go.mod's toolchain directive provisions the pinned one itself.",
};
