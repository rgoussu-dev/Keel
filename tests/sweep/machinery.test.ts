/**
 * The weekly composition sweep's own machinery, held in `verify`.
 *
 * The three suites beside this one self-skip outside the weekly lane,
 * so a helper they lean on that stopped working — a walk that no longer
 * reaches a setting, a closure that no longer ticks what a box needs, a
 * read-back that stages nothing, a comparison that no longer sees a
 * difference — would go unseen until a Monday run swept nothing, or
 * everything, for the wrong reason. This file is not opted in: it runs
 * wherever `pnpm test` does, over a few presets' dials, one product's
 * preview and dry-run install, and a few small trees, in about a
 * second.
 */

import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, describe, expect, it } from 'vitest';
import { serviceBuild } from '../../assets/web/src/target.js';
import { installCommandFor, type NewProjectTarget } from '../../src/domain/contract/commands.js';
import { MANIFEST_FILENAME } from '../../src/domain/contract/manifest.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  type DialOptions,
  type PendingQuestion,
  type StackDescriptor,
} from '../../src/domain/contract/queries.js';
import { Grid, OK, layoutsOf, type Outcome } from '../support/composition-grid.js';
import {
  POWERSET_BOUND,
  PresetSweep,
  answersFor,
  bareSpelling,
  commandOf,
  everyDialSetting,
  naming,
  offeredExtras,
  scratchDirectory,
  setKey,
  stagedDifference,
  subsetsOf,
  ticked,
  treeDifference,
  treeOf,
} from '../support/composition-sweep.js';

const grid = new Grid([]);
afterAll(() => grid.dispose());

const dialsOf = (target: NewProjectTarget): Promise<DialOptions> =>
  grid.read(dialsQuery({ target }));

const stackOf = async (id: string): Promise<StackDescriptor> => {
  const stack = (await grid.read(catalogQuery())).stacks.find((candidate) => candidate.id === id);
  if (stack === undefined) throw new Error(`'${id}' left the catalog`);
  return stack;
};

const settingsOf = async (id: string): Promise<readonly DialOptions[]> => {
  const preset = new PresetSweep('machinery', id);
  const settings = await everyDialSetting(grid, await stackOf(id), preset);
  // Every setting the walk reached, keel.dials answered.
  expect(preset.findings).toEqual([]);
  return settings;
};

const targetOf = (reply: DialOptions): NewProjectTarget => reply.target as NewProjectTarget;

describe("the sweep's dial settings", () => {
  it('walks every dial a single preset shows, and takes each setting again with the agent harness left out', async () => {
    const settings = await settingsOf('go-http');
    const [opening] = settings;
    for (const layout of opening?.moduleLayouts ?? []) {
      expect(settings.some((reply) => targetOf(reply).moduleLayout === layout.id)).toBe(true);
    }
    if (settings.some((reply) => reply.peerContext)) {
      expect(settings.some((reply) => targetOf(reply).withPeerContext === true)).toBe(true);
    }
    const rest = (reply: DialOptions): string => {
      const { agentHarness: _harness, ...target } = targetOf(reply);
      return JSON.stringify(target);
    };
    const left = new Set(
      settings.filter((reply) => targetOf(reply).agentHarness === false).map(rest),
    );
    expect(left.size).toBeGreaterThan(1);
    const harnessed = settings.filter(
      (reply) => reply.agentHarness && targetOf(reply).agentHarness !== false,
    );
    expect(harnessed.map(rest).filter((setting) => !left.has(setting))).toEqual([]);
  });

  it("walks a product under each repository layout, every service's build system with every other's", async () => {
    const settings = await settingsOf('fullstack');
    const layouts = await layoutsOf(grid, 'fullstack');
    expect(layouts.length).toBeGreaterThan(1);
    // Two dials in one field: moving one service's must keep the
    // other's, or a combination is never reached.
    const dialled = (settings[0]?.services ?? []).filter(
      (service) => service.buildSystems.length > 0,
    );
    expect(dialled.length).toBeGreaterThan(1);
    const combinations = dialled.reduce<readonly (readonly string[])[]>(
      (sofar, service) =>
        sofar.flatMap((prefix) =>
          service.buildSystems.map((build) => [...prefix, `${service.path}=${build.id}`]),
        ),
      [[]],
    );
    const reached = new Set(
      settings.map((reply) =>
        JSON.stringify([
          targetOf(reply).layout,
          ...dialled.map(
            (service) =>
              `${service.path}=${serviceBuild(targetOf(reply).buildSystem, service.path)}`,
          ),
        ]),
      ),
    );
    const wanted = layouts.flatMap((layout) =>
      combinations.map((combination) => JSON.stringify([layout, ...combination])),
    );
    expect(wanted.filter((setting) => !reached.has(setting))).toEqual([]);
  });

  it('records a setting keel.dials does not answer as a finding, once, and walks on without it', async () => {
    const every = await settingsOf('quarkus-rest');
    const shown = every.find(
      (reply) => reply.peerContext && targetOf(reply).withPeerContext !== true,
    );
    if (shown === undefined) throw new Error('quarkus-rest no longer shows the peer-context box');
    // Queued again from each setting that shows the box on this build
    // system, and refused each time: one finding.
    const refused = commandOf({ ...targetOf(shown), withPeerContext: true });
    const read = (target: NewProjectTarget): Promise<Outcome<DialOptions>> =>
      commandOf(target) === refused
        ? Promise.resolve({ verdict: 'keel.sweep-probe', value: null, message: 'not this one' })
        : grid.twin(dialsQuery({ target }));
    const preset = new PresetSweep('machinery', 'quarkus-rest');
    const settings = await everyDialSetting(grid, await stackOf('quarkus-rest'), preset, read);
    expect(preset.findings).toEqual([
      {
        at: refused,
        what: 'a setting its dials offer, and keel.dials refuses as keel.sweep-probe: not this one',
      },
    ]);
    const harnessOn = (reply: DialOptions): string => {
      const { agentHarness: _harness, ...target } = targetOf(reply);
      return commandOf(target);
    };
    // The walk reaches settings after the one refused, so a walk that
    // stopped there would miss them: every other one is still walked.
    const at = every.findIndex((reply) => harnessOn(reply) === refused);
    expect(every.slice(at + 1).some((reply) => targetOf(reply).agentHarness !== false)).toBe(true);
    const commands = (replies: readonly DialOptions[]): ReadonlySet<string> =>
      new Set(replies.map((reply) => commandOf(targetOf(reply))));
    expect(commands(settings)).toEqual(
      commands(every.filter((reply) => harnessOn(reply) !== refused)),
    );
  });
});

