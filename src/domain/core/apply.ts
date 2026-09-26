/**
 * The contribution applier.
 *
 * Takes a topologically-ordered list of adapters, a Tree to write
 * into, and the resolved answers per adapter, and walks the chain:
 *   1. For each adapter, build a `Ctx` whose `answer()` reads from
 *      the resolved answer map for that adapter.
 *   2. Invoke `adapter.contribute(ctx)` to get a Contribution.
 *   3. Apply `files` (whole-file writes), with conflict detection: a
 *      whole-file write to a path that already exists in the Tree is
 *      a hard error — a refusal naming the file when the project held
 *      it before the run, a bug when an earlier adapter of the run
 *      created it. To modify existing files, use `patches` instead.
 *   4. Apply `patches` (read–transform–write); a patch whose target
 *      doesn't exist is an error — a refusal naming the file on a
 *      project that should hold it, a bug under `keel new` — unless
 *      the patch supplies a `seed`: then the transform runs against
 *      the seed and the result is written as a new file (the
 *      shared-file upsert). A patch that declares `regions` is held
 *      to them: a transform that changed anything outside its
 *      regions is refused naming the adapter, and a region two
 *      adapters of the run both declare on one target is refused
 *      naming both — the engine's own regions (the `AGENTS.md` map
 *      and skills-index slots) included.
 *   5. Collect `skills`, `hooks` and region-confined `harnessPatches`;
 *      after the entire chain, realize them only when the settled
 *      local tags carry `agentic.harness`. Each skill is
 *      schema-validated, rendered with `renderSkill`, and written to
 *      `.claude/skills/<name>/SKILL.md` (plus supporting files) with
 *      the same whole-file conflict rules as `files`; each hook is
 *      staged to `.claude/hooks/<name>.sh` under the same rules and
 *      wired into `.claude/settings.json` by the engine. A skill or
 *      hook name two adapters of the run both contribute is a hard
 *      refusal naming both origins. Harness patches run last, over
 *      the files the whole run staged.
 *   6. Aggregate `tagsAdd` into a flat list returned to the caller.
 *
 * The applier is pure with respect to the manifest — it does not
 * write the manifest itself. The caller threads the returned
 * `tagsAdded` and staged-skill records into the manifest update.
 *
 * Mutations to the Tree are staged in memory (per the Tree port);
 * `tree.commit()` is the caller's responsibility.
 */

import { createHash } from 'node:crypto';
import {
  renderSkill,
  skillSupportingTarget,
  skillTarget,
  SkillSpecSchema,
  type SkillSpec,
} from '../contract/skill.js';
import {
  HOOK_REMINDER_BUDGET,
  HookSpecSchema,
  SETTINGS_TARGET,
  hookTarget,
  renderHook,
  type HookSpec,
} from '../contract/hook.js';
import {
  DOC_POINTER,
  DocSectionSchema,
  docPointerTarget,
  docRegion,
  docSeed,
  docTarget,
  type DocSection,
} from '../contract/doc.js';
import {
  assertRegion,
  confinementOf,
  locateRegion,
  regionPatch,
  type Region,
} from '../contract/region.js';
import {
  MAP_REGION,
  ROOT_DOC,
  SKILLS_INDEX_REGION,
  computeDocsIndex,
  mergeRows,
  parseRows,
  renderIndexBody,
  type DocsIndexInput,
  type DocsIndexRegion,
} from './docs-index.js';
import { PathConflictError, PathMissingError } from '../contract/refusal.js';
import { SETTINGS_SEED, mergeHookSettings } from './hook-settings.js';
import { ADOPTED_FILES } from './adapters/adopted-files.js';
import { eolAware } from './util.js';
import {
  ENGINE_CONTRIBUTOR_ID,
  AGENT_HARNESS_TAG,
  type DeferredAction,
  type Adapter,
  type Contribution,
  type ContributionPatch,
  type Ctx,
  type ManifestV2,
  type Tag,
  type Tree,
} from '../contract/composition.js';
import type { Logger } from '../contract/ports/logger.js';
import type { ProcessRunner } from '../contract/ports/process-runner.js';
import type { TemplateSource } from '../contract/ports/template-source.js';

