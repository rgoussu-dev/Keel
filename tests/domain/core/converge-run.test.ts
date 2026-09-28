/**
 * The converge run (`src/domain/core/converge-run.ts`): a plan
 * `convergeOf` read, staged onto a Tree and reported, committing
 * nothing — and the one commit after it. Its callers are `keel add
 * entrypoint`, which the growth grid holds to its twin byte for byte
 * (I10), `keel add`, `keel add module` and, since S.6, `keel new`;
 * this holds each part of the run on a family small enough
 * to read: each posture, the three placements — at the twin's rank, at
 * the reference order's (S.8: where one run of the target records each
 * row, answers key and harness entry, found without replaying the
 * project, so a recorded vertical no loaded plugin provides, or one the
 * run's tags no longer cover, ranks nowhere rather than refusing the
 * run) and appended — the harness realized in each
 * order, an element the twin ranks nothing of, the retrofit with and
 * without the recorded contexts — which never replays the family's
 * `bounded-context` — a re-render within the recorded composition,
 * which puts back what the rest patched into the files it rewrites, a
 * conflict read as a refused re-render naming what re-rendered in the
 * order the project records it, what a re-render moved a vertical off
 * and leaves in place (S.9: an adapter that ran by its answers or a tag
 * it promoted, the files it wrote the project still holds), the caller's
 * answer check, the
 * refresh proposals — what they read, over what, in the caller's
 * words — `keel new`'s part as a caller from a seed manifest (the
 * scaffold posture, the preset's rules, the ownership it reads back,
 * what the run resolved and read, and its reading of a seed staged as
 * the engine realizing its own buffer stages it) — and the commit, its
 * deferred actions run for real.
 *
 * **Scenario.** The `acme` family: a skeleton with one bootstrap per
 * entrypoint, an agent harness whose guide speaks of the entrypoints,
 * notes, and an observability only a server takes — the CLI preset
 * carrying the first three, and the CLI + HTTP one all four, the
 * observability before the notes — beside extras: metrics, a log whose
 * patch appends a line on every application, a deploy vertical that
 * reads both, a vertical writing a file the skeleton writes, two that
 * patch it — one guarded, one appending on every application — a draft
 * whose one adapter a later vertical's tag rules out, and a context
 * vertical of the family's own, under the id `keel add module`
 * records. A project is scaffolded by the run itself onto an empty
 * manifest, and committed; each case varies the plan or the manifest
 * after it. The reference placement's cases build presets of their own
 * from the same pieces, beside verticals that each write a doc section,
 * and hold two runs to one byte for byte.
 *
 * **Factory.** The shipped fakes — an in-memory disk each `FakeTree`
 * opens seeded from and a commit writes back into, `FakeManifestStore`,
 * a pinned `FakeClock` — over `registryOf` of the family, the deferred
 * actions recorded and never run, but for a probe of the commit's own
 * case, run through `runActions`.
 *
 * **Port.** `converge` and `commitConverged` — and, for the case of a
 * seed staged byte for byte, `installVerticals` realizing its own
 * buffer, the engine `keel new` staged through before S.6.
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
import type { Registry } from '../../../src/domain/contract/ports/registry.js';
import { PathConflictError, RefusalError } from '../../../src/domain/contract/refusal.js';
import { markdownRegion, regionPatch } from '../../../src/domain/contract/region.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import { ContributionConflictError, newOwnership } from '../../../src/domain/core/apply.js';
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
import { installVerticals } from '../../../src/domain/core/install.js';
import { pluginOrigin, registryOf } from '../../../src/domain/core/registry.js';
import { projectScope } from '../../../src/domain/core/scope.js';
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
const DRAFT = '.claude/skills/acme-draft/SKILL.md';
const FINAL: Tag = 'acme.final';

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
 * records, its adapter writing a skill naming the context: the harness
 * retrofit never replays it, as that command never runs it.
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

/**
 * Its one adapter excludes the tag `final` promotes: run before it, it
 * writes its skill, and on the tags the run leaves it resolves nowhere,
 * so the twin's order ranks it nothing.
 */
const draft = vertical(
  'acme-draft',
  [
    adapter(
      'acme-draft',
      'main',
      ['lang.acme'],
      () => ({
        skills: [{ name: 'acme-draft', description: 'Draft it.', body: 'Draft it first.' }],
      }),
      { covers: [], predicate: { requires: ['lang.acme'], excludes: [FINAL] } },
    ),
  ],
  { dimensions: [], skills: ['acme-draft'] },
);

const final = vertical(
  'acme-final',
  [adapter('acme-final', 'main', ['lang.acme'], () => ({ tagsAdd: [FINAL] }))],
  { promotes: [FINAL] },
);

/**
 * Puts a line into the file the CLI bootstrap writes whole where it is
 * not there yet — its own fixed point — and writes a file of its own.
 */
const wire = vertical('acme-wire', [
  adapter(
    'acme-wire',
    'main',
    ['lang.acme', 'arch.cli'],
    (ctx) => ({
      files: [{ path: 'wire.txt', content: 'wire\n' }],
      patches: [
        {
          target: 'cli.txt',
          apply: (text: string) => {
            const line = `wired ${ctx.answer('depth')}\n`;
            return text.includes(line) ? text : `${text}${line}`;
          },
        },
      ],
      actions: [deferring('acme wire')],
    }),
    { questions: [question('depth', 'deep')] },
  ),
]);

/** Appends a line to the file the CLI bootstrap writes whole on every application: no fixed point. */
const tail = vertical('acme-tail', [
  adapter('acme-tail', 'main', ['lang.acme', 'arch.cli'], () => ({
    patches: [{ target: 'cli.txt', apply: (text: string) => `${text}tail\n` }],
  })),
]);

/** Writes a file of its own whole, rendered with the vertical that owns a region of it. */
const yfile = vertical(
  'acme-yfile',
  [
    adapter('acme-yfile', 'main', ['lang.acme'], () => ({
      files: [{ path: 'y.txt', content: 'y\n' }],
    })),
  ],
  { reads: ['acme-zreg'] },
);

/** Owns a region of the file `acme-yfile` writes whole: its own fixed point. */
const zreg = vertical('acme-zreg', [
  adapter('acme-zreg', 'main', ['lang.acme'], () => ({
    patches: [regionPatch({ target: 'y.txt', region: markdownRegion('zreg'), body: 'zreg\n' })],
  })),
]);

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
    verticals: [
      skeleton,
      harness,
      notes,
      obs,
      metrics,
      deploy,
      log,
      wire,
      tail,
      yfile,
      zreg,
      clash,
      draft,
      final,
      context,
    ],
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

  /** @param registry what the runs compose from: the family, unless a case builds its own. */
  constructor(readonly registry: Registry = family) {}

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
      registry: this.registry,
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
    const plan = planOf(
      empty,
      verticals.map(install),
      APPENDED,
      compositionOf(this.registry, empty),
    );
    const run = ok(await this.run(empty, plan));
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

