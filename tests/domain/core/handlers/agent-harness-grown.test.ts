/** Real presets and a grown modulith exercise harness opt-out and later adoption. */
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import type { Contribution, Vertical } from '../../../../src/domain/contract/composition.js';
import { projectScopeRoot } from '../../../../src/domain/contract/manifest.js';
import type { Registry } from '../../../../src/domain/contract/ports/registry.js';
import { markdownRegion, regionPatch } from '../../../../src/domain/contract/region.js';
import {
  ADD_MODULE_INPUT_ID,
  addedContext,
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
  const contextsWithSkills: Vertical = {
    ...boundedContextVertical,
    skills: moduleNames.map((name) => `inspect-${name}`),
    adapters: boundedContextVertical.adapters.map((adapter) => ({
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
    })),
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
            vertical: 'code-style',
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
  it('replays recorded answers and every module while preserving domain edits and unowned prose', async () => {
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
          vertical: 'persistence',
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
          vertical: 'agent-harness',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    expect(await domainSnapshot()).toEqual(domainBefore);
    expect(await fs.readFile(path.join(cwd, teamNotes), 'utf8')).toContain(prose.trim());
    expect(await fs.readFile(path.join(cwd, 'CLAUDE.md'), 'utf8')).toBe('@AGENTS.md\n');
    expect(await fs.readFile(path.join(cwd, '.claude/skills/run/SKILL.md'), 'utf8')).toContain(
      'name: run',
    );
    expect(
      await fs.readFile(path.join(cwd, '.claude/skills/inspect-persistence/SKILL.md'), 'utf8'),
    ).toContain('Engine: mariadb. Migrations: flyway. Project: warehouse.');
    for (const name of moduleNames) {
      const consumes = name === 'ordering' ? 'greeting' : name === 'shipping' ? 'ordering' : 'none';
      expect(
        await fs.readFile(path.join(cwd, `.claude/skills/inspect-${name}/SKILL.md`), 'utf8'),
      ).toContain(
        `Read modules/${name}/domain/core. Package: com.acme.warehouse. Consumes: ${consumes}.`,
      );
      expect(await fs.readFile(path.join(cwd, teamNotes), 'utf8')).toContain(`Context: ${name}`);
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
        .map((entry) => entry.target)
        .sort(),
    ).toEqual(
      [
        '.claude/skills/inspect-persistence/SKILL.md',
        ...moduleNames.map((name) => `.claude/skills/inspect-${name}/SKILL.md`),
      ].sort(),
    );
  });
});
