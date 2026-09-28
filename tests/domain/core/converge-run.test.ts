/**
 * The converge run (`src/domain/core/converge-run.ts`): a plan
 * `convergeOf` read, staged onto a Tree and reported, committing
 * nothing — and the one commit after it. `keel add entrypoint` is its
 * caller, and the growth grid holds that caller to its twin byte for
 * byte (I10); this holds each part of the run on a family small enough
 * to read: each posture, both placements, the harness realized in each
 * order, the retrofit with and without the recorded contexts, a
 * conflict read as a refused re-render naming what re-rendered in the
 * order the project records it, the caller's answer check, the
 * refresh proposals — what they read, over what, in the caller's
 * words — and the commit, its deferred actions run for real.
 *
 * **Scenario.** The `acme` family: a skeleton with one bootstrap per
 * entrypoint, an agent harness whose guide speaks of the entrypoints,
 * notes, and an observability only a server takes — the CLI preset
 * carrying the first three, and the CLI + HTTP one all four, the
 * observability before the notes — beside extras: metrics, a log whose
 * patch appends a line on every application, a deploy vertical that
 * reads both, a vertical writing a file the skeleton writes, and a
 * context vertical of the family's own, under the id `keel add module`
 * records. A project is scaffolded by the run itself onto an empty
 * manifest, and committed; each case varies the plan or the manifest
 * after it.
 *
 * **Factory.** The shipped fakes — an in-memory disk each `FakeTree`
 * opens seeded from and a commit writes back into, `FakeManifestStore`,
 * a pinned `FakeClock` — over `registryOf` of the family, the deferred
 * actions recorded and never run, but for a probe of the commit's own
 * case, run through `runActions`.
 *
 * **Port.** `converge` and `commitConverged`.
 */

import { describe, expect, it } from 'vitest';
import type { InstallReport } from '../../../src/domain/contract/commands.js';
import {
  AGENT_HARNESS_TAG,
  type Adapter,
  type Tag,
  type Vertical,
} from '../../../src/domain/contract/composition.js';
import {
  emptyManifestV2,
  HARNESS_GENERATION,
  projectScopeRoot,
  type ManifestV2,
} from '../../../src/domain/contract/manifest.js';
import type { ManifestStore } from '../../../src/domain/contract/ports/manifest-store.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import { ContributionConflictError } from '../../../src/domain/core/apply.js';
import {
  compositionOf,
  convergeOf,
  grownManifest,
  type Composition,
  type ConvergeStep,
  type Placement,
} from '../../../src/domain/core/converge.js';
import {
  commitConverged,
  converge,
  type CommitDeps,
  type ConvergeDeps,
  type ConvergeInputs,
  type Converged,
  type ConvergingPlan,
} from '../../../src/domain/core/converge-run.js';
import { addedContext, CONTEXT_TAG } from '../../../src/domain/core/adapters/added-context.js';
import { growthOf } from '../../../src/domain/core/growth.js';
import { pluginOrigin, registryOf } from '../../../src/domain/core/registry.js';
import { DomainError, type Result } from '../../../src/domain/kernel/result.js';
import { FakeClock } from '../../../src/infrastructure/commons/fake-clock.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { FakeManifestStore } from '../../../src/infrastructure/manifest/fake.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { FakeTemplateSource } from '../../../src/infrastructure/template/fake.js';
import { FakeTree } from '../../../src/infrastructure/tree/fake.js';

/* ---- Scenario ---------------------------------------------------- */

const NOW = '2026-09-28T12:00:00Z';
const CWD = '/project';
const CLI: readonly Tag[] = ['arch.cli', 'arch.hexagonal', 'lang.acme', 'runtime.acme'];
const HTTP = 'arch.server-http';

const GUIDE = '.claude/skills/acme-guide/SKILL.md';
const NOTES = '.claude/skills/acme-notes/SKILL.md';
const OBSERVE = '.claude/skills/acme-observe/SKILL.md';
const ORDERS = '.claude/skills/acme-context-orders/SKILL.md';

function deferring(description: string) {
  return { id: description, description, run: () => Promise.resolve() };
}