describe('converge: recorded where one run of the target records it (S.8)', () => {
  // The notes' skill beside a map's doc: a pass realizes every skill
  // before any doc section, whatever order their contributors run in.
  const map = vertical('acme-map', [
    adapter(
      'acme-map',
      'main',
      ['lang.acme'],
      () => ({
        docs: [
          {
            directory: 'src',
            section: 'acme-map',
            description: 'Where the code lives.',
            body: 'Read it here.',
          },
        ],
      }),
      { questions: [question('scale', 'small')] },
    ),
  ]);
  const DOC = 'src/AGENTS.md';
  const POINTER = 'src/CLAUDE.md';
  const GONE = '.claude/skills/acme-gone/SKILL.md';
  const mapped = registryOf([
    {
      origin: pluginOrigin('acme'),
      verticals: [skeleton, harness, notes, map],
      stacks: [preset('acme-mapped', ['arch.cli'], [skeleton, harness, map, notes])],
    },
  ]);
  const ALL = [skeleton, harness, map, notes];

  /** `keel add` of `ids` onto what `world` holds, read as its handler reads it, and committed. */
  async function add(
    world: World,
    stored: ManifestV2,
    ids: readonly string[],
    placement?: Placement,
  ): Promise<ManifestV2> {
    const plan = convergeOf(world.registry, stored, {
      kind: 'add',
      verticals: ids,
      scope: projectScope(world.registry, stored),
    });
    if (plan.kind !== 'converges') throw new Error('expected a plan');
    expect(plan.placement).toEqual({ rows: 'reference', harness: 'reference' });
    const run = ok(
      await world.run(stored, placement === undefined ? plan : { ...plan, placement }),
    );
    await commitConverged(world.committing(), run);
    world.keep(run.tree as FakeTree);
    const manifest = await world.manifests.read(projectScopeRoot(CWD));
    if (manifest === null) throw new Error('the add recorded no manifest');
    // The run records its rows as the plan reads them.
    expect(manifest.verticals.map(({ id }) => id)).toEqual(plan.target.recorded);
    return manifest;
  }

  /** The project one run of the whole preset leaves: its files, and its manifest as written. */
  async function oneRun(): Promise<{ readonly world: World; readonly manifest: ManifestV2 }> {
    const world = new World(mapped);
    return { world, manifest: await world.scaffold(ALL) };
  }

  it('realizes an entry where one run does, by the stage the pass writes its file in and then its contributor’s rank — the harness not re-rendered', async () => {
    const one = await oneRun();
    expect(targets(one.manifest)).toEqual([GUIDE, NOTES, DOC, POINTER]);

    const later = new World(mapped);
    const stored = await later.scaffold([skeleton, harness, map]);
    expect(targets(stored)).toEqual([GUIDE, DOC, POINTER]);
    const added = await add(later, stored, ['acme-notes']);
    // The notes rank after the map, and their skill is still realized before its doc.
    expect(targets(added)).toEqual([GUIDE, NOTES, DOC, POINTER]);
    expect(JSON.stringify(added)).toBe(JSON.stringify(one.manifest));
    expect(later.files).toEqual(one.world.files);

    // Appended, as every caller but growth recorded before S.8: after every entry.
    const appended = new World(mapped);
    const base = await appended.scaffold([skeleton, harness, map]);
    const at = await add(appended, base, ['acme-notes'], { rows: 'append', harness: 'run' });
    expect(targets(at)).toEqual([GUIDE, DOC, POINTER, NOTES]);
    expect(appended.files).toEqual(later.files);
  });

  it('realizes an adopted harness in the reference order, so a doc it shares with a vertical run before it reads as one run writes it', async () => {
    // A base run before the harness, and the harness, each own a section of one doc.
    const section = (name: string) => ({
      directory: 'src',
      section: name,
      description: `The ${name} notes.`,
      body: `Kept by ${name}.`,
    });
    const base = vertical('acme-base', [
      adapter('acme-base', 'main', ['lang.acme'], () => ({ docs: [section('acme-base')] })),
    ]);
    const kit = vertical(
      'agent-harness',
      [
        adapter('agent-harness', 'kit', ['lang.acme'], () => ({
          tagsAdd: [AGENT_HARNESS_TAG],
          docs: [section('acme-kit')],
        })),
      ],
      { promotes: [AGENT_HARNESS_TAG] },
    );
    const shared = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, base, kit],
        stacks: [preset('acme-shared', ['arch.cli'], [skeleton, base, kit])],
      },
    ]);
    const one = new World(shared);
    const expected = await one.scaffold([skeleton, base, kit]);
    const doc = one.read(DOC) ?? '';
    expect(doc.indexOf('Kept by acme-base.')).toBeLessThan(doc.indexOf('Kept by acme-kit.'));

    const later = new World(shared);
    const stored = await later.scaffold([skeleton, base]);
    const adopted = await add(later, stored, ['agent-harness']);
    expect(later.read(DOC)).toBe(doc);
    expect(JSON.stringify(adopted)).toBe(JSON.stringify(expected));
    expect(later.files).toEqual(one.files);
  });

  it('ranks a doc’s pointer by the first contributor of its doc, among pointers the run does not realize', async () => {
    const documenting = (id: string, directory: string) =>
      vertical(id, [
        adapter(id, 'main', ['lang.acme'], () => ({
          docs: [
            { directory, section: id, description: `The ${id} notes.`, body: `Kept by ${id}.` },
          ],
        })),
      ]);
    const lib = documenting('acme-lib', 'lib');
    const app = documenting('acme-app', 'app');
    const two = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, harness, lib, app],
        stacks: [preset('acme-two', ['arch.cli'], [skeleton, harness, lib, app])],
      },
    ]);
    const one = new World(two);
    const expected = await one.scaffold([skeleton, harness, lib, app]);
    const pointers = ['lib/CLAUDE.md', 'app/CLAUDE.md'];
    expect(targets(expected).slice(-2)).toEqual(pointers);

    // The lib's doc arrives after the app's, whose pointer this run does not realize.
    const later = new World(two);
    const stored = await later.scaffold([skeleton, harness, app]);
    const added = await add(later, stored, ['acme-lib']);
    expect(targets(added).slice(-2)).toEqual(pointers);
    expect(JSON.stringify(added)).toBe(JSON.stringify(expected));
  });

  it('records a row and its answers key before the first recorded one the reference lists later', async () => {
    const one = await oneRun();
    const later = new World(mapped);
    const stored = await later.scaffold([skeleton, harness, notes]);
    const added = await add(later, stored, ['acme-map']);
    expect(ids(added.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-map',
      'acme-notes',
    ]);
    expect(Object.keys(added.answers)).toEqual([
      'agent-harness/kit',
      'acme-map/main',
      'acme-notes/main',
    ]);
    expect(JSON.stringify(added)).toBe(JSON.stringify(one.manifest));
    expect(later.files).toEqual(one.world.files);
  });

  it('adopts the harness where one run records it, realized in the reference order', async () => {
    const one = await oneRun();
    const later = new World(mapped);
    const stored = await later.scaffold([skeleton, map, notes]);
    expect(stored.entries).toEqual([]);
    const adopted = await add(later, stored, ['agent-harness']);
    expect(ids(adopted.verticals)).toEqual(ids(one.manifest.verticals));
    expect(JSON.stringify(adopted)).toBe(JSON.stringify(one.manifest));
    expect(later.files).toEqual(one.world.files);
  });

  it('refuses nothing new for a recorded vertical no loaded plugin provides, whose entry ranks nowhere and stays where it is', async () => {
    const world = new World(mapped);
    const scaffolded = await world.scaffold([skeleton, harness, map]);
    const stored: ManifestV2 = {
      ...scaffolded,
      verticals: [...scaffolded.verticals, { id: 'acme-gone', installedAt: NOW }],
      entries: [
        ...scaffolded.entries,
        {
          source: 'acme-gone/main',
          target: GONE,
          sha256Shipped: 'gone',
          sha256Current: 'gone',
          installedAt: NOW,
        },
      ],
    };
    await world.manifests.write(projectScopeRoot(CWD), stored);

    // A replay of the project would need it: the harness re-rendered is refused.
    const rerendered = convergeOf(mapped, stored, {
      kind: 'reapply',
      verticals: ['agent-harness'],
    });
    if (rerendered.kind !== 'converges') throw new Error('expected a plan');
    await expect(world.run(stored, rerendered)).rejects.toMatchObject({
      code: 'keel.missing-harness-contributor',
    });

    const added = await add(world, stored, ['acme-notes']);
    expect(ids(added.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-map',
      'acme-notes',
      'acme-gone',
    ]);
    expect(targets(added)).toEqual([GUIDE, NOTES, DOC, POINTER, GONE]);
  });

  it('refuses nothing new for a recorded vertical the tags the run leaves no longer resolve: it ranks nowhere, its refresh proposed as before', async () => {
    // Its one adapter covers its one dimension, and excludes the tag `final` promotes.
    const strict = vertical(
      'acme-strict',
      [
        adapter(
          'acme-strict',
          'main',
          ['lang.acme'],
          () => ({
            skills: [{ name: 'acme-strict', description: 'Keep it strict.', body: 'No finals.' }],
          }),
          { predicate: { requires: ['lang.acme'], excludes: [FINAL] } },
        ),
      ],
      { skills: ['acme-strict'] },
    );
    const STRICT = '.claude/skills/acme-strict/SKILL.md';
    const strictly = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, harness, notes, strict, final],
        stacks: [preset('acme-strict', ['arch.cli'], [skeleton, harness, strict])],
      },
    ]);
    const world = new World(strictly);
    const stored = await world.scaffold([skeleton, harness, strict]);
    expect(targets(stored)).toEqual([GUIDE, STRICT]);

    const plan = convergeOf(strictly, stored, {
      kind: 'add',
      verticals: ['acme-final'],
      scope: projectScope(strictly, stored),
    });
    if (plan.kind !== 'converges') throw new Error('expected a plan');
    expect(plan.placement).toEqual({ rows: 'reference', harness: 'reference' });
    const run = ok(await world.run(stored, plan));
    expect(run.report.refreshProposals).toEqual([
      {
        vertical: 'acme-strict',
        reads: [],
        adapters: { before: ['acme-strict/main'], after: [] },
      },
    ]);
    await commitConverged(world.committing(), run);
    world.keep(run.tree as FakeTree);
    expect(targets(run.manifest)).toEqual([GUIDE, STRICT]);

    // A project left so takes a later add, and a re-render of what left it so.
    const added = await add(world, run.manifest, ['acme-notes']);
    expect(targets(added)).toEqual([GUIDE, STRICT, NOTES]);
    const reapplied = convergeOf(strictly, added, { kind: 'reapply', verticals: ['acme-final'] });
    if (reapplied.kind !== 'converges') throw new Error('expected a plan');
    expect(targets(ok(await world.run(added, reapplied)).manifest)).toEqual(targets(added));
  });

  it('keeps harness entries an older keel recorded out of the reference order where they are', async () => {
    const world = new World(mapped);
    const scaffolded = await world.scaffold([skeleton, harness, map]);
    const stored: ManifestV2 = {
      ...scaffolded,
      entries: [
        ...scaffolded.entries.filter(({ target }) => target !== GUIDE),
        ...scaffolded.entries.filter(({ target }) => target === GUIDE),
      ],
    };
    expect(targets(stored)).toEqual([DOC, POINTER, GUIDE]);
    await world.manifests.write(projectScopeRoot(CWD), stored);
    const added = await add(world, stored, ['acme-notes']);
    // The new skill goes before the first recorded entry one run records after it; the guide stays last.
    expect(targets(added)).toEqual([NOTES, DOC, POINTER, GUIDE]);
  });

  it('keeps rows an older keel appended where they are, placing only the new one', async () => {
    const world = new World(mapped);
    const scaffolded = await world.scaffold([skeleton, harness, map]);
    // The harness adopted by an older keel, which appended it.
    const stored: ManifestV2 = {
      ...scaffolded,
      verticals: [
        ...scaffolded.verticals.filter(({ id }) => id !== 'agent-harness'),
        ...scaffolded.verticals.filter(({ id }) => id === 'agent-harness'),
      ],
    };
    await world.manifests.write(projectScopeRoot(CWD), stored);
    const added = await add(world, stored, ['acme-notes']);
    expect(ids(added.verticals)).toEqual([
      'acme-skeleton',
      'acme-map',
      'agent-harness',
      'acme-notes',
    ]);
    expect(Object.keys(added.answers).slice(0, -1)).toEqual(Object.keys(stored.answers));
    expect(targets(added).filter((target) => targets(stored).includes(target))).toEqual(
      targets(stored),
    );
  });

  it('writes a new row before bounded-context, which stays last', async () => {
    const world = new World(mapped);
    const scaffolded = await world.scaffold([skeleton, harness, map]);
    const stored: ManifestV2 = {
      ...scaffolded,
      verticals: [...scaffolded.verticals, { id: 'bounded-context', installedAt: NOW }],
    };
    await world.manifests.write(projectScopeRoot(CWD), stored);
    const added = await add(world, stored, ['acme-notes']);
    expect(ids(added.verticals)).toEqual([
      'acme-skeleton',
      'agent-harness',
      'acme-map',
      'acme-notes',
      'bounded-context',
    ]);
  });

  it('ranks a recorded pointer by the first of its doc’s contributors, not the last', async () => {
    const documenting = (id: string, directory: string) =>
      vertical(id, [
        adapter(id, 'main', ['lang.acme'], () => ({
          docs: [
            { directory, section: id, description: `The ${id} notes.`, body: `Kept by ${id}.` },
          ],
        })),
      ]);
    const early = documenting('acme-early', 'app');
    const lib = documenting('acme-lib', 'lib');
    const late = documenting('acme-late', 'app');
    const three = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, harness, early, lib, late],
        stacks: [preset('acme-three', ['arch.cli'], [skeleton, harness, early, lib, late])],
      },
    ]);
    const one = new World(three);
    const expected = await one.scaffold([skeleton, harness, early, lib, late]);
    expect(targets(expected).slice(-2)).toEqual(['app/CLAUDE.md', 'lib/CLAUDE.md']);

    // The lib's contributor runs between the app doc's two.
    const later = new World(three);
    const stored = await later.scaffold([skeleton, harness, early, late]);
    const added = await add(later, stored, ['acme-lib']);
    expect(JSON.stringify(added)).toBe(JSON.stringify(expected));
  });

  it('adopts a harness with a hook where one run records it: the script whole, then the settings, before any doc', async () => {
    const hooked = vertical(
      'agent-harness',
      [
        adapter('agent-harness', 'kit', ['lang.acme'], () => ({
          tagsAdd: [AGENT_HARNESS_TAG],
          skills: [{ name: 'acme-guide', description: 'Run the acme project.', body: 'Run it.' }],
          hooks: [
            {
              name: 'acme-gate',
              event: 'PreToolUse',
              script: '#!/bin/sh\necho gate\n',
              reminders: [],
            },
          ],
        })),
      ],
      { promotes: [AGENT_HARNESS_TAG], skills: ['acme-guide'], hooks: ['acme-gate'] },
    );
    const gated = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, hooked, map, notes],
        stacks: [preset('acme-gated', ['arch.cli'], [skeleton, hooked, map, notes])],
      },
    ]);
    const one = new World(gated);
    const expected = await one.scaffold([skeleton, hooked, map, notes]);
    expect(targets(expected)).toEqual([
      GUIDE,
      '.claude/hooks/acme-gate.sh',
      NOTES,
      '.claude/settings.json',
      DOC,
      POINTER,
    ]);

    const later = new World(gated);
    const stored = await later.scaffold([skeleton, map, notes]);
    const adopted = await add(later, stored, ['agent-harness']);
    expect(JSON.stringify(adopted)).toBe(JSON.stringify(expected));
    expect(later.files).toEqual(one.files);
  });

  it('records what a re-render newly writes where one run records it', async () => {
    const section = (directory: string) => ({
      directory,
      section: 'acme-map',
      description: 'Where the code lives.',
      body: 'Read it here.',
    });
    const both = vertical('acme-map', [
      adapter('acme-map', 'main', ['lang.acme'], () => ({
        docs: [section('src'), section('lib')],
      })),
    ]);
    const twice = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [skeleton, harness, notes, both],
        stacks: [preset('acme-mapped', ['arch.cli'], [skeleton, harness, both, notes])],
      },
    ]);
    const one = new World(twice);
    const expected = await one.scaffold([skeleton, harness, both, notes]);
    expect(targets(expected)).toEqual([
      GUIDE,
      NOTES,
      DOC,
      'lib/AGENTS.md',
      POINTER,
      'lib/CLAUDE.md',
    ]);

    // The map's lib doc, recorded by none: the re-render writes it anew.
    const world = new World(twice);
    const scaffolded = await world.scaffold([skeleton, harness, both, notes]);
    const stored: ManifestV2 = {
      ...scaffolded,
      entries: scaffolded.entries.filter(({ target }) => !target.startsWith('lib/')),
    };
    await world.manifests.write(projectScopeRoot(CWD), stored);
    world.files.delete('lib/AGENTS.md');
    world.files.delete('lib/CLAUDE.md');
    const plan = convergeOf(twice, stored, { kind: 'reapply', verticals: ['acme-map'] });
    if (plan.kind !== 'converges') throw new Error('expected a plan');
    expect(plan.placement).toEqual({ rows: 'reference', harness: 'reference' });
    const run = ok(await world.run(stored, plan));
    expect(targets(run.manifest)).toEqual(targets(expected));
  });
});

