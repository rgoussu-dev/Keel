/**
 * Shared root-file patches for the TypeScript walking-skeleton
 * bootstraps — the `ts-http-bootstrap` / `ts-cli-bootstrap` analogue
 * of `jvm-shared-root.ts`, and like it, for both module layouts.
 *
 * The root `package.json` and `README.md` used to be whole-file
 * writes from each entrypoint's own template tree, so two entrypoints
 * (`arch.cli` + `arch.server-http` both present) conflicted on both —
 * even though the workspace globs (`application/*` under either
 * layout) already cover every entrypoint's package without change.
 * This module turns both into a shared seed + idempotent per-arch
 * `apply`, the same upsert pattern `jvm-shared-root.ts` uses.
 * `package.json` merges through a real JSON parse rather than text
 * splicing, since a script name is exactly the kind of thing text
 * surgery gets subtly wrong.
 *
 * The JVM needed a whole second module for its modulith
 * ({@link import('./jvm-shared-root-modulith.js')}) because the
 * layouts there disagree about the build files themselves — module
 * lists, archive naming, a reactor-root BOM import. Here they agree
 * about almost everything: the same manifest keys in the same order,
 * the same per-arch scripts, one extra glob in `workspaceGlobs`. What
 * the modulith adds is a `lint` script and the dependency-cruiser
 * devDependency behind it — the walls module resolution cannot hold —
 * and a README describing a bounded context instead of a layer
 * trisection. That is a branch, not a second module.
 */

import type {
  Contribution,
  ContributionFile,
  ContributionPatch,
} from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import type { TsWorkspaceShell } from './ts-bootstrap.js';
import type { TsLayoutPaths } from './ts-module-layout.js';
import type { TsPackageManager } from './ts-workspace.js';

/** Entrypoint shapes a TS bootstrap may contribute. */
export type TsRootArch = 'cli' | 'rest';

/** Inputs shared by every root-file patch of one bootstrap install. */
export interface TsRootInputs {
  readonly arch: TsRootArch;
  readonly pm: TsPackageManager;
  readonly projectName: string;
  /** The npm scope, without the leading `@` — the README names it. */
  readonly npmScope: string;
  readonly layout: TsLayoutPaths;
}

/** The dependency-cruiser release the modulith's `lint` script runs. */
const DEPENDENCY_CRUISER = '^18.1.1';

/**
 * Assembles one TS entrypoint bootstrap's contribution from its
 * shared shell and its own deployment-unit tree, under either module
 * layout.
 *
 * The shell's files — the domain packages (or, under the modulith,
 * `platform/kernel` plus the context), `.gitignore`,
 * `tsconfig.base.json`, `.dependency-cruiser.cjs`, and on pnpm
 * `pnpm-workspace.yaml` — are identical regardless of which
 * entrypoint(s) resolve, so they upsert via a seed+identity patch
 * instead of a whole-file write; the root `package.json` and
 * `README.md` upsert too, with an idempotent per-arch `apply` — see
 * {@link tsSharedRootPatches}.
 */
export function tsEntrypointContribution(inputs: {
  readonly arch: TsRootArch;
  readonly projectName: string;
  readonly shell: TsWorkspaceShell;
  readonly own: readonly ContributionFile[];
}): Contribution {
  return {
    files: [...inputs.own],
    patches: [
      ...toUpsertPatches(inputs.shell.files),
      ...tsSharedRootPatches({
        arch: inputs.arch,
        pm: inputs.shell.ws.pm,
        projectName: inputs.projectName,
        npmScope: inputs.shell.vars.npmScope as string,
        layout: inputs.shell.layout,
      }),
    ],
  };
}

/**
 * Converts whole-file contributions into upsert patches: the content
 * becomes both the seed (used when no entrypoint has written the
 * path yet) and, since the content is identical regardless of which
 * entrypoint runs, the target the `apply` leaves unchanged.
 */
