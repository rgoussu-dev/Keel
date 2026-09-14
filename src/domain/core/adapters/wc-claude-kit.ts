/**
 * `agent-harness/wc-claude-kit` adapter — the Claude kit for the
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
  runSkillSpec,
  type ClaudeKitFamily,
  type LayerDoc,
  type RunbookCommand,
} from './claude-kit.js';

export const WC_CLAUDE_KIT_ID = 'agent-harness/wc-claude-kit';

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

  const stance =
    'No mediator: per-use-case driving ports delivered by typed context keys (' +
    (modulith ? '`@<scope>/platform-context`' : '`src/context-keys.ts`') +
    '); cross-cutting via factory decoration at the assembly point — a central dispatcher would defeat ' +
    'tree-shaking and subtree scoping. ' +
    (modulith
      ? 'The design system stays **external** to app bundles, deduplicated by the import map in ' +
        '`index.html`: inlining an element-defining package twice throws `NotSupportedError` and ' +
        'silently kills that bundle’s registrations.'
      : 'The design system is bundled into the app once, imported from `main.ts` and nowhere else: ' +
        'an element-defining package inlined twice throws `NotSupportedError` and silently kills ' +
        'the second bundle’s registrations.');

  const layout = modulith
    ? [
        '`platform/context/` — `@<scope>/platform-context`: the typed context-key protocol.',
        '`design-system/` — `@<scope>/design-system`: planks-based atoms and molecules, `tokens.css`.',
        '`modules/<ctx>/` — package `@<scope>/<ctx>`: `src/domain/contract/` (use cases, ports), `src/domain/core/internal/` (services, stores), `src/context-keys.ts`, `src/user-side/elements/` (its custom elements), `src/elements.ts` + `src/element-tags.ts` (registers the `<scope>-<ctx>-*` tags; `tests/element-tags.test.ts` pins the prefix).',
        '`modules/<ctx>/src/service.ts` — the peer seam (`./service` export); `./elements` is the only other public entry.',
        '`modules/<ctx>/src/infra/<peer>-gateway/index.ts` — implements `<ctx>`’s driven port over `<peer>`’s `./service`; other driven adapters sit beside it (`src/infra/commons/`).',
        '`application/web-app/` — the SPA assembly: `src/main.ts` assembles, `src/<ctx>.ts` wires one context, `index.html` carries the import map, `dist/` the built bundle.',
      ]
    : [
        '`domain/domain-api/src/` — use cases and `ports/`; `domain/domain-core/src/internal/` — services and stores; both DOM-less.',
        '`infrastructure/commons/src/` — driven adapters, the fake beside the real one (`fake-clock.ts`, `system-clock.ts`).',
        '`design-system/src/` — atoms, molecules, `tokens.css`; its own package, bundled into the app by Vite.',
        '`application/web-app/src/` — `main.ts` assembles and imports the design system, `context-keys.ts` + `context.ts` deliver the ports, `components/` holds the app’s elements.',
      ];

  const runbook = renderRunbook({
    title: `web-components SPA on Vite (${pm}, ${modulith ? 'modulith' : 'basic'})`,
    commands,
    stance,
    layout,
    notes: [],
  });

  const runSkill = runSkillSpec({
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

  const duplicate =
    'An element-defining package inlined twice throws `NotSupportedError` and silently kills that bundle’s registrations — the page looks right and the elements never upgrade.';
  const docs: LayerDoc[] = modulith
    ? [
        {
          directory: 'platform',
          title: 'what no context owns',
          description: 'the context-key protocol every bounded context delivers its ports through',
          bullets: [
            '`context/` — `@<scope>/platform-context`: the typed context-key protocol. Nothing context-specific belongs here.',
          ],
        },
        {
          directory: 'modules',
          title: 'bounded contexts',
          description: 'one package per bounded context; peers meet only at its ./service export',
          bullets: [
            '`<ctx>/` is one package: `src/domain/contract/` (use cases, ports), `src/domain/core/internal/` (services, stores), `src/user-side/elements/`, `src/infra/`; the domain stays DOM-less.',
            '`src/service.ts` (`./service`) and `./elements` are the only public entries. dependency-cruiser holds the seam, and a violating import typechecks clean — `lint` is the only thing that goes red.',
            '`src/elements.ts` registers the `<scope>-<ctx>-*` tags; `tests/element-tags.test.ts` pins the prefix, so two contexts cannot define one tag.',
          ],
        },
        {
          directory: 'application',
          title: 'the SPA assembly',
          description: 'the web app: one wiring module per context, the import map',
          bullets: [
            '`web-app/src/main.ts` assembles; `web-app/src/<ctx>.ts` wires one context; `web-app/index.html` carries the import map that keeps the design system external to every bundle.',
            duplicate,
          ],
        },
      ]
    : [
        {
          directory: 'domain',
          title: 'use cases and ports',
          description: 'DOM-less packages: the use cases and ports, the services and stores',
          bullets: [
            '`domain-api/src/` — use cases and `ports/` (`Clock`); `domain-core/src/internal/` — services and stores. Both are DOM-less: nothing here imports an element or touches `document`.',
            'The ports reach the elements through the typed context keys in `application/web-app/src/context-keys.ts`, never through an import of an implementation.',
          ],
        },
        {
          directory: 'application',
          title: 'the SPA assembly',
          description:
            'the web app: context delivery, the app’s elements, the one design-system import',
          bullets: [
            '`web-app/src/main.ts` assembles and imports the design system; `context.ts` provides the ports; `components/` holds the app’s own elements.',
            `${duplicate} Import the design system from \`main.ts\` and nowhere else.`,
          ],
        },
        {
          directory: 'infrastructure',
          title: 'driven adapters',
          description: 'driven adapters, the fake beside the real one',
          bullets: [
            '`commons/src/` — `fake-clock.ts` beside `system-clock.ts`. A new adapter lands beside its fake, and one test runs against both — never a mocking library.',
          ],
        },
      ];

  return { runbook, runSkill, verifyCommand, docs };
}

export const wcClaudeKitAdapter: Adapter = claudeKitAdapter(
  WC_CLAUDE_KIT_ID,
  ['framework.web-components'],
  wcFamily,
);
