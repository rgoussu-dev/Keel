/**
 * `agent-harness/ts-claude-kit` adapter — the Claude kit for the
 * TypeScript backend stacks (`ts-http` and `ts-cli`). The package
 * manager is read from the manifest tag set (`pkg.npm` / `pkg.pnpm`),
 * and the entrypoint shapes from the `arch.*` tags, exactly as the Go
 * kit reads them — the runbook and the run skill cover every shape
 * the manifest records. The verify gate mirrors the `ci/ts-pipeline`
 * steps: `lint` runs `--if-present` because only the modulith layout
 * declares it (dependency-cruiser is the peer wall there),
 * `typecheck` and `test` run unconditionally.
 *
 * No format step: the scaffold ships no formatter.
 */

import type { Adapter, Ctx } from '../../contract/composition.js';
import { anyProjectName } from '../util.js';
import { moduleLayoutOf } from './module-layout.js';
import {
  claudeKitAdapter,
  renderRunbook,
  runSkillSpec,
  type ClaudeKitFamily,
  type LayerDoc,
  type RunbookCommand,
} from './claude-kit.js';

export const TS_CLAUDE_KIT_ID = 'agent-harness/ts-claude-kit';

const PROBE = "curl 'http://localhost:8080/greet?name=World'";

/** The workspace package manager recorded on the manifest. */
export function tsPm(tags: readonly string[]): 'npm' | 'pnpm' {
  return tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
}

/** The TypeScript families' commit gate — `ci/ts-pipeline`'s steps. */
export function tsVerifyCommand(pm: 'npm' | 'pnpm'): string {
  return pm === 'pnpm'
    ? 'pnpm run --if-present lint && pnpm run typecheck && pnpm test'
    : 'npm run lint --if-present && npm run typecheck && npm test';
}