function question(id: string, fallback: string) {
  return { id, prompt: `${id}?`, doc: '', default: fallback, memory: 'sticky' as const };
}

function adapter(
  vertical: string,
  name: string,
  requires: readonly Tag[],
  contribute: Adapter['contribute'],
  more: Partial<Adapter> = {},
): Adapter {
  return {
    id: `${vertical}/${name}`,
    vertical,
    covers: ['only'],
    predicate: { requires },
    contribute,
    ...more,
  };
}

function vertical(
  id: string,
  adapters: readonly Adapter[],
  more: Partial<Vertical> = {},
): Vertical {
  return { id, description: `the ${id} vertical`, dimensions: ['only'], adapters, ...more };
}

const skeleton = vertical('acme-skeleton', [
  adapter('acme-skeleton', 'cli', ['lang.acme', 'arch.cli'], () => ({
    files: [{ path: 'cli.txt', content: 'cli\n' }],
    actions: [deferring('acme fetch')],
  })),
  adapter('acme-skeleton', 'http', ['lang.acme', HTTP], () => ({
    files: [{ path: 'http.txt', content: 'http\n' }],
    actions: [deferring('acme serve')],
  })),
]);

/** Its guide names the entrypoints the project has, so growing one re-renders it. */
const harness = vertical(
  'agent-harness',
  [
    adapter(
      'agent-harness',
      'kit',
      ['lang.acme'],
      (ctx) => ({
        tagsAdd: [AGENT_HARNESS_TAG],
        skills: [
          {
            name: 'acme-guide',
            description: 'Run the acme project.',
            body: `Run ${['arch.cli', HTTP]
              .filter((tag) => ctx.manifest.tags.includes(tag))
              .join(' and ')}.`,
          },
        ],
      }),
      { questions: [question('tone', 'plain')] },
    ),
  ],
  { promotes: [AGENT_HARNESS_TAG], skills: ['acme-guide'] },
);

const notes = vertical(
  'acme-notes',
  [
    adapter(
      'acme-notes',
      'main',
      ['lang.acme'],
      () => ({
        actions: [deferring('acme notes')],
        skills: [{ name: 'acme-notes', description: 'Keep notes.', body: 'Write them down.' }],
      }),
      { questions: [question('depth', 'brief')] },
    ),
  ],
  { skills: ['acme-notes'] },
);

const obs = vertical(
  'acme-obs',
  [
    adapter(
      'acme-obs',
      'main',
      ['lang.acme', HTTP],
      () => ({
        files: [{ path: 'obs.txt', content: 'obs\n' }],
        actions: [deferring('acme obs')],
        skills: [{ name: 'acme-observe', description: 'Observe the server.', body: 'Watch it.' }],
      }),
      { questions: [question('shape', 'granular')] },
    ),
  ],
  { skills: ['acme-observe'] },
);

const metrics = vertical('acme-metrics', [
  adapter(
    'acme-metrics',
    'main',
    ['lang.acme'],
    () => ({ files: [{ path: 'metrics.txt', content: 'metrics\n' }] }),
    { questions: [question('depth', 'shallow')] },
  ),
]);

/** Rendered without the log and the metrics, which it reads. */
const deploy = vertical(
  'acme-deploy',
  [
    adapter('acme-deploy', 'main', ['lang.acme'], () => ({
      files: [{ path: 'deploy.txt', content: 'deploy\n' }],
    })),
  ],
  { reads: ['acme-log', 'acme-metrics'] },
);

/** Appends a line on every application: re-rendered, it cannot tell its own line from a user's. */
const log = vertical('acme-log', [
  adapter('acme-log', 'main', ['lang.acme'], () => ({
    patches: [{ target: 'log.txt', seed: '', apply: (text: string) => `${text}logged\n` }],
  })),
]);

/**
 * The family's own context vertical, under the id `keel add module`
 * records: the harness retrofit replays each recorded context through
 * it, and its adapter writes a skill naming the context.
 */
