/**
 * `walking-skeleton/ts-port-fake` adapter — the Node sibling of
 * `sample-port-fake` and `wc-sample-port-fake`. Emits a sample
 * driven port (`Clock`) into the contract face plus the real adapter
 * (`systemClock`, wrapping `Date`) and its canonical fake
 * (`createFakeClock`) side by side, with a contract test for the
 * fake. Patches the contract barrel to re-export the new port.
 *
 * Under `basic` the adapters are their own `infrastructure/clock`
 * workspace package, with a manifest declaring a dependency on
 * `domain/contract`. Under the modulith they are a directory inside
 * the context's one package — no manifest, and the import that was a
 * package specifier becomes a relative path. Neither template spells
 * either: `tsLayout.specifierFrom` decides, because "are these two
 * files in the same package?" is the layout's question, not theirs.
 *
 * Reads `npmScope` from the bootstrap adapter's manifest answers —
 * the install orchestrator threads a running manifest snapshot
 * between adapters, so any answer the bootstrap recorded is visible
 * here without re-prompting the user.
 */

import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { tsBootstrapAnswers, TS_CLI_BOOTSTRAP_ID, TS_HTTP_BOOTSTRAP_ID } from './ts-bootstrap.js';
import { tsLayout } from './ts-module-layout.js';
import { tsWorkspaceVars } from './ts-workspace.js';

export const TS_PORT_FAKE_ID = 'walking-skeleton/ts-port-fake';

const TEMPLATE_ROOT = 'composition/walking-skeleton/ts-port-fake/templates';

const CLOCK_EXPORT = "export * from './clock.ts';";

export const tsPortFakeAdapter: Adapter = {
  id: TS_PORT_FAKE_ID,
  vertical: 'walking-skeleton',
  covers: ['port-example'],
  predicate: { requires: ['lang.typescript', 'runtime.node', 'arch.hexagonal'] },
  // Both entrypoint bootstraps listed because either may be the one
  // present; the answers this adapter reads live under whichever ran.
  after: [TS_HTTP_BOOTSTRAP_ID, TS_CLI_BOOTSTRAP_ID],
  async contribute(ctx) {
    const { npmScope } = tsBootstrapAnswers(ctx.manifest, TS_PORT_FAKE_ID);
    const layout = tsLayout(ctx.manifest.tags, npmScope);
    const ws = tsWorkspaceVars(ctx.manifest.tags);
    const adapterDir = layout.infraSrc('clock');
    const testDir = layout.infraTests('clock');
    const clockIndex = `${adapterDir}/index.ts`;
    const renders: (readonly [string, string, Readonly<Record<string, string>>])[] = [
      ['port', layout.contractSrc, {}],
      [
        'adapter',
        adapterDir,
        {
          contractSpec: layout.specifierFrom(adapterDir, layout.contractIndex),
        },
      ],
      [
        'test',
        testDir,
        {
          // The test reaches the port through whatever the layout
          // publishes the contract face as — its own package under
          // `basic`, nothing at all once it is a directory inside the
          // context, where a relative path is the only way in.
          contractSpec: layout.specifierFrom(testDir, layout.contractIndex),
          clockSpec: layout.specifierFrom(testDir, clockIndex),
        },
      ],
    ];
    if (layout.infraIsPackage) {
      renders.push([
        'manifest',
        layout.infraRoot('clock'),
        {
          clockPkg: layout.infraPkg('clock'),
          contractPkg: layout.contractPkg,
          clockExports: layout.exportsMap('domain'),
          workspaceDep: ws.workspaceDep,
        },
      ]);
    }
    const rendered = await Promise.all(
      renders.map(([tree, dest, vars]) =>
        ctx.templates.render(`${TEMPLATE_ROOT}/${tree}`, dest, vars),
      ),
    );
    return {
      files: rendered.flat(),
      patches: [
        {
          target: layout.contractIndex,
          apply: (existing) => {
            if (existing.includes(CLOCK_EXPORT)) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${withEol(`\n${CLOCK_EXPORT}\n`, eol)}`;
          },
        },
      ],
    };
  },
};
