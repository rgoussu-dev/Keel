import os from 'node:os';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import type { Tag, Vertical } from '../../../../src/domain/contract/composition.js';
import { projectScopeRoot, type ManifestEntry } from '../../../../src/domain/contract/manifest.js';
import { hashRegion, regionPatch } from '../../../../src/domain/contract/region.js';
import { registryOf } from '../../../../src/domain/core/registry.js';
import { FakeClock } from '../../../../src/infrastructure/commons/fake-clock.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

const producer: Vertical = {
  id: 'producer',
  description: 'A domain contributor with harness elements',
  dimensions: [],
  skills: ['inspect'],
  adapters: [
    {
      id: 'producer/files',
      vertical: 'producer',
      covers: [],
      predicate: {},
      contribute: () => ({
        files: [{ path: 'domain.txt', content: 'domain content\n' }],
        skills: [
          { name: 'inspect', description: 'Inspect the domain.', body: 'Read domain.txt.\n' },
        ],
        harnessPatches: [
          regionPatch({
            target: '.claude/hook.sh',
            region: hashRegion('inspect'),
            body: 'echo inspect',
          }),
        ],
      }),
    },
  ],
};
const harness: Vertical = {
  id: 'agent-harness',
  description: 'Harness activation',
  dimensions: [],
  promotes: ['agentic.harness'],
  adapters: [
    {
      id: 'agent-harness/core',
      vertical: 'agent-harness',
      covers: [],
      predicate: {},
      contribute: () => ({
        files: [{ path: '.claude/hook.sh', content: '#!/bin/sh\n' }],
        tagsAdd: ['agentic.harness'],
      }),
    },
  ],
};
let cwd: string;
beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-harness-'));
});
afterEach(async () => {
  await fs.remove(cwd);
});
function scenario(
  verticals: readonly Vertical[],
  registered: readonly Vertical[] = verticals,
  tags: readonly Tag[] = [],
) {
  const logger = new FakeLogger();
  const clock = new FakeClock('2026-04-26T12:00:00Z');
  const mediator = installMediator({
    logger,
    clock,
    registry: registryOf([
      {
        origin: 'harness-test',
        verticals: registered,
        stacks: [{ id: 'fixture', description: 'Harness ordering fixture', tags, verticals }],
      },
    ]),
    runDeferred: () => Promise.resolve(),
  });
  return { mediator, logger, clock };
}
async function scaffold(mediator: ReturnType<typeof installMediator>, agentHarness?: boolean) {
  return expectOk(
    await mediator.dispatch(
      newProjectCommand({
        cwd,
        stack: 'fixture',
        answers: {},
        interactive: false,
        dryRun: false,
        ...(agentHarness === undefined ? {} : { agentHarness }),
      }),
    ),
  );
}

