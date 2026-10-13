/**
 * Real presets and a grown modulith exercise harness opt-out, later
 * adoption, the root map a registry's own `bounded-context` never
 * enters, and the one `keel add module` re-indexes without its
 * transient context marker.
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  docsSyncCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import type {
  Adapter,
  Contribution,
  Vertical,
} from '../../../../src/domain/contract/composition.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { Registry } from '../../../../src/domain/contract/ports/registry.js';
import { docsCheckQuery } from '../../../../src/domain/contract/queries.js';
import { markdownRegion, regionPatch } from '../../../../src/domain/contract/region.js';
import {
  ADD_MODULE_INPUT_ID,
  addedContext,
  CONTEXT_TAG,
} from '../../../../src/domain/core/adapters/added-context.js';
import { shippedRegistry } from '../../../../src/domain/core/registry.js';
import { boundedContextVertical } from '../../../../src/domain/core/verticals/bounded-context.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { expectOk, installMediator } from '../../../support/factory.js';

const families = ['quarkus-rest', 'go-http', 'rust-http', 'ts-http', 'web-components'];
const moduleNames = ['greeting', 'ordering', 'billing', 'shipping'];
const teamNotes = 'docs/team-notes.md';
const prose = '# Team notes\n\nOur ordering rules are reviewed by the warehouse team.\n';
let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-grown-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});

async function filesUnder(directory: string, relative = ''): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await fs.readdir(path.join(directory, relative), { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(directory, child)));
    else files.push(child);
  }
  return files.sort();
}

function isHarness(file: string): boolean {
  return (
    /(^|\/)(AGENTS|CLAUDE)\.md$/.test(file) ||
    file.startsWith('.claude/') ||
    file.startsWith('.gemini/') ||
    file === '.aider.conf.yml'
  );
}

async function domainSnapshot(): Promise<Record<string, string>> {
  const snapshot: Record<string, string> = {};
  for (const file of await filesUnder(cwd)) {
    if (!isHarness(file) && file !== teamNotes)
      snapshot[file] = await fs.readFile(path.join(cwd, file), 'utf8');
  }
  return snapshot;
}

async function assertHarnessAbsent(): Promise<void> {
  const files = await filesUnder(cwd);
  expect(files.filter((file) => isHarness(file) && !/^\.claude\/\.keel-[^/]+$/.test(file))).toEqual(
    [],
  );
  const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
  expect(manifest).not.toBeNull();
  expect(manifest?.verticals.map((vertical) => vertical.id)).not.toContain('agent-harness');
  expect(manifest?.tags).not.toContain('agentic.harness');
  expect(manifest?.tags).not.toContain('agentic.claude-kit');
}

function retrofitRegistry(): Registry {
  const persistence = shippedRegistry.vertical('persistence')!;
  const persistenceWithSkill: Vertical = {
    ...persistence,
    skills: [...(persistence.skills ?? []), 'inspect-persistence'],
    adapters: persistence.adapters.map((adapter) =>
      adapter.id !== 'persistence/database-compose'
        ? adapter
        : {
            ...adapter,
            contribute: async (ctx): Promise<Contribution> => ({
              ...(await adapter.contribute(ctx)),
              skills: [
                {
                  name: 'inspect-persistence',
                  description: 'Inspect the recorded database choice.',
                  body: `Engine: ${ctx.answer('engine')}. Migrations: ${ctx.answer('migrations')}. Project: ${ctx.manifest.answers['walking-skeleton/quarkus-rest-bootstrap']?.projectName}.`,
                },
              ],
            }),
          },
    ),
  };
  // A `bounded-context` of the registry's own, under keel's id, with
  // harness elements on each context's shell alone: a skill is one
  // adapter's whole file, and a context's wiring adapters — one per
  // entrypoint the project has — write its assembly wiring beside it.
  // `keel add module` runs keel's own, and so does every replay of the
  // contexts it added, so none of these elements is ever written.
  const wiring = (adapter: Adapter): boolean =>
    (adapter.predicate.requires ?? []).some((tag) => tag.startsWith('arch.'));
  const contextsWithSkills: Vertical = {
    ...boundedContextVertical,
    skills: moduleNames.map((name) => `inspect-${name}`),
    adapters: boundedContextVertical.adapters.map((adapter) =>
      wiring(adapter)
        ? adapter
        : {
            ...adapter,
            contribute: async (ctx): Promise<Contribution> => {
              const contribution = await adapter.contribute(ctx);
              const { name, consumes } = addedContext(ctx.manifest, adapter.id);
              return {
                ...contribution,
                skills: [
                  {
                    name: `inspect-${name}`,
                    description: `Inspect the ${name} context.`,
                    body: `Read modules/${name}/domain/core. Package: ${ctx.manifest.answers['walking-skeleton/quarkus-rest-bootstrap']?.basePackage}. Consumes: ${consumes ?? 'none'}.`,
                  },
                ],
                harnessPatches: [
                  regionPatch({
                    target: teamNotes,
                    region: markdownRegion(`module-${name}`),
                    body: `Context: ${name}`,
                    seed: '',
                  }),
                ],
                actions: [
                  {
                    id: `fixture/context-${name}`,
                    description: `Never replay domain action for ${name}`,
                    run: async () => {
                      throw new Error('A harness retrofit ran a domain action');
                    },
                  },
                ],
              };
            },
          },
    ),
  };
  return {
    stacks: () => shippedRegistry.stacks(),
    stack: (id) => shippedRegistry.stack(id),
    verticals: () => [
      ...shippedRegistry
        .verticals()
        .map((vertical) => (vertical.id === 'persistence' ? persistenceWithSkill : vertical)),
      contextsWithSkills,
    ],
    vertical: (id) =>
      id === 'bounded-context'
        ? contextsWithSkills
        : id === 'persistence'
          ? persistenceWithSkill
          : shippedRegistry.vertical(id),
  };
}

describe('real preset harness opt-out', () => {
  it.each(families)(
    '%s keeps formatter configuration and supports code-style reapply without a harness',
    async (stack) => {
      const logger = new FakeLogger();
      const mediator = installMediator({ logger, runDeferred: async () => {} });
      expectOk(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack,
            answers: {},
            agentHarness: false,
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await assertHarnessAbsent();
      expect(await fs.readFile(path.join(cwd, '.editorconfig'), 'utf8')).toContain('root = true');
      expect(
        logger.entries.filter((message) => /skipped \d+ harness elements/.test(message.message)),
      ).toHaveLength(1);
      expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['code-style'],
            reapply: true,
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      await assertHarnessAbsent();
      expect(await fs.readFile(path.join(cwd, '.editorconfig'), 'utf8')).toContain('root = true');
    },
  );
});

describe('harness adoption on a grown project', () => {
  it('replays recorded answers, and no bounded context of a registry’s own, while preserving domain edits and unowned prose', async () => {
    const deferred: string[][] = [];
    const mediator = installMediator({
      registry: retrofitRegistry(),
      runDeferred: async (inputs) => {
        deferred.push(inputs.actions.map((action) => action.id));
      },
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          agentHarness: false,
          answers: {
            'walking-skeleton/quarkus-rest-bootstrap': {
              projectName: 'warehouse',
              basePackage: 'com.acme.warehouse',
            },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['persistence'],
          answers: { 'persistence/database-compose': { engine: 'mariadb', migrations: 'flyway' } },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    for (const module of moduleNames.slice(1)) {
      const consumes =
        module === 'ordering' ? 'greeting' : module === 'shipping' ? 'ordering' : null;
      expectOk(
        await mediator.dispatch(
          addModuleCommand({
            cwd,
            module,
            answers: {},
            interactive: false,
            dryRun: false,
            ...(consumes === null ? {} : { consumes }),
          }),
        ),
      );
    }
    await assertHarnessAbsent();
    const before = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
    expect(before.modules.map((module) => module.name)).toEqual(moduleNames);
    const handler = (await filesUnder(cwd)).find((file) => file.endsWith('/GreetHandler.java'))!;
    expect(handler).toBeDefined();
    await fs.appendFile(path.join(cwd, handler), '\n// User business rule: keep this edit.\n');
    await fs.outputFile(path.join(cwd, teamNotes), prose);
    const domainBefore = await domainSnapshot();
    deferred.splice(0);

    const report = expectOk(
      await mediator.dispatch(
        addVerticalCommand({
          cwd,
          verticals: ['agent-harness'],
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    expect(await domainSnapshot()).toEqual(domainBefore);
    // Nothing keel runs writes into the team's notes: only the
    // registry's context vertical, which no replay reads, would.
    expect(await fs.readFile(path.join(cwd, teamNotes), 'utf8')).toBe(prose);
    expect(await fs.readFile(path.join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    expect(await fs.readFile(path.join(cwd, '.claude/skills/run/SKILL.md'), 'utf8')).toContain(
      'name: run',
    );
    expect(
      await fs.readFile(path.join(cwd, '.claude/skills/inspect-persistence/SKILL.md'), 'utf8'),
    ).toContain('Engine: mariadb. Migrations: flyway. Project: warehouse.');
    // Keel's own `bounded-context` is what `keel add module` ran, and
    // what the retrofit replays for each context it added: the one the
    // registry lists under that id is read neither for those nor for
    // the skeleton's.
    for (const name of moduleNames) {
      expect(await fs.pathExists(path.join(cwd, `.claude/skills/inspect-${name}`))).toBe(false);
    }
    expect(report.actions).toEqual([]);
    expect(deferred.flat()).toEqual([]);
    const after = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
    expect(after.modules).toEqual(before.modules);
    expect(after.answers[ADD_MODULE_INPUT_ID]).toBeUndefined();
    expect(after.tags).not.toContain('modules.context');
    expect(after.answers['walking-skeleton/quarkus-rest-bootstrap']).toEqual(
      before.answers['walking-skeleton/quarkus-rest-bootstrap'],
    );
    expect(after.answers['persistence/database-compose']).toEqual(
      before.answers['persistence/database-compose'],
    );
    expect(after.tags).toContain('agentic.harness');
    expect(
      after.entries
        .filter((entry) => entry.target.startsWith('.claude/skills/inspect-'))
        .map((entry) => entry.target),
    ).toEqual(['.claude/skills/inspect-persistence/SKILL.md']);

    // Re-rendering the harness replays what did not run, and puts back
    // what it wrote: an unedited tree cannot tell. The contexts `keel add
    // module` added replay through keel's own `bounded-context`, so none
    // of the registry's context elements is written.
    const skill = path.join(cwd, '.claude/skills/inspect-persistence/SKILL.md');
    const persistence = await fs.readFile(skill, 'utf8');
    for (const rerender of [{ reapply: true }, { refresh: ['agent-harness'] }]) {
      await fs.writeFile(skill, 'edited\n');
      expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['agent-harness'],
            answers: {},
            interactive: false,
            dryRun: false,
            ...rerender,
          }),
        ),
      );
      expect(await fs.readFile(skill, 'utf8')).toBe(persistence);
      for (const name of moduleNames)
        expect(await fs.pathExists(path.join(cwd, `.claude/skills/inspect-${name}`))).toBe(false);
      expect(await fs.readFile(path.join(cwd, teamNotes), 'utf8')).toBe(prose);
      expect(await domainSnapshot()).toEqual(domainBefore);
      expect(deferred.flat()).toEqual([]);
      expect((await fsManifestStore.read(projectScopeRoot(cwd)))!.modules).toEqual(before.modules);
    }
  });
});

describe('the root map on a registry listing its own bounded-context', () => {
  it('indexes none of its elements when keel add module adds a context, nor when keel docs syncs or checks it', async () => {
    const mediator = installMediator({ registry: retrofitRegistry(), runDeferred: async () => {} });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'quarkus-rest',
          moduleLayout: 'modulith',
          answers: {
            'walking-skeleton/quarkus-rest-bootstrap': {
              projectName: 'warehouse',
              basePackage: 'com.acme.warehouse',
            },
          },
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    await fs.outputFile(path.join(cwd, teamNotes), prose);
    const root = () => fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8');

    expectOk(
      await mediator.dispatch(
        addModuleCommand({
          cwd,
          module: 'ordering',
          consumes: 'greeting',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );
    expect(await root()).not.toContain('inspect-');
    expect(expectOk(await mediator.dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);

    expectOk(await mediator.dispatch(docsSyncCommand({ cwd, dryRun: false })));
    expect(await root()).not.toContain('inspect-');
    expect(await fs.readFile(path.join(cwd, teamNotes), 'utf8')).toBe(prose);
    const after = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
    expect(
      after.entries.filter(({ target }) => target.startsWith('.claude/skills/inspect-')),
    ).toEqual([]);
  });
});

/**
 * `code-style` with one more adapter, gated on `modules.context`: the
 * marker `keel add module` puts on the manifest for its run alone, and
 * no written manifest carries.
 */
