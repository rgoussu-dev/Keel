/**
 * `walking-skeleton/go-bootstrap` adapter — emits the shared shell of
 * the Go walking skeleton: `go.mod`, the README, and the domain's two
 * faces per the house Go hexagonal reference — the contract face
 * (`internal/domain`: the greet command, the `Greeter` driving port,
 * and the exported factory) over the compiler-hidden core
 * (`internal/domain/internal/greet`), plus a DIP-strict domain test
 * that goes through factory + port only.
 *
 * Per the binding spec's Go stance there is no mediator object:
 * commands are structs, driving ports are per-use-case interfaces
 * wired explicitly in each `cmd/` main, and cross-cutting concerns
 * are decorator functions around the ports. Nested `internal/` is
 * the dependency wall — a `main.go` physically cannot import the
 * core.
 *
 * Entrypoints are NOT emitted here: `go-cli-bootstrap` and
 * `go-http-bootstrap` cover the `entrypoint` dimension and layer
 * their `cmd/` deployment units on top — both may land in the same
 * project. This adapter covers `build-tool`: `go.mod` is the build
 * configuration, and a deferred `go mod tidy` verifies the module
 * against the local toolchain once the files are on disk.
 */

import type {
  Adapter,
  DeferredAction,
  DeferredActionEnv,
  ManifestV2,
} from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessResult, ProcessRunner } from '../../contract/ports/process-runner.js';

export const GO_BOOTSTRAP_ID = 'walking-skeleton/go-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/go-bootstrap/templates';

const MODULE_PATH_RE = /^[a-z0-9][a-z0-9.-]*(\/[A-Za-z0-9._~-]+)*$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

export const goBootstrapAdapter: Adapter = {
  id: GO_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['build-tool'],
  predicate: { requires: ['lang.go'] },
  questions: [
    {
      id: 'modulePath',
      prompt: 'Go module path',
      doc: 'The module directive in go.mod and the import-path root, e.g. github.com/acme/shipper.',
      default: 'example.com/walking-skeleton',
      memory: 'sticky',
    },
    {
      id: 'projectName',
      prompt: 'Project name',
      doc: 'Used in the README and as the binary name. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const modulePath = validateModulePath(ctx.answer('modulePath').trim());
    const projectName = validateProjectName(ctx.answer('projectName').trim());
    const files = await ctx.templates.render(TEMPLATE_ID, '', { modulePath, projectName });
    const action: DeferredAction = {
      id: GO_BOOTSTRAP_ID,
      description: 'go mod tidy',
      run: ({ cwd, logger, processes }: DeferredActionEnv) => {
        runModTidy(cwd, logger, processes);
        return Promise.resolve();
      },
    };
    return { files, actions: [action] };
  },
};

/**
 * Reads the answers recorded by `go-bootstrap` from the running
 * manifest snapshot. The downstream Go adapters (`go-cli-bootstrap`,
 * `go-http-bootstrap`, `go-port-fake`) order themselves `after` the
 * bootstrap and call this instead of re-asking the user.
 */
export function goBootstrapAnswers(
  manifest: ManifestV2,
  requesterId: string,
): { modulePath: string; projectName: string } {
  const answers = manifest.answers[GO_BOOTSTRAP_ID];
  const modulePath = answers?.modulePath;
  const projectName = answers?.projectName;
  if (!modulePath || !projectName) {
    throw new Error(
      `${requesterId}: requires '${GO_BOOTSTRAP_ID}' to have run first; modulePath/projectName not in manifest`,
    );
  }
  return { modulePath, projectName };
}

function validateModulePath(s: string): string {
  if (!MODULE_PATH_RE.test(s)) {
    throw new Error(
      `go-bootstrap: invalid modulePath '${s}' — must be a slash-separated module path (e.g. github.com/acme/shipper)`,
    );
  }
  return s;
}

function validateProjectName(s: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `go-bootstrap: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}

function runModTidy(cwd: string, logger: Logger, processes: ProcessRunner): void {
  logger.info('go: running go mod tidy');
  const r = processes.run('go', ['mod', 'tidy'], { cwd });
  if (r.startFailure?.code === 'ENOENT') {
    throw new Error(
      "go-bootstrap: 'go' is not on PATH — install Go, then run `go mod tidy` in the project yourself",
    );
  }
  if (r.status !== 0) {
    throw new Error(`go-bootstrap: 'go mod tidy' failed: ${describeFailure(r)}`);
  }
  logger.success('go: module verified with go mod tidy');
}

function describeFailure(r: ProcessResult): string {
  if (r.startFailure) return r.startFailure.message;
  const parts = [r.stderr.trim(), r.stdout.trim()].filter((s) => s.length > 0);
  if (parts.length > 0) return parts.join('\n');
  if (r.status === null) return 'go did not run';
  return `exit ${r.status}`;
}