describe('harness realization at the end of the run', () => {
  it('realizes earlier skills and region patches once the final tags activate the harness', async () => {
    const { mediator } = scenario([producer, harness]);
    await scaffold(mediator);
    expect(await fs.readFile(path.join(cwd, '.claude/skills/inspect/SKILL.md'), 'utf8')).toContain(
      'Read domain.txt.',
    );
    expect(await fs.readFile(path.join(cwd, '.claude/hook.sh'), 'utf8')).toContain('echo inspect');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'producer/files',
          target: '.claude/skills/inspect/SKILL.md',
        }),
        expect.objectContaining({ source: 'producer/files', target: '.claude/hook.sh' }),
      ]),
    );
  });
  it('suppresses skills and hook patches together, reports once, and still installs domain files', async () => {
    const { mediator, logger } = scenario([producer]);
    const report = await scaffold(mediator);
    expect(report.skippedHarnessElements).toBe(2);
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('domain content\n');
    expect(await fs.pathExists(path.join(cwd, '.claude/skills'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, '.claude/hook.sh'))).toBe(false);
    expect(
      logger.entries.filter((m) => m.message.includes('skipped 2 harness elements')),
    ).toHaveLength(1);
  });
  it('the opt-out removes the harness from a preset without suppressing domain content', async () => {
    const { mediator } = scenario([producer, harness]);
    await scaffold(mediator, false);
    expect(await fs.pathExists(path.join(cwd, '.claude/hook.sh'))).toBe(false);
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    expect(manifest?.tags).not.toContain('agentic.harness');
    expect(manifest?.verticals.map((v) => v.id)).toEqual(['producer']);
  });
  it.each(['stack-tag', 'preset-vertical', 'extra-vertical'] as const)(
    'refuses an opt-out assembly reactivated by a plugin %s before writing files',
    async (source) => {
      const plugin: Vertical = {
        ...harness,
        id: 'plugin-harness',
        adapters: harness.adapters.map((adapter) => ({
          ...adapter,
          id: 'plugin-harness/core',
          vertical: 'plugin-harness',
        })),
      };
      const { mediator } = scenario(
        source === 'preset-vertical' ? [producer, plugin] : [producer],
        [producer, plugin],
        source === 'stack-tag' ? ['agentic.harness'] : [],
      );
      const error = expectErr(
        await mediator.dispatch(
          newProjectCommand({
            cwd,
            stack: 'fixture',
            answers: {},
            interactive: false,
            dryRun: false,
            agentHarness: false,
            ...(source === 'extra-vertical' ? { extraVerticals: ['plugin-harness'] } : {}),
          }),
        ),
      );
      expect(error.code).toBe('keel.invalid-agent-harness');
      expect(error.message).toContain('--no-agent-harness');
      expect(await fs.readdir(cwd)).toEqual([]);
    },
  );
  it('adopts a harness later without rewriting existing domain files', async () => {
    const { mediator } = scenario([producer], [producer, harness]);
    await scaffold(mediator);
    await fs.writeFile(path.join(cwd, 'domain.txt'), 'user domain changes\n');
    expectOk(
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
    expect(await fs.readFile(path.join(cwd, 'domain.txt'), 'utf8')).toBe('user domain changes\n');
    expect(await fs.readFile(path.join(cwd, '.claude/skills/inspect/SKILL.md'), 'utf8')).toContain(
      'Read domain.txt.',
    );
    expect(await fs.readFile(path.join(cwd, '.claude/hook.sh'), 'utf8')).toContain('echo inspect');
  });
  it('records hashes of the final shared file for every region contributor', async () => {
    const second: Vertical = {
      id: 'second',
      description: 'A second region',
      dimensions: [],
      adapters: [
        {
          id: 'second/patch',
          vertical: 'second',
          covers: [],
          predicate: {},
          contribute: () => ({
            harnessPatches: [
              regionPatch({
                target: '.claude/hook.sh',
                region: hashRegion('second'),
                body: 'echo second',
              }),
            ],
          }),
        },
      ],
    };
    const { mediator } = scenario([producer, harness, second]);
    await scaffold(mediator);
    const content = await fs.readFile(path.join(cwd, '.claude/hook.sh'));
    const hash = createHash('sha256').update(content).digest('hex');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    const entries = manifest!.entries.filter((entry) => entry.target === '.claude/hook.sh');
    expect(entries).toHaveLength(2);
    expect(
      entries.every((entry) => entry.sha256Current === hash && entry.sha256Shipped === hash),
    ).toBe(true);
  });
  it('records a hook as the run leaves it, once another contributor has filled its slot', async () => {
    const slot = hashRegion('format-step');
    const kit: Vertical = {
      id: 'kit',
      description: 'Stages a hook with a slot',
      dimensions: [],
      hooks: ['gate'],
      adapters: [
        {
          id: 'kit/hook',
          vertical: 'kit',
          covers: [],
          predicate: {},
          contribute: () => ({
            hooks: [
              {
                name: 'gate',
                event: 'PreToolUse',
                matcher: 'Bash',
                script: `#!/usr/bin/env bash\nset -eu\n${slot.begin}\n# none\n${slot.end}\nexit 0\n`,
                reminders: [],
                slots: [slot],
              },
            ],
          }),
        },
      ],
    };
    const filler: Vertical = {
      id: 'filler',
      description: 'Fills the hook slot',
      dimensions: [],
      adapters: [
        {
          id: 'filler/step',
          vertical: 'filler',
          covers: [],
          predicate: {},
          contribute: () => ({
            harnessPatches: [
              regionPatch({ target: '.claude/hooks/gate.sh', region: slot, body: 'echo step' }),
            ],
          }),
        },
      ],
    };
    const { mediator } = scenario([kit, filler, harness]);
    await scaffold(mediator);
    const content = await fs.readFile(path.join(cwd, '.claude/hooks/gate.sh'));
    expect(content.toString('utf8')).toContain('echo step');
    const hash = createHash('sha256').update(content).digest('hex');
    const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
    const entries = manifest!.entries.filter((entry) => entry.target === '.claude/hooks/gate.sh');
    expect(entries.map((entry) => entry.source).sort()).toEqual(['filler/step', 'kit/hook']);
    expect(
      entries.every((entry) => entry.sha256Current === hash && entry.sha256Shipped === hash),
    ).toBe(true);
  });
  it("records a later install's write as shipped on every entry of the file, keeping when each was installed", async () => {
    let body = 'echo second';
    const second: Vertical = {
      id: 'second',
      description: 'A later region contributor',
      dimensions: [],
      adapters: [
        {
          id: 'second/patch',
          vertical: 'second',
          covers: [],
          predicate: {},
          contribute: () => ({
            harnessPatches: [
              regionPatch({
                target: '.claude/hook.sh',
                region: hashRegion('second'),
                body,
              }),
            ],
          }),
        },
      ],
    };
    const { mediator, clock } = scenario([producer, harness], [producer, harness, second]);
    await scaffold(mediator);
    const before = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
    const original = before.entries.find((entry) => entry.target === '.claude/hook.sh')!;
    const untouched = before.entries.find((entry) => entry.target.endsWith('/SKILL.md'))!;
    expect(original).toBeDefined();
    expect(untouched).toBeDefined();
    let previousHash = original.sha256Current;
    const secondInstalledAt = '2026-04-27T12:00:00Z';
    // A file the later runs do not write keeps its entry, so the
    // user's edit to it still reads as one.
    await fs.appendFile(path.join(cwd, untouched.target), 'a user edit\n');

    for (const reapply of [false, true]) {
      clock.set(reapply ? '2026-04-28T12:00:00Z' : secondInstalledAt);
      body = reapply ? 'echo updated second' : 'echo second';
      expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd,
            verticals: ['second'],
            reapply,
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      const hash = createHash('sha256')
        .update(await fs.readFile(path.join(cwd, '.claude/hook.sh')))
        .digest('hex');
      expect(hash).not.toBe(previousHash);
      previousHash = hash;
      const after = (await fsManifestStore.read(projectScopeRoot(cwd)))!;
      const entries = after.entries.filter((entry) => entry.target === '.claude/hook.sh');
      expect(entries).toEqual([
        { ...original, sha256Shipped: hash, sha256Current: hash },
        {
          source: 'second/patch',
          target: '.claude/hook.sh',
          sha256Shipped: hash,
          sha256Current: hash,
          installedAt: secondInstalledAt,
        },
      ]);
      expect(after.entries.find((entry) => entry.target === untouched.target)).toEqual(untouched);
    }
  });
});

