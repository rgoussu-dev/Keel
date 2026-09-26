/**
 * The render guard behind growth's structural refusal (`docs/roadmap.md`
 * → R.2a, DR6): growing an entrypoint installs only the adapters that
 * newly match, so an adapter that matched before and renders otherwise
 * once the project has the other entrypoint would be left as it was —
 * a half-wired assembly. `growthOf` reads which projects that is off
 * the adapter set, without rendering anything; this holds that reading
 * to what the adapters render.
 *
 * **Scenario.** Every single-service preset from `keel.catalog` that
 * scaffolds one back entrypoint, on its opening build system, under
 * each module layout `keel.dials` offers it and with the peer context
 * wherever the modulith offers it ({@link walkDials}) — and, on the
 * modulith, after `keel add module orders`, whose context the
 * `modules.context` marker selects. For each, every adapter of every
 * installed vertical (the added context's: `bounded-context`'s) is
 * rendered twice, under the project's tags and under those plus the
 * entrypoint it lacks, and the two contributions compared: files and
 * their modes, what each patch makes of the file the scaffold wrote,
 * and every declaration beside them.
 *
 * An adapter that matches both times and renders otherwise is one
 * growth must not leave as it was, so it must be one growth re-renders
 * (`GrowthPlan.rerender`: the agent harness's family kit) or one whose
 * context growth refuses (`keel.contexts-need-rewiring`: it requires
 * that context's marker). And the other way round, each of those
 * readings must rest on such an adapter: a refused context has an
 * adapter requiring its marker that renders otherwise, and a
 * re-rendered vertical an adapter that does. Today that is exactly the
 * family kits, the peer-context adapters and the context adapters; a
 * family that splits its context adapters into one wiring adapter per
 * entrypoint (R.3) leaves them rendering the same, and growth stops
 * refusing it, with no edit here.
 *
 * **Factory.** {@link installMediator} over the real templates and
 * filesystem, with a fake process runner and no deferred action — the
 * composition grid's wiring — for the scaffolds; each adapter is then
 * rendered through `makeCtx` on the manifest the scaffold wrote, its
 * answers resolved as an install resolves them, non-interactively.
 *
 * **Port.** `Mediator.dispatch` for the scaffolds, and `growthOf` and
 * `Adapter.contribute` for the readings compared.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  installCommandFor,
  type NewProjectTarget,
} from '../../../src/domain/contract/commands.js';
import type {
  Adapter,
  Contribution,
  ContributionPatch,
  Tag,
  Vertical,
} from '../../../src/domain/contract/composition.js';
import {
  effectiveTags,
  projectScopeRoot,
  type ManifestV2,
} from '../../../src/domain/contract/manifest.js';
import {
  catalogQuery,
  dialsQuery,
  type DialOptions,
} from '../../../src/domain/contract/queries.js';
import { addModuleInputs, CONTEXT_TAG } from '../../../src/domain/core/adapters/added-context.js';
import {
  answerKeys,
  answerUnder,
  resolveAdapterAnswers,
} from '../../../src/domain/core/answers.js';
import { makeCtx } from '../../../src/domain/core/apply.js';
import { growthOf, rerendersOf } from '../../../src/domain/core/growth.js';
import { matches } from '../../../src/domain/core/predicate.js';
import { installedVertical, shippedRegistry } from '../../../src/domain/core/registry.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import { boundedContextVertical } from '../../../src/domain/core/verticals/bounded-context.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { fsManifestStore } from '../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';
import { ejsTemplateSource } from '../../../src/infrastructure/template/ejs-template-source.js';
import { eachStack } from '../../support/composition-grid.js';
import { walkDials } from '../../support/dial-walk.js';
import { expectOk, installMediator } from '../../support/factory.js';

/** The context `keel add module` adds before the `modules.context` probe. */
const ADDED = 'orders';

/**
 * A few seconds on their own; `verify` runs this beside the rest of the
 * suite on four cores, so the budget is far above that and far below a
 * hang.
 */
const SWEEP_TIMEOUT = 180_000;

/** One project rendered both ways, and what the comparison found. */
interface Cell {
  /** The commands that make it, as command lines. */
  readonly at: string;
  /** Adapters matching both times whose renderings differ. */
  readonly differ: readonly Adapter[];
  /** What growth re-renders here, among the verticals rendered, by id. */
  readonly rerender: readonly string[];
  /** The markers of the contexts growth refuses to rewire here. */
  readonly refused: readonly Tag[];
}

const mediator = installMediator({
  processes: new FakeProcessRunner(),
  runDeferred: async () => {},
});
const scratches: string[] = [];
const cells: Cell[] = [];