describe('converge: the harness retrofit', () => {
  it('never replays the bounded-context a registry lists, whether the caller replays the contexts or not', async () => {
    const world = new World();
    const scaffolded = await world.scaffold([skeleton, harness, notes]);
    const stored: ManifestV2 = {
      ...scaffolded,
      verticals: [...scaffolded.verticals, { id: 'bounded-context', installedAt: NOW }],
      modules: [
        { name: 'greeting', installedAt: NOW, seam: true },
        { name: 'orders', installedAt: NOW, seam: true },
      ],
    };
    const plan = planOf(stored, [rerender(harness)]);

    // An absence check alone: keel's own `bounded-context`, which the
    // setting replays or not, declares no harness element, so the two
    // settings write the same.
    for (const contexts of [true, false]) {
      const run = ok(await world.run(stored, plan, { retrofit: { contexts } }));
      expect(changed(run.report)).not.toContain(`create ${ORDERS}`);
      expect(run.tree.exists(ORDERS)).toBe(false);
      expect(targets(run.manifest)).toEqual([GUIDE, NOTES]);
    }
  });
});

describe('converge: an element the twin ranks nothing of', () => {
  it('is realized and recorded after every ranked one: an adapter that ran and that the tags the run leaves resolve nowhere', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes]);

    const run = ok(
      await world.run(
        stored,
        planOf(stored, [rerender(harness), install(draft), install(final)], AT_TWIN),
        { retrofit: { contexts: false } },
      ),
    );

    expect(changed(run.report)).toContain(`create ${DRAFT}`);
    expect(targets(run.manifest)).toEqual([GUIDE, NOTES, DRAFT]);
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

describe('converge: a re-render within the recorded composition', () => {
  /** `keel add <named> --reapply`'s plan on `stored`, as the reading makes it. */
  const reapplying = (stored: ManifestV2, named: readonly string[]): ConvergingPlan => {
    const plan = convergeOf(family, stored, { kind: 'reapply', verticals: named });
    if (plan.kind !== 'converges') throw new Error('the re-render was refused');
    return plan;
  };

  it('puts back what every other recorded vertical patched into a file it rewrites — one recorded before it too — and writes nothing else of them', async () => {
    const world = new World();
    const scaffolded = await world.scaffold([skeleton, harness, notes, wire]);
    expect(world.read('cli.txt')).toBe('cli\nwired deep\n');
    world.files.set('cli.txt', Buffer.from('cli\nwired deep\nedited by hand\n'));
    world.files.set('wire.txt', Buffer.from('mine\n'));
    // Recorded at rank, as growth records: first, though it came last.
    const stored: ManifestV2 = {
      ...scaffolded,
      verticals: [
        ...scaffolded.verticals.filter(({ id }) => id === 'acme-wire'),
        ...scaffolded.verticals.filter(({ id }) => id !== 'acme-wire'),
      ],
    };

    const run = ok(await world.run(stored, reapplying(stored, ['acme-skeleton'])));

    expect(run.tree.read('cli.txt')?.toString('utf8')).toBe('cli\nwired deep\n');
    expect(changed(run.report)).toEqual(['modify cli.txt']);
    expect(run.report.diffs?.map(({ path }) => path)).toEqual(['cli.txt']);
    expect(run.report.diffs?.[0]?.diff).toContain('-edited by hand');
    // A whole file another vertical owns is left as the user left it,
    // and the replay queues, resolves and records nothing of it.
    expect(run.tree.read('wire.txt')?.toString('utf8')).toBe('mine\n');
    expect(run.report.actions).toEqual(['acme fetch']);
    expect(run.report.resolvedAdapters?.map(({ id }) => id)).toEqual(['acme-skeleton/cli']);
    expect(ids(run.manifest.verticals)).toEqual(ids(stored.verticals));
    expect(run.manifest.answers).toEqual(stored.answers);
  });

  it('refuses, as keel.reapply-conflict naming what it re-rendered, a patch that cannot be put back as it was', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, tail]);
    expect(world.read('cli.txt')).toBe('cli\ntail\n');

    const error = refused(await world.run(stored, reapplying(stored, ['acme-skeleton'])));
    expect(error.code).toBe('keel.reapply-conflict');
    expect(error.message).toBe(
      "reapply of 'acme-skeleton' refused: adapter 'acme-tail/main': reapplying its patch would change 'cli.txt' — without a recorded base a changed result cannot be told apart from a double application; update the file by hand",
    );
    expect(world.read('cli.txt')).toBe('cli\ntail\n');
  });

  it('puts back a region that a vertical installed ahead of a --refresh re-render owns in the file it rewrites, as the add alone leaves it', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, yfile]);
    const adding = (refresh: readonly string[]): ConvergingPlan => {
      const plan = convergeOf(family, stored, {
        kind: 'add',
        verticals: ['acme-zreg'],
        refresh,
        scope: projectScope(family, stored, refresh),
      });
      if (plan.kind !== 'converges') throw new Error('the add was refused');
      return plan;
    };
    const alone = ok(await world.run(stored, adding([])));
    expect(alone.report.refreshProposals).toEqual([
      { vertical: 'acme-yfile', reads: ['acme-zreg'] },
    ]);

    // The planner installs the region's owner ahead of the re-render,
    // which claims it; its replay after claims it once more, its own.
    const plan = adding(['acme-yfile']);
    expect(plan.run.map(({ vertical, posture }) => `${vertical.id} ${posture}`)).toEqual([
      'acme-zreg install',
      'acme-yfile rerender',
      'acme-skeleton replay',
      'agent-harness replay',
      'acme-notes replay',
      'acme-zreg replay',
    ]);
    const run = ok(await world.run(stored, plan));
    expect(run.tree.read('y.txt')?.toString('utf8')).toBe(
      alone.tree.read('y.txt')?.toString('utf8'),
    );
    expect(run.tree.read('y.txt')?.toString('utf8')).toContain('zreg\n');
    expect(changed(run.report)).toEqual(changed(alone.report));
  });

  it('replays onto nothing where the re-render rewrites no whole file, so such a patch is never reached', async () => {
    const world = new World();
    const stored = await world.scaffold([skeleton, harness, notes, tail]);

    const run = ok(await world.run(stored, reapplying(stored, ['agent-harness'])));
    expect(changed(run.report)).toEqual([]);
    expect(run.tree.read('cli.txt')?.toString('utf8')).toBe('cli\ntail\n');
  });
});