/** Per-adapter answer map: questionId → value. */
export type AnswersByAdapter = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * How contributions meet files already in the Tree.
 *
 * `install` (the default) is the brownfield contract — `keel add`,
 * `keel add module`: a whole-file write to an existing path is a hard
 * conflict, and every patch writes its result. A file this run did
 * not write is refused as a {@link PathConflictError}; a patch target
 * the tree does not hold is one the user deleted, refused as a
 * {@link PathMissingError}.
 *
 * `scaffold` is `keel new`'s contract, the same one with a different
 * reading of a patch target nothing created: no keel project was here
 * to have lost it, so it is the chain's own ordering bug, and throws
 * as one. A file in the way is refused in the same words as under
 * `install`, and so is one a patch would merge into — a user's
 * `package.json` under keel's is a build neither wrote — unless it is
 * one of the two files `keel new` adopts (`README.md`, `.gitignore`).
 * The sentence is phase-neutral; whether moving the file
 * aside is sound advice (it is before `keel new`, and may not be
 * after, where a product root writes into its services) is the front
 * end's to say, from the refusal's fields.
 *
 * `reapply` is the day-2 contract for re-rendering an installed
 * vertical: whole-file writes **overwrite** their target (skipped when
 * the content is byte-identical, so the staged changes are an honest
 * diff), while a patch against an existing file may change it only
 * when its transform is its own fixed point — applying it again to
 * the result changes nothing — which is what a patch that owns a
 * region (a sentinel-delimited section, a guarded insert) looks
 * like: re-rendering it is the same operation as the pristine
 * rewrite. A transform that would keep changing its own result is
 * an append about to append again — indistinguishable from a double
 * application — and conflicts instead of writing.
 */
export type ApplyMode = 'scaffold' | 'install' | 'reapply';

/** One file a staged skill put into the Tree, with its content hash. */
export interface StagedSkillFile {
  /** Path relative to the project root (`.claude/skills/<name>/…`). */
  readonly path: string;
  /**
   * sha256 of the content as staged, hex. The manifest's provenance
   * hashes the file as the run leaves it instead (`install.ts`
   * `finalizeHarness`), once every later write of the run is in.
   */
  readonly sha256: string;
}

/**
 * One skill the applier staged: which adapter owns it, its name, and
 * every file written for it. The caller turns each file into a
 * manifest `entries` provenance record.
 */
export interface StagedSkill {
  readonly adapterId: string;
  readonly name: string;
  readonly files: readonly StagedSkillFile[];
}

/** Result of applying a chain of contributions. */
export interface ApplyResult {
  /** Number of harness elements suppressed by this completed run; absent when zero. */
  readonly skippedHarnessElements?: number;
  /** Every tag any adapter promoted via `tagsAdd`, deduplicated. */
  readonly tagsAdded: readonly Tag[];
  /** Every skill staged, in the order the owning adapters resolved. */
  readonly skills: readonly StagedSkill[];
  /**
   * Actions emitted by adapters, in the order their owning adapters
   * resolved, and within an adapter in declaration order. The applier
   * does NOT execute them; pass to `runActions` after
   * `tree.commit()`.
   */
  readonly actions: readonly DeferredAction[];
}

/**
 * Thrown when a contribution conflicts with the Tree in a way no user
 * file explains. Carries the offending path and adapter id for
 * diagnostics.
 *
 * Mostly two contributions of one run disagreeing — a path both write
 * whole, a region or a skill name both claim, a patch whose target
 * `keel new` has not created yet — which is keel's bug (or a
 * plugin's), and by the kernel's rule keeps throwing. A reapply that
 * would diverge is the other case, and `keel add --reapply` turns it
 * into a refusal of its own. What a user's files do to an install is
 * not this: see {@link PathConflictError} and {@link PathMissingError}.
 */
export class ContributionConflictError extends Error {
  constructor(
    message: string,
    readonly adapterId: string,
    readonly path: string,
    readonly kind:
      | 'overwrite'
      | 'missing-patch-target'
      | 'reapply-divergence'
      | 'skill-collision'
      | 'hook-collision'
      | 'reminder-budget'
      | 'region-escape'
      | 'region-collision',
  ) {
    super(message);
    this.name = 'ContributionConflictError';
  }
}

/**
 * The cross-adapter memory of one run: which adapter owns each skill
 * name and each declared region of each target, so a second claim
 * is refused naming both origins. One per run, threaded by the
 * caller through every {@link applyContribution}.
 */
export interface Ownership {
  /** Skill name → owning adapter id. */
  readonly skills: Map<string, string>;
  /** Hook name → owning adapter id. */
  readonly hooks: Map<string, string>;
  /** {@link regionKey} → owning contributor id. */
  readonly regions: Map<string, string>;
  /**
   * Canonical path → the adapter whose contribution last wrote it: a
   * whole file, a patch, a skill's file or a hook script. Not a claim —
   * a later patch of another adapter's file is the rule, not a
   * collision — but what a caller reads to name who wrote a path:
   * `keel new` refusing a path two scopes of one product both stage.
   * What the engine writes of its own (the hook wiring, the doc
   * pointers, the docs index) is not recorded.
   */
  readonly writers: Map<string, string>;
  /**
   * The engine's pre-owned region keys it has not yet re-rendered
   * this run: its one claim on each goes through, a second is a
   * region declared twice like any adapter's.
   */
  readonly engineSlots: Set<string>;
}