describe("the sweep's sets", () => {
  it('sweeps the whole powerset up to the bound, and says when it caps past it', () => {
    const key = (set: readonly number[]): string => set.join(',');
    const within = subsetsOf(Array.from({ length: 4 }, (_, index) => index));
    expect(within.capped).toBe(false);
    // Sixteen sets that are the sixteen subsets: each once, each item in half.
    expect(new Set(within.sets.map(key)).size).toBe(16);
    for (const item of [0, 1, 2, 3]) {
      expect(within.sets.filter((set) => set.includes(item))).toHaveLength(8);
    }

    const n = POWERSET_BOUND + 1;
    const past = subsetsOf(Array.from({ length: n }, (_, index) => index));
    expect(past.capped).toBe(true);
    expect(new Set(past.sets.map(key)).size).toBe(past.sets.length);
    const sizes = past.sets.map((set) => set.length);
    // C(n,0) + C(n,1) + C(n,2) + C(n,3): every set of up to three.
    const small = 1 + n + (n * (n - 1)) / 2 + (n * (n - 1) * (n - 2)) / 6;
    expect(sizes.filter((size) => size <= 3)).toHaveLength(small);
    expect(sizes.filter((size) => size === n - 1)).toHaveLength(n);
    expect(sizes).toContain(n);
  });

  it('ticks a box with what it needs, as the page does, and names the set one way whatever the order', async () => {
    const dials = await dialsOf({ kind: 'new-project', stack: 'quarkus-rest' });
    const iac = offeredExtras(dials).find((extra) => extra.id === 'iac');
    expect(iac).toBeDefined();
    const named = ticked(dials, iac === undefined ? [] : [iac]);
    expect(named.map((extra) => extra.id)).toEqual(['containerization', 'distribution', 'iac']);
    expect(setKey(named)).toBe(setKey([...named].reverse()));
    expect(commandOf(naming(dials.target as NewProjectTarget, named))).toBe(
      'keel new --stack quarkus-rest --build-system gradle --module-layout basic ' +
        '--with containerization,distribution,iac --yes',
    );
  });

  it("names a product's extras per service, and without one only where every one can be", async () => {
    const dials = await dialsOf({ kind: 'new-project', stack: 'fullstack' });
    const extras = offeredExtras(dials);
    expect(extras.every((extra) => extra.service !== null)).toBe(true);
    const persistence = extras.filter((extra) => extra.id === 'persistence');
    expect(persistence).toEqual([{ service: 'backend', id: 'persistence' }]);
    expect(bareSpelling(dials, persistence)).toEqual([{ service: null, id: 'persistence' }]);
    // Mixed, the two spellings are refused, so none is offered.
    const toolchain = extras.filter((extra) => extra.id === 'toolchain');
    expect(bareSpelling(dials, [...persistence, ...toolchain])).toBeNull();
    // One id in two services is two extras: ticked, each keeps its
    // service, and each is a set of its own.
    expect(ticked(dials, toolchain)).toEqual([
      { service: 'backend', id: 'toolchain' },
      { service: 'frontend', id: 'toolchain' },
    ]);
    expect(setKey(toolchain.slice(0, 1))).not.toBe(setKey(toolchain.slice(1)));
    expect(naming(dials.target as NewProjectTarget, toolchain)).toMatchObject({
      services: {
        backend: { extraVerticals: ['toolchain'] },
        frontend: { extraVerticals: ['toolchain'] },
      },
    });
    expect(naming(dials.target as NewProjectTarget, persistence)).toMatchObject({
      services: { backend: { extraVerticals: ['persistence'] } },
    });
    expect(naming(dials.target as NewProjectTarget, persistence)).not.toHaveProperty(
      'extraVerticals',
    );
  });

  it('answers a set question with none, each and all, and a free-form one with a sample', () => {
    const question = (fields: Partial<PendingQuestion>): PendingQuestion => ({
      id: 'targets',
      prompt: '',
      doc: '',
      default: '',
      value: '',
      memory: 'sticky',
      binding: { kind: 'answer', adapter: 'a', question: 'q' },
      ...fields,
    });
    const choices = [
      { value: 'x', label: 'x', doc: '' },
      { value: 'y', label: 'y', doc: '' },
    ];
    expect(answersFor(question({ kind: 'multi-select', choices }))).toEqual(['', 'x', 'y', 'x,y']);
    expect(answersFor(question({ choices }))).toEqual(['x', 'y']);
    expect(answersFor(question({ id: 'projectName', shared: 'project' }))).toEqual(['grid-app']);
    expect(answersFor(question({ id: 'defaultBranch' }))).toEqual(['trunk']);
    expect(() => answersFor(question({ id: 'unheard-of' }))).toThrow(/FREE_FORM_SAMPLES/);
  });
});