function markerReadingRegistry(): Registry {
  const style = shippedRegistry.vertical('code-style')!;
  const marked: Vertical = {
    ...style,
    skills: [...(style.skills ?? []), 'marked'],
    adapters: [
      ...style.adapters,
      {
        id: 'code-style/marked',
        vertical: 'code-style',
        covers: [],
        predicate: { requires: [CONTEXT_TAG] },
        contribute: () => ({
          skills: [{ name: 'marked', description: 'Marked.', body: 'Marked.' }],
        }),
      },
    ],
  };
  return {
    stacks: () => shippedRegistry.stacks(),
    stack: (id) => shippedRegistry.stack(id),
    verticals: () =>
      shippedRegistry
        .verticals()
        .map((vertical) => (vertical.id === 'code-style' ? marked : vertical)),
    vertical: (id) => (id === 'code-style' ? marked : shippedRegistry.vertical(id)),
  };
}

describe('the root map on a registry whose vertical reads the context marker', () => {
  it('is re-indexed by keel add module as keel docs check reads it, without the marker', async () => {
    const mediator = installMediator({
      registry: markerReadingRegistry(),
      runDeferred: async () => {},
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: 'go-cli',
          moduleLayout: 'modulith',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    expectOk(
      await mediator.dispatch(
        addModuleCommand({ cwd, module: 'orders', answers: {}, interactive: false, dryRun: false }),
      ),
    );

    expect(await fs.readFile(path.join(cwd, 'AGENTS.md'), 'utf8')).not.toContain('marked');
    expect(expectOk(await mediator.dispatch(docsCheckQuery({ cwd }))).drift).toEqual([]);
  });
});