/**
 * The regions the engine writes without any adapter — the slots the
 * binding spec ships empty for the projection commands to fill —
 * owned by {@link ENGINE_CONTRIBUTOR_ID} from the first apply of a
 * run, so an adapter declaring one is refused naming the engine.
 */
export const ENGINE_REGIONS: readonly { readonly target: string; readonly region: Region }[] = [
  { target: ROOT_DOC, region: MAP_REGION },
  { target: ROOT_DOC, region: SKILLS_INDEX_REGION },
];

/** A fresh {@link Ownership} with the engine's own regions already claimed. */
export function newOwnership(): Ownership {
  const regions = new Map<string, string>();
  for (const owned of ENGINE_REGIONS) {
    regions.set(regionKey(owned.target, owned.region), ENGINE_CONTRIBUTOR_ID);
  }
  return {
    skills: new Map(),
    hooks: new Map(),
    regions,
    writers: new Map(),
    engineSlots: new Set(regions.keys()),
  };
}

/**
 * The ownership key of one region of one target: the opening marker
 * is the region's identity, and the target is taken as the Tree
 * takes it — forward slashes, no leading `./` or `/` — so `AGENTS.md`
 * and `./AGENTS.md` are one file here as they are on disk, and an
 * alias spelling is not a way around the one-owner rule. Encoded as
 * a tuple, since either half may contain the separator a
 * concatenation would need.
 */
export function regionKey(target: string, region: Region): string {
  return JSON.stringify([canonicalTarget(target), region.begin]);
}

/** The Tree's own path canonicalization, mirrored for ownership keys. */
function canonicalTarget(target: string): string {
  return target.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/**
 * Inputs to the applier. Kept as a single options object so the
 * call-site is self-documenting.
 */
export interface ApplyInputs {
  readonly adapters: readonly Adapter[];
  readonly answers: AnswersByAdapter;
  readonly manifest: ManifestV2;
  readonly tree: Tree;
  readonly logger: Logger;
  readonly cwd: string;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
  /** Conflict posture towards existing files; defaults to `install`. */
  readonly mode?: ApplyMode;
}

export async function applyContributions(inputs: ApplyInputs): Promise<ApplyResult> {
  const tagsAdded = new Set<Tag>();
  const harness: HarnessContribution[] = [];
  const owners = newOwnership();
  const actions: DeferredAction[] = [];

  for (const adapter of inputs.adapters) {
    const ctx = makeCtx(adapter, inputs.answers[adapter.id] ?? {}, {
      manifest: inputs.manifest,
      logger: inputs.logger,
      cwd: inputs.cwd,
      templates: inputs.templates,
      processes: inputs.processes,
    });
    const contribution = await adapter.contribute(ctx);
    collectHarness(adapter, contribution, harness, inputs.mode);
    applyContribution(
      adapter,
      { files: contribution.files ?? [], patches: contribution.patches ?? [] },
      inputs.tree,
      inputs.mode,
      owners,
    );
    for (const t of contribution.tagsAdd ?? []) tagsAdded.add(t);
    for (const a of contribution.actions ?? []) actions.push(a);
  }

  const { skills, skipped } = realizeHarness(
    harness,
    inputs.tree,
    [...inputs.manifest.tags, ...tagsAdded],
    inputs.logger,
    owners,
    inputs.manifest,
  );
  return {
    tagsAdded: [...tagsAdded],
    skills,
    actions,
    ...(skipped > 0 ? { skippedHarnessElements: skipped } : {}),
  };
}

/** One adapter's deferred, content-carrying harness declarations. */
export interface HarnessContribution {
  readonly adapter: Adapter;
  readonly skills: readonly SkillSpec[];
  readonly hooks: readonly HookSpec[];
  readonly docs: readonly DocSection[];
  readonly patches: readonly ContributionPatch[];
  readonly mode: ApplyMode;
}

/** A realized harness file and its contributor, ready for manifest provenance. */
export interface HarnessFile extends StagedSkillFile {
  readonly adapterId: string;
}

/** Validates and collects harness elements without writing them or testing the gate early. */
export function collectHarness(
  adapter: Adapter,
  contribution: Contribution,
  pending: HarnessContribution[],
  mode: ApplyMode = 'install',
): void {
  const skills = contribution.skills ?? [];
  const patches = contribution.harnessPatches ?? [];
  for (const patch of patches) {
    if (!patch.regions?.length) {
      throw new Error(
        `adapter '${adapter.id}': harness patch on '${patch.target}' must declare owned regions`,
      );
    }
  }
  for (const skill of skills) {
    const parsed = SkillSpecSchema.safeParse(skill);
    if (!parsed.success)
      throw new Error(
        `adapter '${adapter.id}' contributes a malformed skill — ${parsed.error.message}`,
      );
  }
  const hooks = (contribution.hooks ?? []).map((raw) => parseHook(adapter, raw));
  const docs = (contribution.docs ?? []).map((raw) => parseDoc(adapter, raw));
  if (skills.length + hooks.length + docs.length + patches.length > 0) {
    pending.push({ adapter, skills, hooks, docs, patches, mode });
  }
}

/** Validates one contributed doc section, refusing a malformed spec naming the adapter. */
function parseDoc(adapter: Adapter, raw: DocSection): DocSection {
  const parsed = DocSectionSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'spec'}: ${issue.message}`)
      .join('; ');
    throw new Error(`adapter '${adapter.id}' contributes a malformed doc section — ${detail}`);
  }
  return parsed.data;
}

/** Validates one contributed hook, refusing a malformed spec naming the adapter. */
function parseHook(adapter: Adapter, raw: HookSpec): HookSpec {
  const parsed = HookSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'spec'}: ${issue.message}`)
      .join('; ');
    throw new Error(`adapter '${adapter.id}' contributes a malformed hook — ${detail}`);
  }
  return parsed.data;
}