const context = vertical(
  'bounded-context',
  [
    adapter('bounded-context', 'acme', ['lang.acme', CONTEXT_TAG], (ctx) => ({
      skills: [
        {
          name: `acme-context-${addedContext(ctx.manifest, 'bounded-context/acme').name}`,
          description: 'Work in the context.',
          body: 'Keep to its seam.',
        },
      ],
    })),
  ],
  { skills: ['acme-context-orders'] },
);

/** Writes the file the CLI bootstrap writes. */
const clash = vertical('acme-clash', [
  adapter('acme-clash', 'main', ['lang.acme'], () => ({
    files: [{ path: 'cli.txt', content: 'mine\n' }],
  })),
]);

function preset(id: string, entrypoints: readonly Tag[], verticals: readonly Vertical[]): Stack {
  return {
    id,
    description: `the ${id} preset`,
    tags: ['lang.acme', 'runtime.acme', 'arch.hexagonal', ...entrypoints],
    verticals,
    ...(entrypoints.includes(HTTP) ? { projects: ['peer.api.rest'] } : {}),
  };
}

const family = registryOf([
  {
    origin: pluginOrigin('acme'),
    verticals: [skeleton, harness, notes, obs, metrics, deploy, log, clash, context],
    stacks: [
      preset('acme-cli', ['arch.cli'], [skeleton, harness, notes]),
      preset('acme-cli-http', ['arch.cli', HTTP], [skeleton, harness, obs, notes]),
    ],
  },
]);

/** An empty manifest on `tags`, stamped with no harness generation yet. */
function seed(tags: readonly Tag[] = CLI): ManifestV2 {
  return { ...emptyManifestV2(NOW, '0.5.0-alpha'), tags: [...tags], harnessGeneration: 0 };
}

const APPENDED: Placement = { rows: 'append', harness: 'run' };
const AT_TWIN: Placement = { rows: 'twin', harness: 'twin' };

const install = (v: Vertical): ConvergeStep => ({ vertical: v, posture: 'install' });
const rerender = (v: Vertical): ConvergeStep => ({ vertical: v, posture: 'rerender' });
const settle = (v: Vertical): ConvergeStep => ({ vertical: v, posture: 'settle' });
const only = (v: Vertical, adapters: readonly string[], settles: boolean): ConvergeStep => ({
  vertical: v,
  posture: 'only',
  adapters,
  ...(settles ? { settles: true as const } : {}),
});

/** A plan of `steps` on `manifest`, placed as `placement` says, its target read off `manifest`. */
function planOf(
  manifest: ManifestV2,
  steps: readonly ConvergeStep[],
  placement: Placement = APPENDED,
  target: Partial<Composition> = {},
): ConvergingPlan {
  return {
    kind: 'converges',
    target: { ...compositionOf(family, manifest), ...target },
    run: steps,
    modules: [],
    placement,
  };
}

/* ---- Factory ----------------------------------------------------- */

/** What the ports touch: files on disk, and manifests. */
class World {
  readonly files = new Map<string, Buffer>();
  readonly manifests = new FakeManifestStore();

  /** A Tree over the disk, as a run opens one. */
  open(): FakeTree {
    const tree = new FakeTree();
    for (const [at, bytes] of this.files) tree.seed(at, bytes);
    return tree;
  }

  /** What `tree` committed, written back to the disk. */
  keep(tree: FakeTree): void {
    for (const change of tree.committed ?? []) {
      const bytes = tree.read(change.path);
      if (change.kind === 'delete' || bytes === null) this.files.delete(change.path);
      else this.files.set(change.path, bytes);
    }
  }

  read(at: string): string | null {
    return this.files.get(at)?.toString('utf8') ?? null;
  }

  ports(): ConvergeDeps {
    return {
      registry: family,
      trees: () => this.open(),
      clock: new FakeClock(NOW),
      prompt: rejectingPrompt,
      logger: new FakeLogger(),
      templates: new FakeTemplateSource(),
      processes: new FakeProcessRunner(),
    };
  }