function toUpsertPatches(files: readonly ContributionFile[]): readonly ContributionPatch[] {
  return files.map((f) => ({
    target: f.path,
    seed: contentToString(f.content),
    apply: (existing) => existing,
  }));
}

function contentToString(content: Buffer | string): string {
  return Buffer.isBuffer(content) ? content.toString('utf8') : content;
}

/** The root-file patches one TS entrypoint bootstrap contributes. */
export function tsSharedRootPatches(inputs: TsRootInputs): readonly ContributionPatch[] {
  return [
    {
      target: 'package.json',
      seed: packageJsonSeed(inputs),
      apply: (existing) => mergeScripts(existing, inputs.arch),
    },
    {
      target: 'README.md',
      seed: inputs.layout.layout === 'modulith' ? modulithReadmeSeed(inputs) : readmeSeed(inputs),
      apply: (existing) =>
        appendReadmeSection(
          existing,
          inputs.layout.layout === 'modulith'
            ? modulithReadmeSection(inputs)
            : readmeSection(inputs),
        ),
    },
  ];
}

/** Scripts every entrypoint shares verbatim, keyed by package manager. */
const SHARED_SCRIPTS: Readonly<Record<TsPackageManager, Record<string, string>>> = {
  pnpm: {
    test: 'pnpm -r --if-present run test',
    typecheck: 'pnpm -r --if-present run typecheck',
  },
  npm: {
    test: 'npm run test --workspaces --if-present',
    typecheck: 'npm run typecheck --workspaces --if-present',
  },
};

/** The `start:<arch>` (and, for `rest`, `dev:rest`) scripts one entrypoint adds. */
function ownScripts(arch: TsRootArch): Record<string, string> {
  return arch === 'cli'
    ? { 'start:cli': 'node application/cli/src/main.ts' }
    : {
        'start:rest': 'node application/rest/src/main.ts',
        'dev:rest': 'node --watch application/rest/src/main.ts',
      };
}

/**
 * The `lint` script the modulith carries and `basic` does not: the
 * two rules module resolution cannot see — a relative path that walks
 * into another package's tree, and an import crossing layers inside
 * one — live in the emitted `.dependency-cruiser.cjs`, and this is
 * what runs it. Its arguments are the workspace globs with the `/*`
 * dropped, so a layout that grows an area grows the sweep with it.
 */
function lintScript(layout: TsLayoutPaths): string {
  return `depcruise ${layout.workspaceGlobs.map((g) => g.replace(/\/\*$/, '')).join(' ')}`;
}

function packageJsonSeed(inputs: TsRootInputs): string {
  const modulith = inputs.layout.layout === 'modulith';
  const pkg: Record<string, unknown> = {
    name: inputs.projectName,
    private: true,
    version: '0.0.0',
    type: 'module',
    engines: { node: '>=22.18' },
  };
  if (inputs.pm === 'pnpm') {
    pkg.packageManager = 'pnpm@10.33.0';
  } else {
    pkg.workspaces = inputs.layout.workspaceGlobs;
  }
  pkg.scripts = modulith
    ? { lint: lintScript(inputs.layout), ...SHARED_SCRIPTS[inputs.pm] }
    : { ...SHARED_SCRIPTS[inputs.pm] };
  if (modulith) {
    pkg.devDependencies = { 'dependency-cruiser': DEPENDENCY_CRUISER };
  }
  return `${JSON.stringify(pkg, null, 2)}\n`;
}

/**
 * Merges one entrypoint's own scripts into the root `package.json`.
 * A real JSON round-trip rather than text splicing, since `existing`
 * may already carry the sibling entrypoint's scripts in any order.
 */
function mergeScripts(existing: string, arch: TsRootArch): string {
  const pkg = JSON.parse(existing) as { scripts?: Record<string, string> };
  const scripts = { ...(pkg.scripts ?? {}), ...ownScripts(arch) };
  const merged = { ...pkg, scripts };
  const eol = eolOf(existing);
  return withEol(`${JSON.stringify(merged, null, 2)}\n`, eol);
}