/**
 * What the navigation index reads off the project itself, as opposed
 * to off the contributors that ran: its bounded contexts and, at a
 * composite product root, its services. A `ManifestV2` satisfies it
 * structurally, which is how both call sites pass one.
 */
export type ProjectIndexInput = Pick<DocsIndexInput, 'modules' | 'services'>;

/**
 * Realizes one run's declarations against the settled local tags. Peers
 * never activate this project's harness. Suppressed elements produce one
 * diagnostic; realized elements retain ordinary collision and region checks.
 */
export function realizeHarness(
  pending: HarnessContribution[],
  tree: Tree,
  tags: readonly Tag[],
  logger: Logger,
  owners: Ownership,
  project: ProjectIndexInput = { modules: [], services: [] },
): {
  readonly skills: readonly StagedSkill[];
  readonly files: readonly HarnessFile[];
  readonly skipped: number;
} {
  const contributions = pending.splice(0);
  const count = contributions.reduce(
    (total, c) => total + c.skills.length + c.hooks.length + c.docs.length + c.patches.length,
    0,
  );
  if (!tags.includes(AGENT_HARNESS_TAG)) {
    if (count > 0)
      logger.info(`skipped ${String(count)} harness elements — no agent-harness in this project`);
    return { skills: [], files: [], skipped: count };
  }
  assertReminderBudget(contributions);
  const skills: StagedSkill[] = [];
  const files: HarnessFile[] = [];
  // Whole files first, across every contributor — a harness patch
  // lands in a hook another adapter stages (code-style's format step
  // in the family kit's pre-commit hook), whichever resolved first.
  for (const contribution of contributions) {
    const staged = applyContribution(
      contribution.adapter,
      { skills: contribution.skills },
      tree,
      contribution.mode,
      owners,
    );
    skills.push(...staged);
    for (const skill of staged) {
      files.push(...skill.files.map((file) => ({ ...file, adapterId: skill.adapterId })));
    }
    for (const hook of contribution.hooks) {
      const staged = stageHook(contribution.adapter, hook, tree, contribution.mode, owners.hooks);
      owners.writers.set(staged.path, staged.adapterId);
      files.push(staged);
    }
  }
  const wired = contributions.flatMap((c) => c.hooks);
  if (wired.length > 0) {
    const scaffold = contributions.some((c) => c.mode === 'scaffold');
    files.push(wireHooks(wired, tree, scaffold ? owners : null));
  }
  for (const contribution of contributions) {
    applyContribution(
      contribution.adapter,
      { patches: contribution.patches },
      tree,
      contribution.mode,
      owners,
    );
  }
  // Doc sections compose one directory's doc from the same seed, in
  // any order; each is an owned region, so two contributors of a run
  // cannot write one section and none may touch another's.
  for (const contribution of contributions) {
    applyContribution(
      contribution.adapter,
      { patches: contribution.docs.map(docPatch) },
      tree,
      contribution.mode,
      owners,
    );
  }
  for (const contribution of contributions) {
    const targets = [
      ...contribution.patches.map((patch) => patch.target),
      ...new Set(contribution.docs.map((doc) => docTarget(doc.directory))),
    ];
    for (const target of targets) {
      files.push({
        adapterId: contribution.adapter.id,
        path: canonicalTarget(target),
        sha256: createHash('sha256').update(tree.read(target)!).digest('hex'),
      });
    }
  }
  const docs = contributions.flatMap((c) => c.docs);
  if (docs.length > 0) files.push(...stagePointers(docs, tree));
  // The index projects what this run realized, laid over the rows
  // already in the slots — an install never sees the contributors it
  // did not run, and `keel docs sync` is what recomputes the set
  // whole. `keel new` runs every contributor, so the two agree there.
  files.push(
    ...projectDocsIndex(
      computeDocsIndex({
        docs,
        skills: contributions.flatMap((c) => c.skills),
        modules: project.modules,
        services: project.services,
      }),
      tree,
      owners,
      { merge: true },
    ),
  );
  return { skills, files, skipped: 0 };
}