  /** The commit's ports, its deferred actions handed to `runDeferred` and never run. */
  committing(
    manifests: ManifestStore = this.manifests,
    runDeferred: CommitDeps['runDeferred'] = () => Promise.resolve(),
  ): CommitDeps {
    return { manifests, logger: new FakeLogger(), processes: new FakeProcessRunner(), runDeferred };
  }

  /** `plan` run onto `stored` over a Tree of the disk, as a caller with nothing to say runs it. */
  run(
    stored: ManifestV2,
    plan: ConvergingPlan,
    more: Partial<Omit<ConvergeInputs, keyof ConvergeDeps>> = {},
  ): Promise<Result<Converged>> {
    return converge({
      ...this.ports(),
      plan,
      stored,
      tree: this.open(),
      cwd: CWD,
      answers: {},
      interactive: false,
      dryRun: false,
      subject: 'acme',
      retrofit: { contexts: true },
      proposeForLater: false,
      notes: { before: [], after: [] },
      ...more,
    });
  }

  /** A project of `verticals` on `tags`, installed by one run and committed. */
  async scaffold(verticals: readonly Vertical[], tags: readonly Tag[] = CLI): Promise<ManifestV2> {
    const empty = seed(tags);
    const run = ok(await this.run(empty, planOf(empty, verticals.map(install))));
    await commitConverged(this.committing(), run);
    this.keep(run.tree as FakeTree);
    const manifest = await this.manifests.read(projectScopeRoot(CWD));
    if (manifest === null) throw new Error('the scaffold recorded no manifest');
    return manifest;
  }
}

function ok<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`expected Ok, got ${result.error.code}: ${result.error.message}`);
  return result.value;
}

function refused<T>(result: Result<T>): DomainError {
  if (result.ok) throw new Error('expected a refusal, got Ok');
  return result.error;
}

const ids = (rows: readonly { readonly id: string }[]) => rows.map(({ id }) => id);
const targets = (manifest: ManifestV2) => manifest.entries.map(({ target }) => target);
const changed = (report: InstallReport) => report.changes.map((c) => `${c.kind} ${c.path}`);

/* ---- The run ----------------------------------------------------- */

