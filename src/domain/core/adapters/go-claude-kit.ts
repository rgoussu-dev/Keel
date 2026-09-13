/**
 * `agent-harness/go-claude-kit` adapter — the Claude kit for the
 * Go stacks. The entrypoint shapes are additive on Go (a tag set may
 * carry `arch.cli`, `arch.server-http`, or both on one bootstrap
 * shell), so the runbook and the run skill cover every shape the
 * manifest records.
 *
 * The pre-commit hook auto-formats with `gofmt -w .` — the one
 * formatter every Go toolchain ships — then runs the family's CI
 * gate (`go build ./... && go test ./...`).
 */

import type { Adapter, Ctx } from '../../contract/composition.js';
import { anyProjectName } from '../util.js';
import { moduleLayoutOf } from './module-layout.js';
import {
  claudeKitAdapter,
  renderRunbook,
  runSkillSpec,
  type ClaudeKitFamily,
  type RunbookCommand,
} from './claude-kit.js';

export const GO_CLAUDE_KIT_ID = 'agent-harness/go-claude-kit';

const PROBE = "curl 'http://localhost:8080/greet?name=World'";

function goFamily(ctx: Ctx): ClaudeKitFamily {
  const tags = ctx.manifest.tags;
  const projectName = anyProjectName(ctx.manifest);
  const cli = tags.includes('arch.cli');
  const http = tags.includes('arch.server-http');
  const modulith = moduleLayoutOf(tags) === 'modulith';

  const verifyCommand = 'go build ./... && go test ./...';
  const httpRun = 'PORT=8080 go run ./cmd/http';
  const cliRun = 'go run ./cmd/cli --name World';

  const commands: RunbookCommand[] = [
    { label: 'Build', command: 'go build ./...' },
    { label: 'Test', command: 'go test ./...' },
    { label: 'Format', command: 'gofmt -w .' },
    { label: 'Verify (commit gate)', command: verifyCommand },
    ...(http
      ? [
          { label: 'Run (http)', command: httpRun },
          { label: 'Probe', command: PROBE },
        ]
      : []),
    ...(cli ? [{ label: 'Run (cli)', command: cliRun }] : []),
  ];

  const stance =
    'No mediator object: commands are structs, driving ports are per-use-case interfaces, and ' +
    'each `cmd/<unit>/main.go` wires them by hand; cross-cutting concerns are decorator functions ' +
    'around the ports, applied at that assembly point.';

  const layout = modulith
    ? [
        '`internal/platform/` — what no context owns: the `clock` port with `clockfake`/`clocksys`, `observability`.',
        '`internal/modules/<ctx>/<ctx>.go` — the facade (factories only, no type aliases); `internal/modules/<ctx>/internal/domain/` — commands, ports, factories; its `internal/` — the compiler-hidden core.',
        '`internal/modules/<ctx>/userside/service/` — the peer seam (`package service`), the only package a sibling context imports; ' +
          [...(http ? ['`userside/resthttp/`'] : []), ...(cli ? ['`userside/cli/`'] : [])].join(
            ' and ',
          ) +
          ' — the driving adapters the assembly mounts.',
        '`internal/modules/<ctx>/infra/<peer>gateway/gateway.go` — implements `<ctx>`’s driven port over `<peer>`’s seam; other driven adapters sit beside it (`infra/postgres`).',
        '`cmd/<unit>/main.go` — the assembly of one deployment unit (' +
          [...(http ? ['`http`'] : []), ...(cli ? ['`cli`'] : [])].join(', ') +
          '); `cmd/<unit>/<ctx>.go` wires one context’s service and gateways into it.',
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
        'The `internal/` wall is the seam rule: a peer importing `internal/modules/<ctx>/internal/…` fails to build. Two contexts may share a package name — alias on import.',
      ]
    : [
        '`internal/domain/` — the contract face: commands, ports, factories; `internal/domain/internal/<aggregate>/` — the compiler-hidden core.',
        '`internal/app/<channel>/` — driving adapters (' +
          [...(http ? ['`resthttp`'] : []), ...(cli ? ['`cli`'] : [])].join(', ') +
          '): transport → command → port → transport, zero business logic.',
        '`internal/infra/<adapter>/` — driven adapters, the fake beside the real one (`clockfake`, `clocksys`, `postgres`).',
        '`cmd/<unit>/main.go` — the assembly; one directory per deployment unit (' +
          [...(http ? ['`http`'] : []), ...(cli ? ['`cli`'] : [])].join(', ') +
          ').',
        '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
      ];

  const runbook = renderRunbook({
    title: `Go ${http && cli ? 'CLI + HTTP' : http ? 'HTTP' : 'CLI'} (${modulith ? 'modulith' : 'basic'})`,
    commands,
    stance,
    layout,
    notes: [
      `Binaries build to \`bin/\`: ${[
        ...(http ? [`\`go build -o bin/${projectName}-http ./cmd/http\``] : []),
        ...(cli ? [`\`go build -o bin/${projectName} ./cmd/cli\``] : []),
      ].join(' and ')}.`,
    ],
  });

  const steps: string[] = [];
  if (http) {
    steps.push(
      `1. Start the server (long-running — run it in the background):

   \`\`\`sh
   ${httpRun}
   \`\`\`

2. Probe the walking skeleton:

   \`\`\`sh
   ${PROBE}
   \`\`\`

   Expect a JSON greeting for \`World\`; stop the server when done.`,
    );
  }
  if (cli) {
    steps.push(
      `${http ? '3' : '1'}. Run the CLI and read its output:

   \`\`\`sh
   ${cliRun}
   \`\`\`

   Expect the greeting for \`World\` on stdout.`,
    );
  }

  const runSkill = runSkillSpec({
    description:
      'Launch this Go app and check it end to end. Use when asked to run, start, or check the app.',
    body: `# Run ${projectName}\n\n${steps.join('\n\n')}`,
  });

  return { runbook, runSkill, formatCommand: 'gofmt -w .', verifyCommand };
}

export const goClaudeKitAdapter: Adapter = claudeKitAdapter(
  GO_CLAUDE_KIT_ID,
  ['lang.go'],
  goFamily,
);