/** The region patch landing one doc section in its directory's seeded `AGENTS.md`. */
function docPatch(doc: DocSection): ContributionPatch {
  return regionPatch({
    target: docTarget(doc.directory),
    seed: docSeed(doc.directory),
    region: docRegion(doc.section),
    body: doc.body,
    padding: 'blank',
  });
}

/**
 * Writes the `CLAUDE.md` pointer beside every doc that has none — a
 * pointer the project already has, whatever it holds, is its own —
 * and records each one written under the engine.
 */
function stagePointers(docs: readonly DocSection[], tree: Tree): HarnessFile[] {
  const written: HarnessFile[] = [];
  for (const directory of new Set(docs.map((doc) => doc.directory))) {
    const target = docPointerTarget(directory);
    if (tree.exists(target)) continue;
    tree.write(target, DOC_POINTER);
    written.push({ adapterId: ENGINE_CONTRIBUTOR_ID, path: target, sha256: sha256Of(DOC_POINTER) });
  }
  return written;
}

/** The engine as a contributor: what a region it writes itself is attributed to. */
const ENGINE_ADAPTER: Adapter = {
  id: ENGINE_CONTRIBUTOR_ID,
  vertical: 'agent-harness',
  covers: [],
  predicate: {},
  contribute: () => ({}),
};

/**
 * Writes one project's computed index into the engine-owned regions
 * that carry it, under the engine's own identity — the projection's
 * single write path, shared by the final harness pass and by
 * `keel docs sync`.
 *
 * `merge` is what tells the two apart. An install realizes only the
 * contributors that ran, so it lays its rows over the ones already
 * there and drops none; a sync recomputes the set outright, which is
 * what prunes a row whose subject is gone. Either way a document the
 * project does not have, or one whose region the binding spec
 * predates, is left exactly as it is: the projection fills a slot, it
 * never invents one.
 */
export function projectDocsIndex(
  regions: readonly DocsIndexRegion[],
  tree: Tree,
  owners: Ownership,
  options: { readonly merge: boolean },
): HarnessFile[] {
  const written: HarnessFile[] = [];
  const touched = new Set<string>();
  for (const region of regions) {
    const current = tree.read(region.target);
    if (current === null) continue;
    const text = current.toString('utf8');
    const span = locateRegion(text, region.region, region.target);
    if (span === null && region.whenAbsent === 'keep') continue;
    const inside =
      span === null
        ? ''
        : text.slice(span.begin + region.region.begin.length, span.end - region.region.end.length);
    const rows = options.merge ? mergeRows(parseRows(inside), region.rows) : region.rows;
    if (rows.length === 0 && span === null) continue;
    reserveEngineSlot(owners, region.target, region.region);
    applyContribution(
      ENGINE_ADAPTER,
      {
        patches: [
          regionPatch({
            target: region.target,
            region: region.region,
            body: renderIndexBody(region.heading, rows),
            padding: 'blank',
            whenAbsent: region.whenAbsent,
          }),
        ],
      },
      tree,
      'install',
      owners,
    );
    touched.add(region.target);
  }
  for (const target of touched) {
    written.push({
      adapterId: ENGINE_CONTRIBUTOR_ID,
      path: target,
      sha256: createHash('sha256').update(tree.read(target)!).digest('hex'),
    });
  }
  return written;
}

/**
 * Pre-owns one more engine region mid-run — a child index, whose
 * target only the projection knows, so {@link ENGINE_REGIONS} cannot
 * list it up front. A region an adapter already owns is left alone:
 * the claim that follows is then refused naming the adapter, as any
 * second claim is.
 */
function reserveEngineSlot(owners: Ownership, target: string, region: Region): void {
  const key = regionKey(target, region);
  if (owners.regions.has(key)) return;
  owners.regions.set(key, ENGINE_CONTRIBUTOR_ID);
  owners.engineSlots.add(key);
}

/** Inputs for {@link makeCtx}. */
export interface CtxInputs {
  readonly manifest: ManifestV2;
  readonly logger: Logger;
  readonly cwd: string;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
}

/**
 * Builds the Ctx an adapter sees during `contribute()`. Exposed so
 * the install orchestrator can build a fresh Ctx per adapter against
 * its running manifest snapshot, while keeping the same answer
 * resolution semantics applyContributions uses for batch tests.
 */
export function makeCtx(
  adapter: Adapter,
  adapterAnswers: Readonly<Record<string, string>>,
  ctx: CtxInputs,
): Ctx {
  const declared = new Set((adapter.questions ?? []).map((q) => q.id));
  return {
    logger: ctx.logger,
    cwd: ctx.cwd,
    manifest: ctx.manifest,
    templates: ctx.templates,
    processes: ctx.processes,
    answer(questionId: string): string {
      if (!declared.has(questionId)) {
        throw new Error(
          `adapter '${adapter.id}' asked for answer '${questionId}' but did not declare it`,
        );
      }
      const v = adapterAnswers[questionId];
      if (v === undefined) {
        throw new Error(`adapter '${adapter.id}': no resolved answer for question '${questionId}'`);
      }
      return v;
    },
  };
}