describe('converge: what a re-render moved off, and leaves in place (S.9)', () => {
  const IMAGE: Tag = 'acme.image';
  const NATIVE: Tag = 'acme.native';
  const SIGNED: Tag = 'acme.signed';

  /** Promotes the image a later ship adapter releases. */
  const imaging = vertical(
    'acme-image',
    [adapter('acme-image', 'main', ['lang.acme'], () => ({ tagsAdd: [IMAGE] }))],
    { promotes: [IMAGE] },
  );

  /** What the binary adapter records of itself, and whether it renders only where no image is. */
  interface Binary {
    readonly asks: boolean;
    readonly promotes: boolean;
    readonly strict?: boolean;
  }

  /**
   * How a case bends the ship vertical, each part absent as the cases
   * before it ship it: its id (`acme-ship`, whose files are under
   * `ship/`); the tags its binary adapter promotes where it promotes
   * (`[NATIVE]`); the share that adapter declares (those tags, or none
   * where it promotes none) and the image adapter's (none), or `union`,
   * declaring none and so promoting the vertical's; that union
   * (`[NATIVE]`); and the paths the binary adapter writes.
   */
  interface Shape {
    readonly id?: string;
    readonly tags?: readonly Tag[];
    readonly share?: readonly Tag[] | 'union';
    readonly imageShare?: readonly Tag[] | 'union';
    readonly union?: readonly Tag[];
    readonly paths?: readonly string[];
  }

  const declared = (share: readonly Tag[] | 'union') =>
    share === 'union' ? {} : { promotes: share };

  /**
   * Ships binaries until an image arrives, then the image: the binary
   * adapter writes two files, one of which the image's writes too, and
   * records what `binary` says of it — an answer, a promoted tag, both
   * or neither.
   */
  function shipping(binary: Binary, shape: Shape = {}): Vertical {
    const id = shape.id ?? 'acme-ship';
    const dir = id.replace(/^acme-/, '');
    const tags = binary.promotes ? (shape.tags ?? [NATIVE]) : [];
    return vertical(
      id,
      [
        adapter(
          id,
          'binary',
          ['lang.acme'],
          (ctx) => {
            if (binary.strict === true && ctx.manifest.tags.includes(IMAGE)) {
              throw new Error(`${id}/binary: an image ships this project`);
            }
            return {
              files: (shape.paths ?? [`${dir}/binary.txt`, `${dir}/release.txt`]).map((path) => ({
                path,
                content: path.endsWith('release.txt') ? 'release binary\n' : 'binary\n',
              })),
              ...(tags.length > 0 ? { tagsAdd: tags } : {}),
            };
          },
          {
            predicate: { requires: ['lang.acme'], excludes: [IMAGE] },
            ...declared(shape.share ?? tags),
            ...(binary.asks ? { questions: [question('targets', 'all')] } : {}),
          },
        ),
        adapter(
          id,
          'image',
          ['lang.acme', IMAGE],
          () => ({
            files: [
              { path: `${dir}/image.txt`, content: 'image\n' },
              { path: `${dir}/release.txt`, content: 'release image\n' },
            ],
          }),
          declared(shape.imageShare ?? []),
        ),
      ],
      { promotes: shape.union ?? [NATIVE] },
    );
  }

  /**
   * A project of the skeleton and `scaffolded` on `tags`, installed by
   * one run and committed, over the skeleton and `registered`; and
   * `plan`, which plans `steps` on a manifest of it.
   */
  async function projectOf(
    registered: readonly Vertical[],
    scaffolded: readonly Vertical[],
    tags: readonly Tag[] = CLI,
  ) {
    const registry = registryOf([
      { origin: pluginOrigin('acme'), verticals: [skeleton, ...registered], stacks: [] },
    ]);
    const world = new World(registry);
    const stored = await world.scaffold([skeleton, ...scaffolded], tags);
    const plan = (on: ManifestV2, steps: readonly ConvergeStep[]) =>
      planOf(on, steps, APPENDED, compositionOf(registry, on));
    return { world, stored, plan };
  }

  /**
   * A project that shipped binaries, `prepare`d, then taking the image
   * — `imaging`'s, or the one `image` names — with its ship re-rendered
   * in one run, as `keel add image --refresh ship` does — or, `later`,
   * taking it in a run of its own, then re-rendering its ship, as `keel
   * add ship --reapply` does — the caller saying `notes` around the
   * re-render.
   */
  async function moved(
    binary: Binary,
    options: {
      readonly shape?: Shape;
      readonly image?: Vertical;
      readonly prepare?: (world: World) => void;
      readonly notes?: ConvergeInputs['notes'];
      readonly later?: boolean;
    } = {},
  ): Promise<{ readonly stored: ManifestV2; readonly run: Converged }> {
    const ship = shipping(binary, options.shape);
    const image = options.image ?? imaging;
    const project = await projectOf([ship, image], [ship]);
    const { world, plan } = project;
    let { stored } = project;
    options.prepare?.(world);
    if (options.later === true) {
      const added = ok(await world.run(stored, plan(stored, [install(image)])));
      await commitConverged(world.committing(), added);
      world.keep(added.tree as FakeTree);
      stored = added.manifest;
    }
    const steps = options.later === true ? [rerender(ship)] : [install(image), rerender(ship)];
    const notes = options.notes ?? { before: [], after: [] };
    return { stored, run: ok(await world.run(stored, plan(stored, steps), { notes })) };
  }

  const REASON =
    'keel removes nothing it installed — without a recorded base, it cannot tell what it wrote from what you changed since';
  const LEAD = `Acme ship no longer renders through acme-ship/binary, and ${REASON} — so`;

  it('names the adapter it moved off, the files it wrote that the run left alone, and its record, which stays — between the caller’s notes — changing none of it', async () => {
    const { stored, run } = await moved(
      { asks: true, promotes: true },
      { notes: { before: ['before'], after: ['after'] } },
    );

    expect(run.report.notes).toEqual([
      'before',
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and its answers and the tag it promoted stay in the manifest`,
      'after',
    ]);
    expect(run.report.resolvedAdapters?.map(({ id }) => id)).toEqual([
      'acme-image/main',
      'acme-ship/image',
    ]);
    // The file the image's adapter writes as well is its own now, and
    // not named; the one it does not write is as the binaries left it.
    expect(run.tree.read('ship/release.txt')?.toString('utf8')).toBe('release image\n');
    expect(run.tree.read('ship/binary.txt')?.toString('utf8')).toBe('binary\n');
    expect(changed(run.report)).toEqual(['create ship/image.txt', 'modify ship/release.txt']);
    expect(run.manifest.answers['acme-ship/binary']).toEqual(stored.answers['acme-ship/binary']);
    expect(run.manifest.tags).toContain(NATIVE);
  });

  it('reads that the adapter ran off its answers or off a tag it promoted, and names none that recorded neither', async () => {
    const said = async (binary: Binary) => (await moved(binary)).run.report.notes;
    const lead = `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and`;

    expect(await said({ asks: false, promotes: true })).toEqual([
      `${lead} the tag it promoted stays in the manifest`,
    ]);
    expect(await said({ asks: true, promotes: false })).toEqual([
      `${lead} its answers stay in the manifest`,
    ]);
    // It left no trace in the manifest, so nothing reads that it ran.
    expect(await said({ asks: false, promotes: false })).toBeUndefined();
  });

  it('counts the tags it promoted', async () => {
    const { run } = await moved(
      { asks: false, promotes: true },
      { shape: { tags: [NATIVE, SIGNED], union: [NATIVE, SIGNED] } },
    );
    expect(run.report.notes).toEqual([
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and the tags it promoted stay in the manifest`,
    ]);
  });

  it('reads an adapter that declares no share as promoting its vertical’s, on either side of the move', async () => {
    const union = [NATIVE, SIGNED];
    // The one it moved off may promote the whole union, the tag it
    // promoted among it, and the image's share holds the other.
    const off = await moved(
      { asks: false, promotes: true },
      { shape: { share: 'union', imageShare: [SIGNED], union } },
    );
    expect(off.run.report.notes).toEqual([
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and the tag it promoted stays in the manifest`,
    ]);
    // The one it moved onto may promote it too, so the tag reads as no
    // sign that the binaries ran.
    const onto = await moved(
      { asks: false, promotes: true },
      { shape: { imageShare: 'union', union } },
    );
    expect(onto.run.report.notes).toBeUndefined();
  });

  it('reads a tag as no sign an adapter of the vertical ran where the recorded tags never held what it requires', async () => {
    // Another family's adapter, whose share — its own, or the
    // vertical's — holds the tag the binaries promoted: the project
    // never held its language, so it never ran, and the file at its
    // path is the user's.
    for (const share of [{ promotes: [NATIVE] }, {}]) {
      const base = shipping({ asks: false, promotes: true });
      const other = adapter(
        'acme-ship',
        'other',
        ['lang.other'],
        () => ({ files: [{ path: 'ship/other.txt', content: 'other\n' }], tagsAdd: [NATIVE] }),
        share,
      );
      const ship: Vertical = { ...base, adapters: [...base.adapters, other] };
      const { world, stored, plan } = await projectOf([ship, imaging], [ship]);
      world.files.set('ship/other.txt', Buffer.from('mine\n'));

      const run = ok(await world.run(stored, plan(stored, [install(imaging), rerender(ship)])));
      expect(run.report.notes).toEqual([
        `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and the tag it promoted stays in the manifest`,
      ]);
    }
  });

  it('reads an adapter that ran on a peer’s tag, which relinking withdrew, by its answers alone', async () => {
    const PEER: Tag = 'peer.acme';
    /** Links while a peer projects its tag, and ships plain once none does. */
    const linking = (asks: boolean) =>
      vertical(
        'acme-link',
        [
          adapter(
            'acme-link',
            'peered',
            ['lang.acme', PEER],
            () => ({
              files: [{ path: 'link/peered.txt', content: 'peered\n' }],
              tagsAdd: [NATIVE],
            }),
            { promotes: [NATIVE], ...(asks ? { questions: [question('targets', 'all')] } : {}) },
          ),
          adapter(
            'acme-link',
            'plain',
            ['lang.acme'],
            () => ({ files: [{ path: 'link/plain.txt', content: 'plain\n' }] }),
            { predicate: { requires: ['lang.acme'], excludes: [PEER] }, promotes: [] },
          ),
        ],
        { promotes: [NATIVE] },
      );
    const said = async (asks: boolean) => {
      const link = linking(asks);
      const { world, stored, plan } = await projectOf([link], [link], [...CLI, PEER]);
      expect(stored.tags).toContain(NATIVE);
      // The peer's tag as a link projected it, since relinked to a
      // project that no longer does.
      const relinked: ManifestV2 = {
        ...stored,
        tags: stored.tags.filter((tag) => tag !== PEER),
        peers: [{ ref: '../api', tags: [] }],
      };
      const run = ok(await world.run(relinked, plan(relinked, [rerender(link)])));
      expect(run.tree.read('link/peered.txt')?.toString('utf8')).toBe('peered\n');
      return run.report.notes;
    };

    expect(await said(true)).toEqual([
      `Acme link no longer renders through acme-link/peered, and ${REASON} — so link/peered.txt, which that adapter wrote, is yours to delete, and its answers stay in the manifest`,
    ]);
    expect(await said(false)).toBeUndefined();
  });

  it('leaves out a file the user already deleted', async () => {
    const { run } = await moved(
      { asks: true, promotes: true },
      { prepare: (world) => world.files.delete('ship/binary.txt') },
    );

    expect(run.report.notes).toEqual([
      `${LEAD} that adapter's answers and the tag it promoted stay in the manifest`,
    ]);
    expect(run.tree.exists('ship/binary.txt')).toBe(false);
  });

  it('names a file by the path the project holds, and none the run wrote whole under another spelling', async () => {
    const { run } = await moved(
      { asks: true, promotes: true },
      { shape: { paths: ['./ship/binary.txt', './ship/release.txt'] } },
    );
    expect(run.report.notes).toEqual([
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and its answers and the tag it promoted stay in the manifest`,
    ]);
  });

  it('names a file another vertical of the run only patched, as a run of its own does', async () => {
    /** Promotes the image, and marks the ship's binary imaged: a patch, its own fixed point. */
    const marking = vertical(
      'acme-image',
      [
        adapter('acme-image', 'main', ['lang.acme'], () => ({
          tagsAdd: [IMAGE],
          patches: [
            {
              target: 'ship/binary.txt',
              apply: (text: string) => (text.includes('imaged') ? text : `${text}imaged\n`),
            },
          ],
        })),
      ],
      { promotes: [IMAGE] },
    );
    const said = [
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and its answers and the tag it promoted stay in the manifest`,
    ];

    const one = await moved({ asks: true, promotes: true }, { image: marking });
    expect(one.run.report.notes).toEqual(said);
    expect(one.run.tree.read('ship/binary.txt')?.toString('utf8')).toBe('binary\nimaged\n');
    const later = await moved({ asks: true, promotes: true }, { image: marking, later: true });
    expect(later.run.report.notes).toEqual(said);
  });

  it('names no file of an adapter that no longer renders on the recorded manifest, and refuses nothing for it', async () => {
    // Re-rendered after a run of its own took the image, the binary
    // adapter refuses to render on the manifest it is contributed from.
    const strict = await moved({ asks: true, promotes: true, strict: true }, { later: true });
    expect(strict.run.report.notes).toEqual([
      `${LEAD} that adapter's answers and the tag it promoted stay in the manifest`,
    ]);
    expect(strict.run.tree.read('ship/binary.txt')?.toString('utf8')).toBe('binary\n');
    // One that renders there names its file, as in one run.
    const lenient = await moved({ asks: true, promotes: true }, { later: true });
    expect(lenient.run.report.notes).toEqual([
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and its answers and the tag it promoted stay in the manifest`,
    ]);
  });

  describe('a tag another vertical the project records promotes', () => {
    /**
     * Promotes the image, or on `flavor: native` the tag the binaries
     * promote — as containerization's image does distribution's native
     * release's — its question defaulting to `flavor`, which the
     * project then records; `strict`, refusing to render where the
     * image is already there.
     */
    function flavoured(flavor: 'jvm' | 'native', strict = false): Vertical {
      return vertical(
        'acme-flavour',
        [
          adapter(
            'acme-flavour',
            'main',
            ['lang.acme'],
            (ctx) => {
              if (strict && ctx.manifest.tags.includes(IMAGE)) {
                throw new Error('acme-flavour/main: an image is here already');
              }
              return { tagsAdd: ctx.answer('flavor') === 'native' ? [NATIVE] : [IMAGE] };
            },
            { questions: [question('flavor', flavor)] },
          ),
        ],
        { promotes: [IMAGE, NATIVE] },
      );
    }

    it('reads it as no sign an adapter ran, where that vertical promotes it on what it recorded', async () => {
      // The binaries never ran: the image was there first. The file at
      // their path is the user's.
      const ship = shipping({ asks: false, promotes: true });
      const flavour = flavoured('native');
      const { world, stored, plan } = await projectOf(
        [ship, flavour, imaging],
        [flavour, imaging, ship],
      );
      world.files.set('ship/binary.txt', Buffer.from('mine\n'));
      expect(stored.tags).toContain(NATIVE);

      const run = ok(await world.run(stored, plan(stored, [rerender(ship)])));
      expect(run.report.notes).toBeUndefined();
    });

    it('reads it as the adapter’s where that vertical, rendered on what it recorded, promotes another', async () => {
      const { run } = await moved(
        { asks: false, promotes: true },
        { image: flavoured('jvm'), later: true },
      );
      expect(run.report.notes).toEqual([
        `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and the tag it promoted stays in the manifest`,
      ]);
    });

    it('reads it as no sign an adapter ran where that vertical no longer renders on what it recorded, since it may promote it', async () => {
      const { run } = await moved(
        { asks: false, promotes: true },
        { image: flavoured('jvm', true), later: true },
      );
      expect(run.report.notes).toBeUndefined();
    });

    it('reads it as no sign an adapter ran where that vertical promoted it before a tag it excludes arrived', async () => {
      const FINAL: Tag = 'acme.final';
      // The binaries never ran: the image was there first, and the
      // native tag is this vertical's, which a later tag rules out.
      const ship = shipping({ asks: false, promotes: true });
      const flavour = vertical(
        'acme-flavour',
        [
          adapter('acme-flavour', 'main', ['lang.acme'], () => ({ tagsAdd: [NATIVE] }), {
            predicate: { requires: ['lang.acme'], excludes: [FINAL] },
          }),
        ],
        { promotes: [NATIVE] },
      );
      const finishing = vertical(
        'acme-finish',
        [adapter('acme-finish', 'main', ['lang.acme'], () => ({ tagsAdd: [FINAL] }))],
        { promotes: [FINAL] },
      );
      const { world, stored, plan } = await projectOf(
        [ship, flavour, imaging, finishing],
        [flavour, imaging, ship],
      );
      world.files.set('ship/binary.txt', Buffer.from('mine\n'));
      const finished = ok(await world.run(stored, plan(stored, [install(finishing)])));
      await commitConverged(world.committing(), finished);
      world.keep(finished.tree as FakeTree);
      expect(finished.manifest.tags).toEqual(expect.arrayContaining([NATIVE, FINAL]));

      const on = finished.manifest;
      const run = ok(await world.run(on, plan(on, [rerender(ship)])));
      expect(run.report.notes).toBeUndefined();
    });

    it('reads it as the adapter’s where only an adapter of that vertical the recorded tags never matched promotes it', async () => {
      // The other adapter would promote it on the answer it defaults
      // to, but the project never held its language, so it never ran.
      const flavour = vertical(
        'acme-flavour',
        [
          adapter('acme-flavour', 'main', ['lang.acme'], () => ({ tagsAdd: [IMAGE] }), {
            promotes: [IMAGE],
          }),
          adapter(
            'acme-flavour',
            'other',
            ['lang.other'],
            (ctx) => ({ tagsAdd: ctx.answer('flavor') === 'native' ? [NATIVE] : [] }),
            { questions: [question('flavor', 'native')] },
          ),
        ],
        { promotes: [IMAGE, NATIVE] },
      );
      const { run } = await moved({ asks: false, promotes: true }, { image: flavour, later: true });
      expect(run.report.notes).toEqual([
        `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and the tag it promoted stays in the manifest`,
      ]);
    });
  });

  it('says what it leaves before the refresh it proposes, between the caller’s notes', async () => {
    const ship = shipping({ asks: true, promotes: true });
    const { world, stored, plan } = await projectOf(
      [ship, imaging, metrics, deploy],
      [deploy, ship],
    );
    const run = ok(
      await world.run(stored, plan(stored, [install(metrics), install(imaging), rerender(ship)]), {
        notes: { before: ['before'], after: ['after'] },
      }),
    );
    expect(run.report.notes).toEqual([
      'before',
      `${LEAD} ship/binary.txt, which that adapter wrote, is yours to delete, and its answers and the tag it promoted stay in the manifest`,
      "refresh proposed: Acme deploy reads Acme metrics, which it was rendered without — re-render it in this run with --refresh acme-deploy, or afterwards with 'keel add acme-deploy --reapply'",
      'after',
    ]);
  });

  it('says what each vertical it moved leaves in the order the project records them, whatever order they re-rendered in', async () => {
    const ship = shipping({ asks: true, promotes: true });
    const pack = shipping({ asks: true, promotes: true }, { id: 'acme-pack' });
    const { world, stored, plan } = await projectOf([ship, pack, imaging], [ship, pack]);
    const run = ok(
      await world.run(stored, plan(stored, [install(imaging), rerender(pack), rerender(ship)])),
    );
    expect(run.report.notes?.map((note) => note.split(' no longer')[0])).toEqual([
      'Acme ship',
      'Acme pack',
    ]);
    expect(run.report.notes?.[1]).toContain('pack/binary.txt, which that adapter wrote');
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

describe('converge: `keel new`, a caller from a seed manifest', () => {
  /** The manifest `keel new` starts a scope from: empty, on `tags`, this keel's generation stamped. */
  const fresh = (tags: readonly Tag[] = CLI): ManifestV2 => ({
    ...emptyManifestV2(NOW, '0.5.0-alpha'),
    tags: [...tags],
  });

  it('stages the `new` reading of a seed in the scaffold posture as the engine realizing its own buffer stages it: every file, the actions and the manifest, byte for byte', async () => {
    for (const withHarness of [true, false]) {
      const stored = fresh();
      const plan = convergeOf(family, stored, {
        kind: 'new',
        stack: 'acme-cli',
        harness: withHarness,
        extras: ['acme-metrics', 'acme-log'],
        member: false,
      });
      if (plan.kind !== 'converges') throw new Error('expected a plan');
      expect(plan.run.map((step) => `${step.vertical.id} ${step.posture}`)).toEqual([
        'acme-skeleton install',
        ...(withHarness ? ['agent-harness install'] : []),
        'acme-notes install',
        'acme-log install',
        'acme-metrics install',
      ]);
      const world = new World();
      const run = ok(
        await world.run(stored, plan, {
          apply: 'scaffold',
          retrofit: { contexts: false },
          proposeForLater: true,
        }),
      );

      const tree = world.open();
      const engine = await installVerticals({
        verticals: plan.run.map(({ vertical: v }) => v),
        manifest: fresh(),
        supplied: {},
        tree,
        apply: 'scaffold',
        mode: 'non-interactive',
        prompt: rejectingPrompt,
        logger: new FakeLogger(),
        cwd: CWD,
        templates: new FakeTemplateSource(),
        processes: new FakeProcessRunner(),
        now: () => NOW,
        registry: family,
      });

      expect(JSON.stringify(run.manifest)).toBe(JSON.stringify(engine.manifest));
      expect(run.tree.changes()).toEqual(tree.changes());
      for (const { path } of tree.changes()) expect(run.tree.read(path)).toEqual(tree.read(path));
      expect(run.actions.map((a) => a.description)).toEqual(
        engine.applyResult.actions.map((a) => a.description),
      );
      expect(ids(run.adapters)).toEqual(ids(engine.adapters));
      expect(run.report.skippedHarnessElements).toBe(engine.applyResult.skippedHarnessElements);
      expect(run.manifest.harnessGeneration).toBe(HARNESS_GENERATION);
    }
  });

  it('installs in the caller’s posture: under `scaffold` a file of the user’s a patch would merge into is refused, where under `install` the patch writes into it', async () => {
    const world = new World();
    world.files.set('log.txt', Buffer.from('mine\n'));
    const stored = fresh();
    const plan = planOf(stored, [skeleton, log].map(install));

    const installed = ok(await world.run(stored, plan));
    expect(installed.tree.read('log.txt')?.toString('utf8')).toBe('mine\nlogged\n');

    const failure = await world.run(stored, plan, { apply: 'scaffold' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(PathConflictError);
    expect((failure as PathConflictError).path).toBe('log.txt');
  });

  it('holds the caller’s rules with the run’s after every step, refusing the step whose tags break one, naming the rule', async () => {
    const stored = fresh();
    const plan = planOf(stored, [skeleton, final].map(install));
    const rules = [
      { id: 'acme-cli/never-final', when: [FINAL], reason: 'the CLI preset is never final' },
    ];

    ok(await new World().run(stored, plan));
    const failure = await new World().run(stored, plan, { rules }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(failure).toBeInstanceOf(RefusalError);
    expect((failure as RefusalError).code).toBe('keel.incompatible');
    expect((failure as RefusalError).message).toBe(
      "Acme final cannot be installed here: the CLI preset is never final (rule 'acme-cli/never-final')",
    );
  });

  it('records who wrote each file in the ownership the caller hands it, and returns what it resolved and each supplied answer it read', async () => {
    const owners = newOwnership();
    const stored = fresh();
    const run = ok(
      await new World().run(stored, planOf(stored, [skeleton, harness, notes].map(install)), {
        owners,
        answers: { 'acme-notes/main': { depth: 'deep' } },
      }),
    );

    expect(owners.writers.get('cli.txt')).toBe('acme-skeleton/cli');
    expect(ids(run.adapters)).toEqual([
      'acme-skeleton/cli',
      'agent-harness/kit',
      'acme-notes/main',
    ]);
    expect(run.reads).toEqual([
      { adapter: 'acme-notes/main', question: 'depth', key: 'acme-notes/main' },
    ]);
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
