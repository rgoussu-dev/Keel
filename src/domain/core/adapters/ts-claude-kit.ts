/**
 * `walking-skeleton/ts-claude-kit` adapter — the Claude kit for
 * `ts-http`. The package manager is read from the manifest tag set
 * (`pkg.npm` / `pkg.pnpm`), and the verify gate mirrors the
 * `ci/ts-pipeline` steps: `lint` runs `--if-present` because only
 * the modulith layout declares it (dependency-cruiser is the peer
 * wall there), `typecheck` and `test` run unconditionally.
 *
 * No format step: the scaffold ships no formatter.
 */

import type { Adapter, Ctx } from '../../contract/composition.js';
import { anyProjectName } from '../util.js';
import { moduleLayoutOf } from './module-layout.js';
import {
  claudeKitAdapter,
  renderRunbook,
  renderRunSkill,
  type ClaudeKitFamily,
  type RunbookCommand,
} from './claude-kit.js';

export const TS_CLAUDE_KIT_ID = 'walking-skeleton/ts-claude-kit';

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
  const modulith = moduleLayoutOf(tags) === 'modulith';
  const verifyCommand = tsVerifyCommand(pm);
  const devRun = `${pm} run dev`;

  const commands: RunbookCommand[] = [
    { label: 'Test', command: `${pm} test` },
    { label: 'Typecheck', command: `${pm} run typecheck` },
    ...(modulith ? [{ label: 'Lint', command: `${pm} run lint` }] : []),
    { label: 'Verify (commit gate)', command: verifyCommand },
    { label: 'Run (dev)', command: devRun },
    { label: 'Probe', command: PROBE },
  ];

  const runbook = renderRunbook({
    title: `TypeScript HTTP on node:http (${pm})`,
    commands,
    notes: [
      'No build step: Node runs the sources directly. That also means no parameter ' +
        'properties and no enums (`erasableSyntaxOnly`) — write `readonly` fields and ' +
        'union types instead.',
      modulith
        ? 'Modulith layout: one workspace package per bounded context (`@<scope>/<context>`), ' +
          'its `exports` map publishing only the facade and `./service` seam. The peer rule ' +
          '(`peers-meet-at-the-service-seam`) is held by dependency-cruiser — a violating ' +
          'import typechecks clean, so run the lint.'
        : 'Flat layout: workspace packages `domain/{kernel,contract,core}` and ' +
          '`application/rest` — the `exports` maps are the module walls.',
    ],
  });

  const runSkill = renderRunSkill({
    description:
      'Launch this service in dev mode and probe it end to end. Use when asked to run, start, or check the app.',
    body: `# Run ${projectName}

1. Start dev mode (long-running — run it in the background):

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
  });

  return { runbook, runSkill, verifyCommand };
}

export const tsClaudeKitAdapter: Adapter = claudeKitAdapter(
  TS_CLAUDE_KIT_ID,
  ['lang.typescript', 'runtime.node'],
  tsFamily,
);