/**
 * Applies a single Contribution to a Tree — file writes (with
 * conflict detection), chained patches, and skill staging. Exposed so
 * the install orchestrator can interleave per-adapter manifest
 * updates between applies; it returns the skills staged for this
 * adapter, and `owners` is the cross-adapter memory that turns a
 * second claim on a skill name or a declared region into a refusal
 * naming both origins — one {@link Ownership} per run, threaded by
 * the caller.
 */
export function applyContribution(
  adapter: Adapter,
  contribution: Contribution,
  tree: Tree,
  mode: ApplyMode = 'install',
  owners: Ownership = newOwnership(),
): readonly StagedSkill[] {
  for (const f of contribution.files ?? []) {
    writeWholeFile(adapter, tree, mode, f.path, f.content, f.mode);
    owners.writers.set(canonicalTarget(f.path), adapter.id);
  }
  for (const p of contribution.patches ?? []) {
    const regions = claimRegions(adapter, p, owners);
    const current = tree.read(p.target);
    if (mode === 'scaffold' && current !== null && foundInProject(tree, owners, p.target)) {
      throw new PathConflictError(canonicalTarget(p.target), adapter.id);
    }
    if (current === null && p.seed === undefined) {
      if (mode !== 'scaffold') {
        throw new PathMissingError(canonicalTarget(p.target), adapter.id);
      }
      throw new ContributionConflictError(
        `adapter '${adapter.id}': patch target '${p.target}' does not exist in tree`,
        adapter.id,
        p.target,
        'missing-patch-target',
      );
    }
    const base = current === null ? (p.seed as string) : current.toString('utf8');
    const next = p.apply(base);
    if (regions.length > 0) assertConfined(adapter, p, regions, base, next);
    if (mode === 'reapply' && current !== null) {
      // Unchanged content still goes through the tree when the patch
      // declares a mode: a script that lost its executable bit gets
      // it back, and the tree stages nothing when disk already has it.
      if (next === base && p.mode === undefined) continue;
      // A transform at its own fixed point re-rendered a region it
      // owns — the walking skeleton's stack section of AGENTS.md, a
      // guarded insert someone removed by hand — and the diff
      // reports it, as a whole-file rewrite would. One that is not
      // would compound on the next run, and that is the double
      // application this refuses.
      if (next !== base && p.apply(next) !== next) {
        throw new ContributionConflictError(
          `adapter '${adapter.id}': reapplying its patch would change '${p.target}' — without a recorded base a changed result cannot be told apart from a double application; update the file by hand`,
          adapter.id,
          p.target,
          'reapply-divergence',
        );
      }
    }
    tree.write(p.target, next, p.mode !== undefined ? { mode: p.mode } : undefined);
    owners.writers.set(canonicalTarget(p.target), adapter.id);
  }
  const staged: StagedSkill[] = [];
  for (const raw of contribution.skills ?? []) {
    const skill = stageSkill(adapter, raw, tree, mode, owners.skills);
    for (const file of skill.files) owners.writers.set(canonicalTarget(file.path), adapter.id);
    staged.push(skill);
  }
  return staged;
}

/**
 * Holds a region-owning transform to its declaration through
 * {@link confinementOf}: what lies outside the declared regions must
 * come back as it was, and every region the file carried must
 * survive whole. A `base` whose sentinels are already broken is the
 * file's fault and throws the fix-it message as the transform itself
 * would; anything the transform did is its own, and an escape.
 */
function assertConfined(
  adapter: Adapter,
  patch: ContributionPatch,
  regions: readonly Region[],
  base: string,
  next: string,
): void {
  const escape = confinementOf(base, next, regions, patch.target);
  if (escape === null) return;
  const named = regions.map((r) => `'${r.begin}'`).join(', ');
  const plural = regions.length > 1 ? 's' : '';
  const what = {
    broken: `left the sentinels of the region${plural} it declares (${named}) broken — a region-owning patch keeps both markers of every region it owns`,
    removed: `removed a region it declares (${named}) that the file carried — a region-owning patch keeps both markers of every region it owns`,
    outside: `changed content outside the region${plural} it declares (${named}) — a region-owning patch may re-render only what lies between its own markers`,
  }[escape];
  throw new ContributionConflictError(
    `adapter '${adapter.id}': its patch on '${patch.target}' ${what}`,
    adapter.id,
    patch.target,
    'region-escape',
  );
}