describe('converge: the steps, in their postures', () => {
  it('installs each step whole, in run order, recording what is new after what is recorded, and restamps the harness it ran', async () => {
    const world = new World();
    const stored = seed();
    const run = ok(
      await world.run(stored, planOf(stored, [skeleton, harness, notes].map(install))),
    );

    expect(changed(run.report)).toEqual([`create ${GUIDE}`, `create ${NOTES}`, 'create cli.txt']);
    expect(run.report).toMatchObject({ subject: 'acme', committed: true });
    expect(run.report.actions).toEqual(['acme fetch', 'acme notes']);
    expect(run.report.resolvedAdapters?.map(({ id }) => id)).toEqual([
      'acme-skeleton/cli',
      'agent-harness/kit',
      'acme-notes/main',
    ]);
    expect(run.report.notes).toBeUndefined();
    expect(run.report.diffs).toBeUndefined();
    expect(ids(run.manifest.verticals)).toEqual(['acme-skeleton', 'agent-harness', 'acme-notes']);
    expect(Object.keys(run.manifest.answers)).toEqual(['agent-harness/kit', 'acme-notes/main']);
    expect(targets(run.manifest)).toEqual([GUIDE, NOTES]);
    expect(run.manifest.harnessGeneration).toBe(HARNESS_GENERATION);
    expect(run.actions.map((a) => a.description)).toEqual(['acme fetch', 'acme notes']);
    // Staged, and nothing committed.
    expect((run.tree as FakeTree).committed).toBeNull();
    expect(world.files.size).toBe(0);
  });

  it('realizes no harness element where the project has no harness, counting what it skipped, and restamps nothing', async () => {
    const world = new World();
    const stored = seed();
    const run = ok(await world.run(stored, planOf(stored, [skeleton, notes].map(install))));

    expect(changed(run.report)).toEqual(['create cli.txt']);
    expect(run.report.skippedHarnessElements).toBe(1);
    expect(run.manifest.entries).toEqual([]);
    expect(run.manifest.harnessGeneration).toBe(0);
  });

  it('installs only the adapters an `only` step names — the rest replayed for their actions where it settles — and a settled step for its actions alone', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes]);
    const from = { ...stored, tags: [...stored.tags, HTTP].sort() };

    const settling = ok(
      await world.run(
        stored,
        planOf(from, [only(skeleton, ['acme-skeleton/http'], true), settle(notes)]),
        { from },
      ),
    );
    expect(changed(settling.report)).toEqual(['create http.txt']);
    expect(settling.report.actions).toEqual(['acme fetch', 'acme serve', 'acme notes']);
    expect(settling.report.resolvedAdapters?.map(({ id }) => id)).toEqual(['acme-skeleton/http']);
    expect(ids(settling.manifest.verticals)).toEqual(ids(stored.verticals));
    expect(settling.manifest.answers).toEqual(stored.answers);

    const alone = ok(
      await world.run(stored, planOf(from, [only(skeleton, ['acme-skeleton/http'], false)]), {
        from,
      }),
    );
    expect(changed(alone.report)).toEqual(['create http.txt']);
    expect(alone.report.actions).toEqual(['acme serve']);
  });

  it('re-renders a step from what the manifest records, reporting the diff of the file it puts back, and replays what did not run into the harness', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes]);
    const shipped = world.read(GUIDE);
    world.files.set(GUIDE, Buffer.from(`${shipped ?? ''}A hand edit.\n`));

    const run = ok(
      await world.run({ ...stored, harnessGeneration: 0 }, planOf(stored, [rerender(harness)])),
    );

    expect(run.tree.read(GUIDE)?.toString('utf8')).toBe(shipped);
    const diff = run.report.diffs?.find(({ path }) => path === GUIDE)?.diff ?? '';
    expect(diff).toContain('-A hand edit.');
    // The notes did not run: the retrofit replays their skill, as it is.
    expect(run.tree.read(NOTES)?.toString('utf8')).toBe(world.read(NOTES));
    expect(targets(run.manifest)).toEqual([GUIDE, NOTES]);
    expect(run.manifest.harnessGeneration).toBe(HARNESS_GENERATION);
    expect(run.report.actions).toEqual([]);
  });

  it('runs growth’s plan as `keel add entrypoint` does: the newly matching adapter, the harness re-rendered, what the twin lacks, the rest settled — recorded where the twin records it', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes]);
    const growth = growthOf(family, stored, 'http');
    if (growth.kind !== 'grows') throw new Error(`expected growth, got ${growth.kind}`);
    const plan = convergeOf(family, stored, { kind: 'entrypoint', word: 'http' });
    if (plan.kind !== 'converges') throw new Error('expected a plan');
    expect(plan.run.map((step) => `${step.vertical.id} ${step.posture}`)).toEqual([
      'acme-skeleton only',
      'agent-harness rerender',
      'acme-obs install',
      'acme-notes settle',
    ]);
    expect(plan.placement).toEqual(AT_TWIN);
    const from = grownManifest(stored, growth);

    const grown = ok(await world.run(stored, plan, { from }));
    expect(grown.report.actions).toEqual(['acme fetch', 'acme serve', 'acme obs', 'acme notes']);
    expect(grown.tree.read(GUIDE)?.toString('utf8')).toContain(
      'Run arch.cli and arch.server-http.',
    );
    expect(grown.report.diffs?.map(({ path }) => path)).toContain(GUIDE);
    expect(ids(grown.manifest.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-obs',
      'acme-notes',
    ]);
    expect(Object.keys(grown.manifest.answers)).toEqual([
      'agent-harness/kit',
      'acme-obs/main',
      'acme-notes/main',
    ]);
    expect(targets(grown.manifest)).toEqual([GUIDE, OBSERVE, NOTES]);

    // The same run appended: after every recorded row, key and entry.
    const appended = ok(
      await world.run(
        stored,
        { ...plan, placement: APPENDED },
        { from: grownManifest(stored, growth) },
      ),
    );
    expect(ids(appended.manifest.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-notes',
      'acme-obs',
    ]);
    expect(Object.keys(appended.manifest.answers)).toEqual([
      'agent-harness/kit',
      'acme-notes/main',
      'acme-obs/main',
    ]);
    expect(targets(appended.manifest)).toEqual([GUIDE, NOTES, OBSERVE]);
    // Where a row is recorded moves no file.
    expect(appended.report.changes).toEqual(grown.report.changes);
  });
});