function tsFamily(ctx: Ctx): ClaudeKitFamily {
  const tags = ctx.manifest.tags;
  const pm = tsPm(tags);
  const projectName = anyProjectName(ctx.manifest);
  const cli = tags.includes('arch.cli');
  const http = tags.includes('arch.server-http');
  const modulith = moduleLayoutOf(tags) === 'modulith';
  const verifyCommand = tsVerifyCommand(pm);
  // `dev:rest`, not `dev`: the TypeScript root manifest names its
  // scripts per entrypoint so a workspace carrying both `arch.cli`
  // and `arch.server-http` has one script each rather than a collision.
  const devRun = `${pm} run dev:rest`;
  const cliRun = 'node application/cli/src/main.ts --name World';

  const commands: RunbookCommand[] = [
    { label: 'Test', command: `${pm} test` },
    { label: 'Typecheck', command: `${pm} run typecheck` },
    ...(modulith ? [{ label: 'Lint', command: `${pm} run lint` }] : []),
    { label: 'Verify (commit gate)', command: verifyCommand },
    ...(http
      ? [
          { label: 'Run (dev)', command: devRun },
          { label: 'Probe', command: PROBE },
        ]
      : []),
    ...(cli ? [{ label: 'Run (cli)', command: cliRun }] : []),
  ];

  const kernel = modulith ? '`@<scope>/platform-kernel` (`platform/kernel/`)' : '`domain/kernel/`';
  const stance =
    `Registry Mediator. ${kernel} holds the \`Command\`/\`Query\`/\`Handler\`/\`Mediator\` bases; ` +
    'handlers self-declare via `supports()` and the `RegistryMediator` is built from an array of ' +
    'handlers in the assembly — never an injected map, no reflection. No build step: Node runs the ' +
    'sources, so no parameter properties and no enums (`erasableSyntaxOnly`) — `readonly` fields and ' +
    'union types instead.';

  const units = [...(http ? ['`rest`'] : []), ...(cli ? ['`cli`'] : [])].join(', ');
  const transport = [
    ...(http ? ['`server.ts` + route files'] : []),
    ...(cli ? ['`cli.ts`'] : []),
  ].join(', ');
  const layout = modulith
    ? [
        '`platform/kernel/` — `@<scope>/platform-kernel`: `Command`, `Query`, `Handler`, `Mediator`, `RegistryMediator`.',
        '`modules/<ctx>/` — package `@<scope>/<ctx>`: `src/domain/contract/` — commands, results, errors, driven ports (`<Peer>Client`); `src/domain/core/internal/` — handlers; `src/index.ts` — the facade.',
        '`modules/<ctx>/src/service.ts` — the peer seam (`./service` export), the only entry a sibling context may import; dependency-cruiser holds the rule, a violating import typechecks clean.',
        '`modules/<ctx>/src/infra/<peer>-gateway/index.ts` — implements `<ctx>`’s `<Peer>Client` over `<peer>`’s `./service`; other driven adapters sit beside it (`src/infra/clock/`).',
        `\`application/<unit>/src/main.ts\` — the assembly (${units}); \`src/<ctx>.ts\` wires one context’s service and gateways into it; transport beside it (${transport}).`,
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
      ]
    : [
        '`domain/kernel/`, `domain/contract/`, `domain/core/` — workspace packages `@<scope>/domain-*`: contract holds commands, errors and ports; core holds `src/internal/` handlers and `registry-mediator.ts`.',
        `\`application/<unit>/src/main.ts\` — the composition root (${units}), transport beside it (${transport}).`,
        '`infrastructure/<port>/src/` — driven adapters, the fake beside the real one (`fake-clock.ts`, `system-clock.ts`, `pg-greeting-log.ts`).',
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
      ];

  const runbook = renderRunbook({
    title: `TypeScript ${http && cli ? 'CLI + HTTP' : http ? 'HTTP on node:http' : 'CLI on Node'} (${pm}, ${modulith ? 'modulith' : 'basic'})`,
    commands,
    stance,
    layout,
    notes: [],
  });

  const steps: string[] = [];
  if (http) {
    steps.push(
      `1. Start dev mode (long-running — run it in the background):

   \`\`\`sh
   ${devRun}
   \`\`\`

   \`node --watch\` on the assembly point; the port comes from \`PORT\`
   (default 8080).

2. Probe the walking skeleton:

   \`\`\`sh
   ${PROBE}
   \`\`\`

   Expect a JSON greeting for \`World\`; a blank \`name\` yields an
   RFC 9457 Problem Details response. Stop the dev process when done.`,
    );
  }
  if (cli) {
    steps.push(
      `${http ? '3' : '1'}. Run the CLI and read its output:

   \`\`\`sh
   ${cliRun}
   \`\`\`

   Expect \`Hello, World!\` on stdout and exit code 0; a blank
   \`--name\` puts the domain's message on stderr with exit code 2.`,
    );
  }

  const runSkill = runSkillSpec({
    description: http
      ? 'Launch this service in dev mode and probe it end to end. Use when asked to run, start, or check the app.'
      : 'Run this CLI and check its output end to end. Use when asked to run, start, or check the app.',
    body: `# Run ${projectName}\n\n${steps.join('\n\n')}`,
  });

  const hoisting = `Declare every workspace package a package imports in its own \`package.json\`: npm’s hoisting resolves an undeclared one anyway, and pnpm’s isolated store refuses the same tree. \`${verifyCommand}\` is the commit gate.`;
  const docs: LayerDoc[] = modulith
    ? [
        {
          directory: 'platform',
          title: 'what no context owns',
          description:
            'the kernel package every bounded context shares: commands, handlers, the mediator',
          bullets: [
            '`kernel/` — `@<scope>/platform-kernel`: `Command`, `Query`, `Handler`, `Mediator`, `RegistryMediator`. Nothing context-specific belongs here.',
          ],
        },
        {
          directory: 'modules',
          title: 'bounded contexts',
          description: 'one package per bounded context; peers meet only at its ./service export',
          bullets: [
            '`<ctx>/` is one package, `@<scope>/<ctx>`: `src/domain/contract/` — commands, errors, driven ports; `src/domain/core/internal/` — handlers; `src/infra/<x>/` — driven adapters with their fakes; `tests/` — its tests.',
            '`src/service.ts` (the `./service` export) is the only entry a sibling may import. dependency-cruiser holds that rule, and a violating import typechecks and runs clean — `lint` is the only thing that goes red.',
            '`src/infra/<peer>-gateway/index.ts` implements `<ctx>`’s `<Peer>Client` over `<peer>`’s `./service`.',
            'No enums and no parameter properties (`erasableSyntaxOnly`): Node runs these sources directly.',
          ],
        },
        {
          directory: 'application',
          title: 'assemblies',
          description: 'the deployment units: one wiring module per context',
          bullets: [
            '`<unit>/src/main.ts` builds the `RegistryMediator` from the handler array; `<unit>/src/<ctx>.ts` wires one context’s service and gateways. Transport maps to a command and back, with no business logic.',
            hoisting,
          ],
        },
      ]
    : [
        {
          directory: 'domain',
          title: 'kernel, contract, core',
          description:
            'workspace packages: the mediator bases, the commands and ports, the handlers',
          bullets: [
            '`kernel/` — `Command`, `Query`, `Handler`, `Mediator`; `contract/` — commands, errors, ports (`Clock`); `core/` — `src/internal/` handlers and `registry-mediator.ts`. Each is a workspace package with its own `tests/`.',
            'A new use case is a command in `contract/` and a handler in `core/src/internal/` that self-declares via `supports()`, added to the handler array the assembly builds the mediator from — never an injected map.',
            'No enums and no parameter properties (`erasableSyntaxOnly`): Node runs these sources directly, so `readonly` fields and union types.',
          ],
        },
        {
          directory: 'application',
          title: 'composition roots',
          description: 'the deployment units: transport → command → mediator → transport',
          bullets: [
            '`<unit>/src/main.ts` builds the `RegistryMediator` from the handler array; transport sits beside it and maps to a command and back, with no business logic.',
            hoisting,
          ],
        },
        {
          directory: 'infrastructure',
          title: 'driven adapters',
          description: 'driven adapters, the fake beside the real one',
          bullets: [
            '`<port>/src/` — `fake-clock.ts` beside `system-clock.ts`; `pg-greeting-log.ts` arrives with `keel add persistence`.',
            'A new port: the interface in `domain/contract/`, a package here with the fake beside the real adapter, and one test run against both — never a mocking library.',
          ],
        },
      ];

  return { runbook, runSkill, verifyCommand, docs };
}

export const tsClaudeKitAdapter: Adapter = claudeKitAdapter(
  TS_CLAUDE_KIT_ID,
  ['lang.typescript', 'runtime.node'],
  tsFamily,
);
