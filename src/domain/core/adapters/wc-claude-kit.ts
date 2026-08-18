/**
 * `walking-skeleton/wc-claude-kit` adapter — the Claude kit for the
 * `web-components` SPA. Shares the TypeScript commit gate with
 * `ts-claude-kit` (same root scripts, same `--if-present` lint rule)
 * but keeps its own runbook and run skill: the SPA launches through
 * Vite and builds a static bundle, which is a different loop from a
 * Node service.
 */

import type { Adapter, Ctx } from '../../contract/composition.js';
import { anyProjectName } from '../util.js';
import { moduleLayoutOf } from './module-layout.js';
import { tsPm, tsVerifyCommand } from './ts-claude-kit.js';
import {
  claudeKitAdapter,
  renderRunbook,
  renderRunSkill,
  type ClaudeKitFamily,
  type RunbookCommand,
} from './claude-kit.js';

export const WC_CLAUDE_KIT_ID = 'walking-skeleton/wc-claude-kit';

function wcFamily(ctx: Ctx): ClaudeKitFamily {
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
    { label: 'Build', command: `${pm} run build` },
  ];

  const runbook = renderRunbook({
    title: `web-components SPA on Vite (${pm})`,
    commands,
    notes: [
      'The design system stays **external** to app bundles, deduplicated via the import map ' +
        'in `index.html` — inlining an element-defining package a second time throws ' +
        '`NotSupportedError` at runtime and silently kills that bundle’s registrations.',
      modulith
        ? 'Modulith layout: one workspace package per bounded context, publishing the facade, ' +
          '`./service` (the peer seam) and `./elements` (its `define…Elements()` registration). ' +
          'Element tags are `<scope>-<context>-<element>`; `tests/element-tags.test.ts` pins ' +
          'the prefix.'
        : 'Flat layout: DOM-less domain packages, ports over the Context protocol, the ' +
          'planks-based design system as its own package.',
    ],
  });

  const runSkill = renderRunSkill({
    description:
      'Launch this SPA in the Vite dev server and check it renders. Use when asked to run, start, or check the app.',
    body: `# Run ${projectName}

1. Start the Vite dev server (long-running — run it in the background):

   \`\`\`sh
   ${devRun}
   \`\`\`

2. Load the page it announces (default \`http://localhost:5173\`) —
   in a browser if one is available, otherwise \`curl\` the URL and
   check the shell HTML serves. Expect the walking-skeleton greeting
   flow to render; a blank name shows the domain error inline.

3. For a production check, build the static bundle:

   \`\`\`sh
   ${pm} run build
   \`\`\`

   The bundle lands in \`application/web-app/dist\`. Stop the dev
   server when done.`,
  });

  return { runbook, runSkill, verifyCommand };
}

export const wcClaudeKitAdapter: Adapter = claudeKitAdapter(
  WC_CLAUDE_KIT_ID,
  ['framework.web-components'],
  wcFamily,
);