describe('converge: the harness, realized in the placement’s order', () => {
  // One run of the four, the notes before the observability; the twin
  // lists the observability first.
  const stored = seed([...CLI, HTTP].sort());
  const steps = [skeleton, harness, notes, obs].map(install);
  const twin = { preset: 'acme-cli-http', harness: true };

  it('in the twin’s order, where each adapter ranks by where its vertical runs in the twin', async () => {
    const run = ok(
      await new World().run(
        stored,
        planOf(stored, steps, { rows: 'append', harness: 'twin' }, twin),
      ),
    );
    expect(targets(run.manifest)).toEqual([GUIDE, OBSERVE, NOTES]);
    expect(ids(run.manifest.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-notes',
      'acme-obs',
    ]);
  });

  it('in the run’s order otherwise, whatever order the rows are recorded in', async () => {
    const run = ok(
      await new World().run(stored, planOf(stored, steps, { rows: 'twin', harness: 'run' }, twin)),
    );
    expect(targets(run.manifest)).toEqual([GUIDE, NOTES, OBSERVE]);
    expect(ids(run.manifest.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-obs',
      'acme-notes',
    ]);
  });
});

describe('converge: the harness retrofit', () => {
  it('replays the contexts the project records where the caller says so, and none where its run wires them itself', async () => {
    const world = new World();
    const scaffolded = await world.scaffold([skeleton, harness, notes]);
    const stored = { ...scaffolded, modules: [{ name: 'orders', installedAt: NOW, seam: true }] };
    const plan = planOf(stored, [rerender(harness)]);

    const adopting = ok(await world.run(stored, plan, { retrofit: { contexts: true } }));
    expect(changed(adopting.report)).toContain(`create ${ORDERS}`);
    expect(targets(adopting.manifest)).toEqual([GUIDE, NOTES, ORDERS]);

    const growing = ok(await world.run(stored, plan, { retrofit: { contexts: false } }));
    expect(growing.tree.exists(ORDERS)).toBe(false);
    expect(targets(growing.manifest)).toEqual([GUIDE, NOTES]);
  });

  it('realizes and records a context’s element, which the twin ranks nothing of, after every ranked one', async () => {
    const world = new World();
    const scaffolded = await world.scaffold([skeleton, harness, notes]);
    const stored = { ...scaffolded, modules: [{ name: 'orders', installedAt: NOW, seam: true }] };

    const run = ok(
      await world.run(stored, planOf(stored, [rerender(harness)], AT_TWIN), {
        retrofit: { contexts: true },
      }),
    );

    expect(targets(run.manifest)).toEqual([GUIDE, NOTES, ORDERS]);
  });
});

describe('converge: a conflict a contribution cannot settle', () => {
  it('is a refused re-render where anything re-rendered, naming what it re-rendered', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, log]);
    const error = refused(await world.run(stored, planOf(stored, [rerender(log)])));
    expect(error.code).toBe('keel.reapply-conflict');
    expect(error.message).toBe(
      "reapply of 'acme-log' refused: adapter 'acme-log/main': reapplying its patch would change 'log.txt' — without a recorded base a changed result cannot be told apart from a double application; update the file by hand",
    );
  });

  it('names what it re-rendered in the order the project records it, whatever order it ran in', async () => {
    // `keel add --refresh` re-renders in the order the planner installs,
    // and has always named a refused re-render in the recorded one.
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, log]);
    const plan = (on: ManifestV2) => planOf(on, [rerender(log), rerender(notes)]);
    const named = /^reapply of '([^:]*)' refused: /;

    const recorded = refused(await world.run(stored, plan(stored)));
    expect(recorded.code).toBe('keel.reapply-conflict');
    expect(recorded.message.match(named)?.[1]).toBe("acme-notes', 'acme-log");

    // One the manifest does not record is still named, after the rest.
    const unrecorded = {
      ...stored,
      verticals: stored.verticals.filter(({ id }) => id !== 'acme-log'),
    };
    const after = refused(await world.run(unrecorded, plan(unrecorded)));
    expect(after.message.match(named)?.[1]).toBe("acme-notes', 'acme-log");
  });

  it('is thrown as it is where nothing re-rendered', async () => {
    const stored = seed();
    const failure = await new World()
      .run(stored, planOf(stored, [skeleton, clash].map(install)))
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(failure).toBeInstanceOf(ContributionConflictError);
    expect((failure as ContributionConflictError).kind).toBe('overwrite');
  });
});

