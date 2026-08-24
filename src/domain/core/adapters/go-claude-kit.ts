/**
 * `walking-skeleton/go-claude-kit` adapter — the Claude kit for the
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

export const GO_CLAUDE_KIT_ID = 'walking-skeleton/go-claude-kit';

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

  const runbook = renderRunbook({
    title: `Go ${http && cli ? 'CLI + HTTP' : http ? 'HTTP' : 'CLI'}`,
    commands,
    notes: [
      modulith
        ? 'Modulith layout: contexts under `internal/modules/<context>/`; `cmd/` reaches a ' +
          'context only through its facade — the compiler enforces the `internal/` wall, and ' +
          'peers meet at the context’s `userside/service` seam.'
        : 'Flat layout: `internal/domain` (contract face over a compiler-hidden core), ' +
          '`internal/infra`, one deployment unit per `cmd/` directory.',
      `Binaries build to \`bin/\`: \`go build -o bin/${projectName}${http ? '-http' : ''} ./cmd/${http ? 'http' : 'cli'}\`.`,
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