describe("the sweep's comparison of two change lists", () => {
  it("reads back what a preview and a dry-run install stage, a product's services included", async () => {
    const target = targetOf(await dialsOf({ kind: 'new-project', stack: 'fullstack' }));
    const [previewRoot, installRoot] = [await grid.scratch(), await grid.scratch()];
    const preview = await grid.stages(
      previewQuery({ cwd: previewRoot, target, answers: {} }),
      previewRoot,
    );
    const install = await grid.stages(
      installCommandFor(target, {
        cwd: installRoot,
        answers: {},
        interactive: false,
        dryRun: true,
      }),
      installRoot,
    );
    expect(preview.outcome.verdict).toBe(OK);
    expect(install.outcome.verdict).toBe(OK);
    // A read-back that staged nothing would hold every comparison.
    const staged = preview.staged ?? [];
    expect(staged.some((line) => line.includes(' backend/'))).toBe(true);
    expect(
      stagedDifference(
        { label: 'preview', staged },
        { label: 'dry-run install', staged: install.staged ?? [] },
      ),
    ).toBeNull();
  });

  it('names each path whose kind or bytes differ, and what only one side stages', () => {
    const preview = [
      'create .gitignore 89ab',
      'create README.md 0123',
      'create docs/a b.md 4567',
      'create only-here.txt cdef',
    ];
    const same = { label: 'dry-run install', staged: [...preview] };
    expect(stagedDifference({ label: 'preview', staged: preview }, same)).toBeNull();
    const install = [
      'modify .gitignore 89ab',
      'create README.md ffff',
      'create docs/a b.md 0000',
      'create only-there.txt cdef',
    ];
    expect(
      stagedDifference(
        { label: 'preview', staged: preview },
        { label: 'dry-run install', staged: install },
      ),
    ).toEqual({
      sizes: 'preview: 4 files; dry-run install: 4 files',
      paths: [
        'only in preview: only-here.txt',
        'only in dry-run install: only-there.txt',
        'differing: .gitignore, README.md, docs/a b.md',
      ],
      nature: 'content',
    });
    // Two Trees writing one path: a list the grid's I8 and I9 call
    // another, whose last line alone would match.
    const twice = ['create README.md aaaa', 'create README.md bbbb'];
    const once = { label: 'dry-run install', staged: ['create README.md bbbb'] };
    expect(stagedDifference({ label: 'preview', staged: twice }, once)).toEqual({
      sizes: 'preview: 1 file; dry-run install: 1 file',
      paths: ['staged more than once in preview: README.md'],
      nature: 'content',
    });
    expect(
      stagedDifference(
        { label: 'preview', staged: twice },
        { label: 'dry-run install', staged: [...twice].reverse() },
      ),
    ).toBeNull();
  });
});