describe('converge: the caller’s answer check', () => {
  /** A project recording a vertical no plugin loaded provides any more. */
  async function orphaned(world: World): Promise<ManifestV2> {
    const stored = await world.scaffold([skeleton, harness, notes]);
    return { ...stored, verticals: [...stored.verticals, { id: 'acme-gone', installedAt: NOW }] };
  }
  const answers = { 'acme-metrics/main': { depth: 'deep' } };

  it('reads the staged run — what it resolved and what it read — and its refusal wins before the harness pass', async () => {
    const world = new World();
    const stored = await orphaned(world);
    const held = new DomainError('held by the caller', 'keel.unknown-answer');
    const seen: string[] = [];
    const result = await world.run(stored, planOf(stored, [rerender(harness), install(metrics)]), {
      answers,
      retrofit: { line: 'keel add entrypoint http', contexts: false },
      check: (staged) => {
        seen.push(...staged.adapters.map(({ id }) => id));
        seen.push(...staged.reads.map((read) => `${read.key} ${read.question}`));
        return held;
      },
    });
    expect(refused(result)).toBe(held);
    expect(seen).toEqual(['agent-harness/kit', 'acme-metrics/main', 'acme-metrics/main depth']);
  });

  it('lets the harness pass run where it holds, which names the caller’s command line to re-run', async () => {
    const world = new World();
    const stored = await orphaned(world);
    const failure = await world
      .run(stored, planOf(stored, [rerender(harness), install(metrics)]), {
        answers,
        retrofit: { line: 'keel add entrypoint http', contexts: false },
        check: () => null,
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe('keel.missing-harness-contributor');
    expect((failure as DomainError).message).toContain("re-run 'keel add entrypoint http'");
  });
});

describe('converge: refresh proposals', () => {
  async function proposing(proposeForLater: boolean, dryRun: boolean) {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, deploy]);
    return ok(
      await world.run(stored, planOf(stored, [install(metrics)]), {
        proposeForLater,
        dryRun,
        notes: { before: ['the caller’s first'], after: ['the caller’s last'] },
      }),
    ).report;
  }
  const later =
    "refresh proposed: Acme deploy reads Acme metrics, which it was rendered without — re-render it with 'keel add acme-deploy --reapply'";

  it('names what reads a vertical the run installs, between the caller’s notes, worded as a later run takes it up', async () => {
    const report = await proposing(true, true);
    expect(report.refreshProposals).toEqual([{ vertical: 'acme-deploy', reads: ['acme-metrics'] }]);
    expect(report.notes).toEqual(['the caller’s first', later, 'the caller’s last']);
    expect(report.committed).toBe(false);
  });

  it('is worded as this run could take it up where the caller says so, whether it commits or not', async () => {
    const now = [
      'the caller’s first',
      "refresh proposed: Acme deploy reads Acme metrics, which it was rendered without — re-render it in this run with --refresh acme-deploy, or afterwards with 'keel add acme-deploy --reapply'",
      'the caller’s last',
    ];
    expect((await proposing(false, true)).notes).toEqual(now);
    expect((await proposing(false, false)).notes).toEqual(now);
    expect((await proposing(true, false)).notes).toEqual([
      'the caller’s first',
      later,
      'the caller’s last',
    ]);
  });

  it('lists what it reads among the verticals the run installs in run order, as they install', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, deploy]);
    const run = ok(
      await world.run(stored, planOf(stored, [install(metrics), install(log)]), {
        proposeForLater: true,
      }),
    );
    expect(run.report.refreshProposals).toEqual([
      { vertical: 'acme-deploy', reads: ['acme-metrics', 'acme-log'] },
    ]);
    expect(run.report.notes).toEqual([
      "refresh proposed: Acme deploy reads Acme metrics and Acme log, which it was rendered without — re-render it with 'keel add acme-deploy --reapply'",
    ]);
  });

  it('proposes an installed vertical whose adapters the run’s tags change, read before on the recorded tags and after on the run’s, and none that ran', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes]);
    const from = { ...stored, tags: [...stored.tags, HTTP].sort() };

    const run = ok(await world.run(stored, planOf(from, [install(obs)]), { from }));
    expect(run.report.refreshProposals).toEqual([
      {
        vertical: 'acme-skeleton',
        reads: [],
        adapters: {
          before: ['acme-skeleton/cli'],
          after: ['acme-skeleton/cli', 'acme-skeleton/http'],
        },
      },
    ]);

    const grew = ok(
      await world.run(
        stored,
        planOf(from, [only(skeleton, ['acme-skeleton/http'], false), install(obs)]),
        { from },
      ),
    );
    expect(grew.report.refreshProposals).toBeUndefined();
  });

  it('proposes nothing for what reads a vertical the run re-renders rather than installs', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, metrics, deploy]);
    const run = ok(await world.run(stored, planOf(stored, [rerender(metrics)])));
    expect(run.report.refreshProposals).toBeUndefined();
    expect(run.report.notes).toBeUndefined();
  });
});