function readmeSeed(inputs: TsRootInputs): string {
  const { projectName, pm } = inputs;
  return `# ${projectName}

TypeScript walking skeleton scaffolded by keel — hexagonal,
mediator-driven, no build step: Node 22.18+ runs the TypeScript
sources directly (type stripping), \`tsc --noEmit\` holds the walls.

## Layout

\`\`\`
domain/
  kernel/      — Command, Result, Handler, Mediator bases; depends on
                 nothing (not even the Node type definitions)
  contract/    — the public surface: GreetCommand + the greet.rejected
                 error code (+ ports as they appear)
  core/        — createRegistryMediator + the GreetCommand handler,
                 factories only via the exports map
infrastructure/  — driven adapters (clock in \`clock\`; more as they
                 appear), real + fake side by side
\`\`\`

The wall that holds is each package's \`exports\` map: \`domain/core\`
publishes its factories and nothing else, so a deep import of a
handler is a \`TS2307\` from \`tsc\` and an
\`ERR_PACKAGE_PATH_NOT_EXPORTED\` from Node. The \`erasableSyntaxOnly\`
dial keeps every source file inside the syntax Node can strip.

## Test

\`\`\`sh
${pm} test
${pm} run typecheck
\`\`\`

## Deploy

There is nothing to bundle: ship the sources plus production
\`node_modules\` and run them with Node 22.18+. Add a bundler (or a
single-file executable) later only if distribution size starts to
matter.
`;
}

/** README section marker for one entrypoint, mirroring go-cli-bootstrap. */
function readmeMarker(arch: TsRootArch): string {
  return `\n### ${arch}\n`;
}

function appendReadmeSection(
  existing: string,
  section: { arch: TsRootArch; body: string },
): string {
  const marker = readmeMarker(section.arch);
  if (existing.includes(marker)) return existing;
  const eol = eolOf(existing);
  return `${existing.trimEnd()}${withEol(`\n${marker}${section.body}`, eol)}`;
}

function readmeSection(inputs: TsRootInputs): { arch: TsRootArch; body: string } {
  if (inputs.arch === 'cli') {
    return {
      arch: 'cli',
      body: `\`\`\`
application/
  cli/         — the deployment unit: flags → commands → Results →
                 streams + exit code; main.ts is the assembly point
\`\`\`

#### Run

\`\`\`sh
node application/cli/src/main.ts --name World
# or through the package manager (the -- passes the flags along):
${inputs.pm} run start:cli -- --name World
\`\`\`

A blank name is the domain saying no: the message lands on stderr and
the exit code is 2. Defects exit 1 — scripts can tell the two apart.
`,
    };
  }
  return {
    arch: 'rest',
    body: `\`\`\`
application/
  rest/        — the deployment unit: node:http server mapping the
                 query string to commands and Results to JSON or
                 RFC 9457 Problem Details; main.ts is the assembly
                 point
\`\`\`

#### Run

\`\`\`sh
${inputs.pm} run dev:rest      # node --watch on the assembly point
# then:
curl 'http://localhost:8080/greet?name=World'
\`\`\`

Ship with \`${inputs.pm} run start:rest\` (12-factor: the port comes
from \`PORT\`).
`,
  };
}

/**
 * The modulith README with no entrypoint yet: the platform package,
 * the context that owns a whole hexagon behind one `exports` map, and
 * the two rules that map cannot hold. Each entrypoint appends its own
 * deployment unit under a `### <arch>` marker.
 */