/**
 * The same provenance on keel's own presets, one per family whose
 * persistence writes a section into a directory document the family's
 * kit seeds: the kit's pre-commit hook takes code-style's format step
 * after it is staged (JVM, Rust, TypeScript), `keel add persistence`
 * writes into a document the first run tracked, and `keel add module`
 * re-indexes the root map after its harness pass (all four).
 */
describe('harness provenance on the shipped presets', () => {
  const mediator = installMediator({
    processes: new FakeProcessRunner(),
    runDeferred: () => Promise.resolve(),
  });
  const install = async (
    stack: string,
    extraVerticals: readonly string[] = [],
    moduleLayout?: string,
  ) => {
    const at = path.join(cwd, `${stack}-${String(extraVerticals.length)}`);
    await fs.ensureDir(at);
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: at,
          stack,
          answers: {},
          interactive: false,
          dryRun: false,
          ...(extraVerticals.length > 0 ? { extraVerticals } : {}),
          ...(moduleLayout === undefined ? {} : { moduleLayout }),
        }),
      ),
    );
    return at;
  };
  const entriesOf = async (at: string): Promise<readonly ManifestEntry[]> => {
    const manifest = await fsManifestStore.read(projectScopeRoot(at));
    return [...manifest!.entries].sort((a, b) =>
      `${a.target} ${a.source}`.localeCompare(`${b.target} ${b.source}`),
    );
  };
  const onDisk = async (at: string, entries: readonly ManifestEntry[]) =>
    Promise.all(
      entries.map(async (entry) => {
        const hash = createHash('sha256')
          .update(await fs.readFile(path.join(at, entry.target)))
          .digest('hex');
        return { ...entry, sha256Shipped: hash, sha256Current: hash };
      }),
    );

  it.each(['quarkus-rest', 'go-http', 'rust-http', 'ts-http'])(
    'records every harness file of %s as it lands, persistence arriving in one run or in two',
    async (stack) => {
      const one = await install(stack, ['persistence']);
      const two = await install(stack);
      expectOk(
        await mediator.dispatch(
          addVerticalCommand({
            cwd: two,
            verticals: ['persistence'],
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      const [first, second] = [await entriesOf(one), await entriesOf(two)];
      expect(first).toEqual(await onDisk(one, first));
      expect(second).toEqual(await onDisk(two, second));
      expect(second).toEqual(first);
    },
  );

  it.each(['quarkus-rest', 'go-http', 'rust-http', 'ts-http'])(
    'records the root map keel add module re-indexes on %s as it leaves it, and nothing it did not write',
    async (stack) => {
      const at = await install(stack, [], 'modulith');
      const skill = (await entriesOf(at)).filter((entry) => entry.target.endsWith('/SKILL.md'));
      const edited = skill[0]!.target;
      await fs.appendFile(path.join(at, edited), 'a user edit\n');
      expectOk(
        await mediator.dispatch(
          addModuleCommand({
            cwd: at,
            module: 'orders',
            answers: {},
            interactive: false,
            dryRun: false,
          }),
        ),
      );
      const entries = await entriesOf(at);
      const written = entries.filter((entry) => entry.target !== edited);
      expect(written).toEqual(await onDisk(at, written));
      expect(entries.filter((entry) => entry.target === edited)).toEqual(
        skill.filter((entry) => entry.target === edited),
      );
    },
  );
});
