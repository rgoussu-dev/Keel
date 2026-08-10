/**
 * `walking-skeleton/rust-bootstrap` adapter — emits the shared shell
 * of the Rust walking skeleton: `Cargo.toml`, the README, the lib
 * crate root, and the domain's two faces per the house Rust hexagonal
 * reference — the contract face (`src/domain.rs`: the greet command,
 * the `Greeter` driving-port trait, and the exported factory) over
 * the compiler-hidden core (`src/domain/greet.rs`, declared as a
 * private module so nothing outside `domain` can name it), plus a
 * DIP-strict integration test in `tests/` that sees only the crate's
 * public face.
 *
 * Per the binding spec's Rust stance there is no mediator object:
 * commands are structs, driving ports are per-use-case traits wired
 * explicitly in each `src/bin/` main, and cross-cutting concerns are
 * decorators around the ports. Module privacy is the dependency wall
 * — a deployment unit physically cannot import the core.
 *
 * Entrypoints are NOT emitted here: `rust-cli-bootstrap` and
 * `rust-http-bootstrap` cover the `entrypoint` dimension and layer
 * their `src/bin/` deployment units on top — both may land in the
 * same project. This adapter covers `build-tool`: `Cargo.toml` is
 * the build configuration, and a deferred `cargo check` verifies the
 * package (and pins `Cargo.lock`) against the local toolchain once
 * the files are on disk.
 */

import type {
  Adapter,
  DeferredAction,
  DeferredActionEnv,
  ManifestV2,
} from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';

export const RUST_BOOTSTRAP_ID = 'walking-skeleton/rust-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/rust-bootstrap/templates';

const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

export const rustBootstrapAdapter: Adapter = {
  id: RUST_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['lang.rust'] },
  questions: [
    {
      id: 'projectName',
      prompt: 'Project name',
      doc: 'The Cargo package name, used in the README and as the binary name. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const projectName = validateProjectName(ctx.answer('projectName').trim());
    const crateName = toCrateName(projectName);
    const files = await ctx.templates.render(TEMPLATE_ID, '', { projectName, crateName });
    const action: DeferredAction = {
      id: RUST_BOOTSTRAP_ID,
      description: 'cargo check',
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runCargoCheck(cwd, logger, processes);
        return Promise.resolve();
      },
    };
    return { files, actions: [action] };
  },
};

/**
 * Reads the answer recorded by `rust-bootstrap` from the running
 * manifest snapshot, plus the lib crate name Cargo derives from it
 * (dashes become underscores). The downstream Rust adapters
 * (`rust-cli-bootstrap`, `rust-http-bootstrap`, `rust-port-fake`)
 * order themselves `after` the bootstrap and call this instead of
 * re-asking the user.
 */
export function rustBootstrapAnswers(
  manifest: ManifestV2,
  requesterId: string,
): { projectName: string; crateName: string } {
  const projectName = manifest.answers[RUST_BOOTSTRAP_ID]?.projectName;
  if (!projectName) {
    throw new Error(
      `${requesterId}: requires '${RUST_BOOTSTRAP_ID}' to have run first; projectName not in manifest`,
    );
  }
  return { projectName, crateName: toCrateName(projectName) };
}

function toCrateName(projectName: string): string {
  return projectName.replace(/-/g, '_');
}

function validateProjectName(s: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `rust-bootstrap: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}

function runCargoCheck(cwd: string, logger: Logger, processes: ProcessRunner): void {
  logger.info('rust: running cargo check');
  const r = processes.run('cargo', ['check'], { cwd });
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "rust-bootstrap: 'cargo' is not on PATH — install Rust (rustup), then run `cargo check` in the project yourself",
    );
  }
  if (r.status !== 0) {
    throw new Error(`rust-bootstrap: 'cargo check' failed: ${describeFailure(r)}`);
  }
  logger.success('rust: package verified with cargo check');
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'cargo did not run';
  return `exit ${r.status}`;
}