/**
 * Validates the regions a patch declares and claims each for the
 * adapter: a region already owned on that target — by another
 * adapter of the run, by this one twice, or by the engine — is a
 * refusal naming both. The one claim that goes through is the
 * engine's first on a region it pre-owns: that is the projection
 * commands' write path into the `AGENTS.md` slots, once a run.
 * Returns the validated regions, empty for a patch declaring none.
 */
function claimRegions(
  adapter: Adapter,
  patch: ContributionPatch,
  owners: Ownership,
): readonly Region[] {
  const regions = (patch.regions ?? []).map((raw) =>
    assertRegion(raw, `adapter '${adapter.id}', patch on '${patch.target}'`),
  );
  const regionOwners = owners.regions;
  for (const region of regions) {
    const key = regionKey(patch.target, region);
    const owner = regionOwners.get(key);
    if (adapter.id === ENGINE_CONTRIBUTOR_ID && owners.engineSlots.delete(key)) continue;
    if (owner !== undefined) {
      throw new ContributionConflictError(
        owner === adapter.id
          ? `adapter '${adapter.id}' declares region '${region.begin}' of '${patch.target}' twice — one patch owns a region`
          : `adapter '${adapter.id}' declares region '${region.begin}' of '${patch.target}', which ${owner === ENGINE_CONTRIBUTOR_ID ? 'the engine' : `adapter '${owner}'`} already owns — exactly one contributor of a run may own a region of a file`,
        adapter.id,
        patch.target,
        'region-collision',
      );
    }
    regionOwners.set(key, adapter.id);
  }
  return regions;
}

/**
 * Validates one contributed spec, renders it, and writes the skill's
 * whole directory — `SKILL.md` plus supporting files — under the
 * same conflict rules as `files`: an existing path is a refusal on
 * install and a pristine rewrite on reapply.
 */
function stageSkill(
  adapter: Adapter,
  raw: SkillSpec,
  tree: Tree,
  mode: ApplyMode,
  skillOwners: Map<string, string>,
): StagedSkill {
  const parsed = SkillSpecSchema.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'spec'}: ${issue.message}`)
      .join('; ');
    throw new Error(`adapter '${adapter.id}' contributes a malformed skill — ${detail}`);
  }
  const spec = parsed.data;
  const owner = skillOwners.get(spec.name);
  if (owner !== undefined) {
    throw new ContributionConflictError(
      owner === adapter.id
        ? `adapter '${adapter.id}' contributes skill '${spec.name}' twice — a skill is an adapter-owned whole file, one spec per name`
        : `adapter '${adapter.id}' contributes skill '${spec.name}', which adapter '${owner}' already contributes — a skill is an adapter-owned whole file, so exactly one adapter of the resolved set may own the name`,
      adapter.id,
      skillTarget(spec.name),
      'skill-collision',
    );
  }
  skillOwners.set(spec.name, adapter.id);

  const files = [
    { path: skillTarget(spec.name), content: renderSkill(spec) },
    ...(spec.supporting ?? []).map((s) => ({
      path: skillSupportingTarget(spec.name, s.path),
      content: s.content,
    })),
  ];
  for (const f of files) writeWholeFile(adapter, tree, mode, f.path, f.content);
  return {
    adapterId: adapter.id,
    name: spec.name,
    files: files.map((f) => ({ path: f.path, sha256: sha256Of(f.content) })),
  };
}

/**
 * Stages one hook's script as an adapter-owned whole file, executable:
 * a name another adapter of the run already owns is a refusal naming
 * both, an existing path is a conflict on install, and a reapply
 * rewrites the script pristine around whatever its slots hold on
 * disk. Returns the provenance record.
 */
function stageHook(
  adapter: Adapter,
  hook: HookSpec,
  tree: Tree,
  mode: ApplyMode,
  hookOwners: Map<string, string>,
): HarnessFile {
  const target = hookTarget(hook.name);
  const owner = hookOwners.get(hook.name);
  if (owner !== undefined) {
    throw new ContributionConflictError(
      owner === adapter.id
        ? `adapter '${adapter.id}' contributes hook '${hook.name}' twice — a hook is an adapter-owned whole file, one spec per name`
        : `adapter '${adapter.id}' contributes hook '${hook.name}', which adapter '${owner}' already contributes — a hook is an adapter-owned whole file, so exactly one adapter of the resolved set may own the name`,
      adapter.id,
      target,
      'hook-collision',
    );
  }
  hookOwners.set(hook.name, adapter.id);
  const current = tree.read(target);
  const content = renderHook(
    hook,
    mode === 'reapply' && current !== null ? current.toString('utf8') : null,
  );
  writeWholeFile(adapter, tree, mode, target, content, 0o755);
  return { adapterId: adapter.id, path: target, sha256: sha256Of(content) };
}

/**
 * Merges every realized hook into `.claude/settings.json` — seeded
 * when the project has none — and writes it only when the merge
 * changed it. The file is the project's, so on an install this is
 * never a whole-file conflict; keel's entries are attributed to the
 * engine, which wrote them for every contributor alike. Under
 * `keel new` (`scaffold` set) one the directory held before the run
 * is refused, as every file but the {@link ADOPTED_FILES} is there.
 */
function wireHooks(
  hooks: readonly HookSpec[],
  tree: Tree,
  scaffold: Ownership | null,
): HarnessFile {
  const current = tree.read(SETTINGS_TARGET);
  if (scaffold !== null && current !== null && foundInProject(tree, scaffold, SETTINGS_TARGET)) {
    throw new PathConflictError(SETTINGS_TARGET, ENGINE_CONTRIBUTOR_ID);
  }
  const base = current === null ? SETTINGS_SEED : current.toString('utf8');
  const next = eolAware((existing) => mergeHookSettings(existing, hooks))(base);
  if (current === null || next !== base) tree.write(SETTINGS_TARGET, next);
  return { adapterId: ENGINE_CONTRIBUTOR_ID, path: SETTINGS_TARGET, sha256: sha256Of(next) };
}

/**
 * Refuses a run whose hooks may inject more reminders, together, than
 * {@link HOOK_REMINDER_BUDGET} — before anything is staged, naming
 * each contributor's share.
 */
function assertReminderBudget(contributions: readonly HarnessContribution[]): void {
  const shares = contributions
    .map((c) => ({
      adapter: c.adapter.id,
      reminders: c.hooks.reduce((n, hook) => n + hook.reminders.length, 0),
    }))
    .filter((share) => share.reminders > 0);
  const total = shares.reduce((n, share) => n + share.reminders, 0);
  if (total <= HOOK_REMINDER_BUDGET) return;
  const last = shares.at(-1)!;
  throw new ContributionConflictError(
    `the project's hooks may inject ${String(total)} reminders (${shares.map((s) => `'${s.adapter}' ${String(s.reminders)}`).join(', ')}) — at most ${String(HOOK_REMINDER_BUDGET)} across all hooks; drop a hook or fold its reminders`,
    last.adapter,
    SETTINGS_TARGET,
    'reminder-budget',
  );
}