function modulithReadmeSeed(inputs: TsRootInputs): string {
  const { projectName, pm, npmScope } = inputs;
  return `# ${projectName}

TypeScript modulith walking skeleton scaffolded by keel — hexagonal,
mediator-driven, no build step: Node 22.18+ runs the TypeScript
sources directly (type stripping), \`tsc --noEmit\` holds the walls.

## Layout

\`\`\`
platform/
  kernel/      — @${npmScope}/platform-kernel: Command, Result, Handler,
                 Mediator, and createRegistryMediator. Owned by no
                 context; depends on nothing, not even the Node types
modules/
  greeting/    — @${npmScope}/greeting: ONE package per bounded context
    src/
      index.ts       — THE FACADE: the contract face + the factories
      service.ts     — THE PEER SEAM: what another context may call
      domain/
        contract/    — commands, ports, domain error codes
        core/
          internal/  — handlers; unreachable from outside the package
      infra/         — driven adapters (clock; more as they appear)
    tests/
application/   — one deployment unit per entrypoint, below
\`\`\`

One workspace package per context, not one per (context × layer).
That is a deliberate choice, and it is about walls rather than
tidiness: in a TypeScript workspace an **undeclared** dependency
resolves anyway (npm hoists every member to the root
\`node_modules\`), and TypeScript project references do not restrict
which projects a project may import. Splitting a context into four
packages therefore buys four manifests and enforces nothing.

What *is* enforced is the \`exports\` map. This package publishes
exactly two entry points:

| Specifier                       | Reaches                          |
| ------------------------------- | -------------------------------- |
| \`@${npmScope}/greeting\`         | the facade — contract + factories |
| \`@${npmScope}/greeting/service\` | the peer seam                    |

Anything deeper — \`@${npmScope}/greeting/src/domain/core/internal/…\` — is a
\`TS2307\` from \`tsc\` and an \`ERR_PACKAGE_PATH_NOT_EXPORTED\` from Node.
Widening that map is the single edit that undoes the layout, so treat
it as a design change rather than a convenience.

Two things module resolution cannot see: a **relative path** that
walks into another package's tree, and an import that crosses layers
inside one package. \`.dependency-cruiser.cjs\` holds both:

\`\`\`sh
${pm} run lint
\`\`\`

Its \`enhancedResolveOptions\` block is load-bearing. Without it
dependency-cruiser resolves every \`@${npmScope}/*\` import to a bare
specifier, follows nothing, and reports zero violations over a tree
that is in violation.

## Adding a second bounded context

Copy \`modules/greeting/\` to \`modules/<yours>/\`, give it its own
package name, and list it in the workspace. It reaches greeting only
through \`@${npmScope}/greeting/service\` — and when it should become its
own service, the seam is already the only thing to replace.

## Test

\`\`\`sh
${pm} test         # vitest per package: the domain + each adapter
${pm} run typecheck
${pm} run lint     # the walls resolution cannot hold
\`\`\`

## Deploy

There is nothing to bundle: ship the sources plus production
\`node_modules\` and run them with Node 22.18+. Add a bundler (or a
single-file executable) later only if distribution size starts to
matter.
`;
}

function modulithReadmeSection(inputs: TsRootInputs): { arch: TsRootArch; body: string } {
  if (inputs.arch === 'cli') {
    return {
      arch: 'cli',
      body: `\`\`\`
application/
  cli/         — the deployment unit: flags → commands → Results →
                 streams + exit code; main.ts is the assembly point
\`\`\`

#### Run

\`\`\`sh
node application/cli/src/main.ts --name World
# or through the package manager (the -- passes the flags along):
${inputs.pm} run start:cli -- --name World
\`\`\`

A blank name is the domain saying no: the message lands on stderr and
the exit code is 2. Defects exit 1 — scripts can tell the two apart.
`,
    };
  }
  return {
    arch: 'rest',
    body: `\`\`\`
application/
  rest/        — the deployment unit: node:http server mapping the
                 query string to commands and Results to JSON or
                 RFC 9457 Problem Details; main.ts is the assembly
                 point
\`\`\`

#### Run

\`\`\`sh
${inputs.pm} run dev:rest      # node --watch on the assembly point
# then:
curl 'http://localhost:8080/greet?name=World'
\`\`\`

Ship with \`${inputs.pm} run start:rest\` (12-factor: the port comes
from \`PORT\`).
`,
  };
}