describe('growth render guard: what matches before and after renders the same', () => {
  beforeAll(async () => {
    const { stacks } = expectOk(await mediator.dispatch(catalogQuery()));
    const backends = stacks.flatMap((stack) => {
      const lacking = stack.services.length === 0 ? lackingOf(stack.tags) : null;
      return lacking === null ? [] : [{ preset: stack.id, lacking }];
    });
    await eachStack(backends, async ({ preset, lacking }) => {
      for (const target of await layoutsOf(preset)) {
        const cwd = await scaffold(target);
        const manifest = await manifestOf(cwd);
        const at = commandOf(target);
        const installed = manifest.verticals.flatMap(
          ({ id }) => installedVertical(shippedRegistry, id) ?? [],
        );
        cells.push(await cellOf(at, cwd, manifest, manifest, installed, lacking));
        if (target.moduleLayout !== 'modulith' || target.withPeerContext === true) continue;
        expectOk(
          await mediator.dispatch(
            addModuleCommand({
              cwd,
              module: ADDED,
              answers: {},
              interactive: false,
              dryRun: false,
            }),
          ),
        );
        const added = await manifestOf(cwd);
        const probe: ManifestV2 = {
          ...added,
          tags: [...added.tags, CONTEXT_TAG].sort(),
          answers: { ...added.answers, ...addModuleInputs({ name: ADDED, consumes: null }) },
        };
        cells.push(
          await cellOf(
            `${at} && keel add module ${ADDED}`,
            cwd,
            added,
            probe,
            [boundedContextVertical],
            lacking,
          ),
        );
      }
    });
  }, SWEEP_TIMEOUT);

  afterAll(async () => {
    await Promise.all(scratches.splice(0).map((directory) => fs.remove(directory)));
  });

  it('renders each backend preset under each layout, the peer context and an added context', () => {
    expect(cells.some((cell) => cell.at.includes('--with-peer-context'))).toBe(true);
    expect(cells.some((cell) => cell.at.includes(`keel add module ${ADDED}`))).toBe(true);
  });

  it('finds every adapter that renders otherwise re-rendered, or its context refused', () => {
    const unexplained = cells.flatMap((cell) =>
      cell.differ
        .filter((adapter) => !cell.rerender.includes(adapter.vertical))
        .filter((adapter) => !cell.refused.some((marker) => requires(adapter, marker)))
        .map((adapter) => `${cell.at}: ${adapter.id}`),
    );
    expect(unexplained, 'growth would leave these rendered for the old entrypoints').toEqual([]);
  });

  it('refuses no context whose adapters render the same', () => {
    const unfounded = cells.flatMap((cell) =>
      cell.refused
        .filter((marker) => !cell.differ.some((adapter) => requires(adapter, marker)))
        .map((marker) => `${cell.at}: ${marker}`),
    );
    expect(unfounded, 'growth refuses these, and nothing they select renders otherwise').toEqual(
      [],
    );
  });

  it('re-renders no vertical whose adapters render the same', () => {
    const idle = cells.flatMap((cell) =>
      cell.rerender
        .filter((id) => !cell.differ.some((adapter) => adapter.vertical === id))
        .map((id) => `${cell.at}: ${id}`),
    );
    expect(idle, 'growth re-renders these, and none of their adapters changes').toEqual([]);
  });
});

/**
 * The settings of `stack` on its opening build system, one per module
 * layout and peer context `keel.dials` offers there.
 */
async function layoutsOf(stack: string): Promise<readonly NewProjectTarget[]> {
  const settings = await walkDials(
    async (target) => expectOk(await mediator.dispatch(dialsQuery({ target }))) as DialOptions,
    [{ kind: 'new-project', stack }],
  );
  const opening = (settings[0]?.target as NewProjectTarget | undefined)?.buildSystem;
  return settings
    .map((setting) => setting.target as NewProjectTarget)
    .filter((target) => target.buildSystem === opening);
}

async function scaffold(target: NewProjectTarget): Promise<string> {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-growth-render-'));
  scratches.push(cwd);
  expectOk(
    await mediator.dispatch(
      installCommandFor(target, { cwd, answers: {}, interactive: false, dryRun: false }),
    ),
  );
  return cwd;
}

async function manifestOf(cwd: string): Promise<ManifestV2> {
  const manifest = await fsManifestStore.read(projectScopeRoot(cwd));
  if (manifest === null) throw new Error(`${cwd}: no manifest written`);
  return manifest;
}

/** The back entrypoint a backend preset's `tags` lack, where they lack exactly one. */
function lackingOf(tags: readonly Tag[]): (typeof ENTRYPOINTS)[number] | null {
  const lacking = ENTRYPOINTS.filter((entry) => entry.side === 'back' && !tags.includes(entry.tag));
  const front = ENTRYPOINTS.some((entry) => entry.side === 'front' && tags.includes(entry.tag));
  return lacking.length === 1 && !front ? (lacking[0] ?? null) : null;
}