/**
 * The whole-file write contract, shared by `files`, staged skills and
 * hooks: an existing path is a hard conflict on install, and on
 * reapply an overwrite back to pristine — skipped when byte-identical,
 * so the staged changes stay an honest diff, unless the contribution
 * declares a mode: then the write goes through so a lost executable
 * bit comes back, and the tree stages nothing when disk has it.
 *
 * Which conflict depends on who put the file there. One this run
 * created is two contributions writing one path, keel's bug. Anything
 * else was in the project before the run — including a file an
 * earlier contribution patched, which the tree reports as a `modify`
 * — and is refused naming the file.
 */
function writeWholeFile(
  adapter: Adapter,
  tree: Tree,
  mode: ApplyMode,
  filePath: string,
  content: string | Buffer,
  fileMode?: number,
): void {
  if (tree.exists(filePath)) {
    if (mode !== 'reapply') {
      if (!createdThisRun(tree, filePath)) {
        throw new PathConflictError(canonicalTarget(filePath), adapter.id);
      }
      throw new ContributionConflictError(
        `adapter '${adapter.id}' would overwrite '${filePath}', which an earlier contribution of this run created; use a patch to modify existing files`,
        adapter.id,
        filePath,
        'overwrite',
      );
    }
    const current = tree.read(filePath);
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (current !== null && current.equals(next) && fileMode === undefined) return;
  }
  tree.write(filePath, content, fileMode !== undefined ? { mode: fileMode } : undefined);
}

/**
 * Whether `keel new` found `target` in the directory rather than
 * writing it earlier in this run — a file of the user's that a patch
 * would merge into. The two {@link ADOPTED_FILES} are not: adopting
 * them is what their patches are for. Anything else is refused as the
 * whole-file write over it would be, since a `package.json` or a
 * `settings.gradle.kts` of the user's, merged with keel's part, is a
 * build neither of them wrote. The writers map answers the common
 * case — a patch on a file an earlier adapter wrote — without the
 * walk over every staged change.
 */
function foundInProject(tree: Tree, owners: Ownership | null, target: string): boolean {
  const key = canonicalTarget(target);
  if (ADOPTED_FILES.includes(key)) return false;
  if (owners?.writers.has(key) === true) return false;
  return !tree.changes().some((change) => change.path === key);
}

/**
 * Whether the tree's staged changes created `filePath`, as opposed to
 * finding it in the project. Asked only on the way to a refusal, so
 * the walk over every staged change is never on the path of a write.
 */
function createdThisRun(tree: Tree, filePath: string): boolean {
  const key = canonicalTarget(filePath);
  return tree.changes().some((change) => change.kind === 'create' && change.path === key);
}

function sha256Of(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