/* ---- The commit -------------------------------------------------- */

describe('commitConverged', () => {
  it('commits the tree, then records the manifest at the project scope, then runs the deferred actions', async () => {
    const world = new World();
    const stored = seed();
    const run = ok(await world.run(stored, planOf(stored, [skeleton, notes].map(install))));
    const tree = run.tree as FakeTree;
    const events: string[] = [];
    const manifests: ManifestStore = {
      read: (root) => world.manifests.read(root),
      write: (root, manifest) => {
        events.push(
          `manifest at ${root}, ${tree.committed === null ? 'uncommitted' : 'committed'}`,
        );
        return world.manifests.write(root, manifest);
      },
    };
    const ran: CommitDeps['runDeferred'] = (inputs) => {
      events.push(
        `actions in ${inputs.cwd}: ${inputs.actions.map((a) => a.description).join(', ')}`,
      );
      return Promise.resolve();
    };

    await commitConverged(world.committing(manifests, ran), run);

    expect(events).toEqual([
      `manifest at ${projectScopeRoot(CWD)}, committed`,
      `actions in ${CWD}: acme fetch, acme notes`,
    ]);
    expect(tree.committed?.map((c) => c.path)).toEqual(['cli.txt']);
    expect(await world.manifests.read(projectScopeRoot(CWD))).toEqual(run.manifest);
  });

  it('runs the deferred actions for real: its runner is handed no dry run, and without one each action runs', async () => {
    const world = new World();
    const stored = seed();
    const ran: string[] = [];
    const probe = {
      id: 'probe',
      description: 'probe',
      run: () => {
        ran.push('probe');
        return Promise.resolve();
      },
    };

    const handed: boolean[] = [];
    const first = ok(await world.run(stored, planOf(stored, [install(skeleton)])));
    await commitConverged(
      world.committing(world.manifests, (inputs) => {
        handed.push(inputs.dryRun);
        return Promise.resolve();
      }),
      { ...first, actions: [probe] },
    );
    expect(handed).toEqual([false]);
    expect(ran).toEqual([]);

    const second = ok(await world.run(stored, planOf(stored, [install(skeleton)])));
    await commitConverged(
      { manifests: world.manifests, logger: new FakeLogger(), processes: new FakeProcessRunner() },
      { ...second, actions: [probe] },
    );
    expect(ran).toEqual(['probe']);
  });
});