/**
 * Renders every adapter of `verticals` matching `probe`'s tags both
 * without and with `entry`'s, on the project in `cwd`, and reads what
 * growth makes of `manifest` there.
 */
async function cellOf(
  at: string,
  cwd: string,
  manifest: ManifestV2,
  probe: ManifestV2,
  verticals: readonly Vertical[],
  entry: (typeof ENTRYPOINTS)[number],
): Promise<Cell> {
  const grown: ManifestV2 = { ...probe, tags: [...new Set([...probe.tags, entry.tag])].sort() };
  const differ: Adapter[] = [];
  for (const vertical of verticals) {
    for (const adapter of vertical.adapters) {
      if (!matchesOn(adapter, probe) || !matchesOn(adapter, grown)) continue;
      const before = await render(adapter, probe, cwd);
      const after = await render(adapter, grown, cwd);
      if (before !== after) differ.push(adapter);
    }
  }
  const growth = growthOf(shippedRegistry, manifest, entry.word);
  const refused =
    growth.kind === 'refused' && growth.refusal.code === 'keel.contexts-need-rewiring'
      ? growth.refusal.contexts.map((context) => context.marker)
      : [];
  if (growth.kind !== 'grows' && refused.length === 0) {
    throw new Error(`${at}: growth reads ${JSON.stringify(growth)}`);
  }
  const rerender = rerendersOf(manifest).filter((id) => verticals.some((v) => v.id === id));
  return { at, differ, rerender, refused };
}

function matchesOn(adapter: Adapter, manifest: ManifestV2): boolean {
  return matches(adapter.predicate, new Set(effectiveTags(manifest)));
}

function requires(adapter: Adapter, marker: Tag): boolean {
  return (adapter.predicate.requires ?? []).includes(marker);
}

/**
 * One adapter's contribution on `manifest`, as comparable text: its
 * answers resolved as an install resolves them — what the manifest
 * records under its id or a sibling's, and each other question's
 * default — and every patch read as what it makes of the file the
 * scaffold wrote in `cwd`.
 */
async function render(adapter: Adapter, manifest: ManifestV2, cwd: string): Promise<string> {
  const tags = effectiveTags(manifest);
  const recorded: Record<string, string> = {};
  for (const question of adapter.questions ?? []) {
    const answer = answerUnder(manifest.answers, answerKeys(adapter), question.id);
    if (answer !== undefined) recorded[question.id] = answer.value;
  }
  const { answers } = await resolveAdapterAnswers(
    adapter,
    recorded,
    'non-interactive',
    rejectingPrompt,
    tags,
  );
  const contribution: Contribution = await adapter.contribute(
    makeCtx(adapter, answers, {
      manifest,
      logger: new FakeLogger(),
      cwd,
      templates: ejsTemplateSource,
      processes: new FakeProcessRunner(),
    }),
  );
  const patched = async (patches: readonly ContributionPatch[] | undefined) =>
    Promise.all(
      (patches ?? []).map(async ({ apply, ...patch }) => ({
        ...patch,
        makes: await madeBy(apply, path.join(cwd, patch.target), patch.seed),
      })),
    );
  return JSON.stringify({
    ...contribution,
    files: (contribution.files ?? []).map((file) => ({
      ...file,
      content: Buffer.from(file.content).toString('base64'),
    })),
    patches: await patched(contribution.patches),
    harnessPatches: await patched(contribution.harnessPatches),
    actions: (contribution.actions ?? []).map(({ id, description }) => ({ id, description })),
  });
}

/** What a patch makes of `file` as the scaffold left it — or of its seed, where there is none. */
async function madeBy(
  apply: ContributionPatch['apply'],
  file: string,
  seed: string | undefined,
): Promise<string> {
  const existing = (await fs.pathExists(file)) ? await fs.readFile(file, 'utf8') : seed;
  if (existing === undefined) return '(no file, no seed)';
  try {
    return apply(existing);
  } catch (thrown) {
    return `(refused: ${thrown instanceof Error ? thrown.message : String(thrown)})`;
  }
}

/** A setting as the command line that scaffolds it. */
function commandOf(target: NewProjectTarget): string {
  return [
    `keel new --stack ${target.stack ?? ''}`,
    target.buildSystem === undefined ? '' : ` --build-system ${target.buildSystem}`,
    target.moduleLayout === undefined ? '' : ` --module-layout ${target.moduleLayout}`,
    target.withPeerContext === true ? ' --with-peer-context' : '',
  ].join('');
}