describe("the sweep's comparison of two trees", () => {
  const manifest = (verticals: readonly string[], stamp: string): Buffer =>
    Buffer.from(
      JSON.stringify({
        installedAt: stamp,
        answers: Object.fromEntries(verticals.map((id) => [`${id}/adapter`, { q: 'a' }])),
        verticals: verticals.map((id) => ({ id, installedAt: stamp })),
      }),
    );
  const tree = (files: Record<string, string | Buffer>): ReadonlyMap<string, Buffer> =>
    new Map(
      Object.entries(files).map(([file, bytes]) => [
        file,
        typeof bytes === 'string' ? Buffer.from(bytes) : bytes,
      ]),
    );

  it('reads a manifest by what it records, not when or in what order', async () => {
    const written: string[] = [];
    const onDisk = async (content: Buffer): Promise<ReadonlyMap<string, Buffer>> => {
      const root = await scratchDirectory();
      written.push(root);
      await fs.outputFile(path.join(root, '.claude', MANIFEST_FILENAME), content);
      return treeOf(root);
    };
    try {
      const one = { label: 'one run', tree: await onDisk(manifest(['a', 'b'], 't1')) };
      const two = { label: 'two runs', tree: await onDisk(manifest(['b', 'a'], 't2')) };
      expect(treeDifference(one, two)).toBeNull();
      const other = { label: 'two runs', tree: await onDisk(manifest(['a'], 't1')) };
      expect(treeDifference(one, other)).toEqual({
        sizes: 'one run: 1 file; two runs: 1 file',
        paths: ['differing: .claude/.keel-manifest.json (answers, verticals)'],
        nature: 'record',
      });
    } finally {
      await Promise.all(written.map((root) => fs.remove(root)));
    }
  });

  it('tells lines in another order from other content, and which side holds what the other does not', () => {
    const one = { label: 'one run', tree: tree({ 'README.md': 'a\nb\n', 'x.txt': 'x' }) };
    const reordered = { label: 'two runs', tree: tree({ 'README.md': 'b\na\n', 'x.txt': 'x' }) };
    expect(treeDifference(one, reordered)).toEqual({
      sizes: 'one run: 2 files; two runs: 2 files',
      paths: ['differing: README.md (the same lines, in another order)'],
      nature: 'order',
    });
    const other = { label: 'two runs', tree: tree({ 'README.md': 'a\nc\n', 'y.txt': 'y' }) };
    expect(treeDifference(one, other)).toEqual({
      sizes: 'one run: 2 files; two runs: 2 files',
      paths: ['only in one run: x.txt', 'only in two runs: y.txt', 'differing: README.md'],
      nature: 'content',
    });
    // Which way they differ: files the second tree alone holds, and
    // nothing else, are `added`; the first's alone, `content`.
    const more = {
      label: 'two runs',
      tree: tree({ 'README.md': 'a\nb\n', 'x.txt': 'x', 'y.txt': 'y' }),
    };
    expect(treeDifference(one, more)).toEqual({
      sizes: 'one run: 2 files; two runs: 3 files',
      paths: ['only in two runs: y.txt'],
      nature: 'added',
    });
    const fewer = { label: 'two runs', tree: tree({ 'README.md': 'a\nb\n' }) };
    expect(treeDifference(one, fewer)?.nature).toBe('content');
  });
});

describe("the sweep's report", () => {
  it('groups findings by what they say and the paths they name, listing every reading', () => {
    const preset = new PresetSweep('arrival', 'go-http');
    const difference = {
      sizes: 'one run: 2 files; two runs: 2 files',
      paths: ['differing: README.md (the same lines, in another order)'],
      nature: 'order' as const,
    };
    preset.find({ at: 'keel new a', what: 'in another order', difference });
    preset.find({ at: 'keel new b', what: 'in another order', difference });
    preset.find({ at: 'keel new c', what: 'refused' });
    expect(preset.report()).toBe(
      [
        '3 findings on go-http (arrival), in 2 kinds:',
        '',
        '- in another order',
        '    differing: README.md (the same lines, in another order)',
        '  at 2 readings:',
        '    keel new a (one run: 2 files; two runs: 2 files)',
        '    keel new b (one run: 2 files; two runs: 2 files)',
        '',
        '- refused',
        '  at one reading:',
        '    keel new c',
      ].join('\n'),
    );
    const one = new PresetSweep('choices', 'go-http');
    one.find({ at: 'keel new d', what: 'refused' });
    expect(one.report().split('\n')[0]).toBe('1 finding on go-http (choices), in 1 kind:');
  });
});
