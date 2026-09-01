/**
 * The contribution applier.
 *
 * Takes a topologically-ordered list of adapters, a Tree to write
 * into, and the resolved answers per adapter, and walks the chain:
 *   1. For each adapter, build a `Ctx` whose `answer()` reads from
 *      the resolved answer map for that adapter.
 *   2. Invoke `adapter.contribute(ctx)` to get a Contribution.
 *   3. Apply `files` (whole-file writes), with conflict detection: a
 *      whole-file write to a path that already exists in the Tree
 *      (whether from an earlier adapter or from disk) is a hard
 *      error. To modify existing files, use `patches` instead.
 *   4. Apply `patches` (read–transform–write); a patch whose target
 *      doesn't exist is an error, unless the patch supplies a `seed`
 *      — then the transform runs against the seed and the result is
 *      written as a new file (the shared-file upsert).
 *   5. Stage `skills` — each spec validated against its schema,
 *      rendered with `renderSkill`, and written to
 *      `.claude/skills/<name>/SKILL.md` (plus supporting files) with
 *      the same whole-file conflict rules as `files`. A skill name
 *      two adapters of the run both contribute is a hard refusal
 *      naming both origins.
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
import type {
  DeferredAction,
  Adapter,
  Contribution,
  Ctx,
  ManifestV2,
  Tag,
  Tree,
} from '../contract/composition.js';
import type { Logger } from '../contract/ports/logger.js';
import type { ProcessRunner } from '../contract/ports/process-runner.js';
import type { TemplateSource } from '../contract/ports/template-source.js';

/** Per-adapter answer map: questionId → value. */
export type AnswersByAdapter = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * How contributions meet files already in the Tree.
 *
 * `install` (the default) is the greenfield/brownfield contract: a
 * whole-file write to an existing path is a hard conflict, and every
 * patch writes its result.
 *
 * `reapply` is the day-2 contract for re-rendering an installed
 * vertical: whole-file writes **overwrite** their target (skipped when
 * the content is byte-identical, so the staged changes are an honest
 * diff), while a patch against an existing file must be a no-op —
 * a patch whose transform would change an already-patched file is
 * indistinguishable from a double application and conflicts instead
 * of writing.
 */
export type ApplyMode = 'install' | 'reapply';

/** One file a staged skill put into the Tree, with its content hash. */
export interface StagedSkillFile {
  /** Path relative to the project root (`.claude/skills/<name>/…`). */
  readonly path: string;
  /** sha256 of the staged content, hex — the manifest's provenance hash. */
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
 * Thrown when a contribution conflicts with the existing Tree state.
 * Carries the offending path and adapter id for diagnostics.
 */
export class ContributionConflictError extends Error {
  constructor(
    message: string,
    readonly adapterId: string,
    readonly path: string,
    readonly kind: 'overwrite' | 'missing-patch-target' | 'reapply-divergence' | 'skill-collision',
  ) {
    super(message);
    this.name = 'ContributionConflictError';
  }
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
  const skills: StagedSkill[] = [];
  const skillOwners = new Map<string, string>();
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
    skills.push(...applyContribution(adapter, contribution, inputs.tree, inputs.mode, skillOwners));
    for (const t of contribution.tagsAdd ?? []) tagsAdded.add(t);
    for (const a of contribution.actions ?? []) actions.push(a);
  }

  return { tagsAdded: [...tagsAdded], skills, actions };
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
 * adapter, and `skillOwners` (skill name → owning adapter id) is the
 * cross-adapter memory that turns a second claim on a name into a
 * refusal naming both origins — one map per run, threaded by the
 * caller.
 */
export function applyContribution(
  adapter: Adapter,
  contribution: Contribution,
  tree: Tree,
  mode: ApplyMode = 'install',
  skillOwners: Map<string, string> = new Map(),
): readonly StagedSkill[] {
  for (const f of contribution.files ?? []) {
    writeWholeFile(adapter, tree, mode, f.path, f.content, f.mode);
  }
  for (const p of contribution.patches ?? []) {
    const current = tree.read(p.target);
    if (current === null && p.seed === undefined) {
      throw new ContributionConflictError(
        `adapter '${adapter.id}': patch target '${p.target}' does not exist in tree`,
        adapter.id,
        p.target,
        'missing-patch-target',
      );
    }
    const base = current === null ? (p.seed as string) : current.toString('utf8');
    const next = p.apply(base);
    if (mode === 'reapply' && current !== null) {
      if (next === base) continue;
      throw new ContributionConflictError(
        `adapter '${adapter.id}': reapplying its patch would change '${p.target}' — without a recorded base a changed result cannot be told apart from a double application; update the file by hand`,
        adapter.id,
        p.target,
        'reapply-divergence',
      );
    }
    tree.write(p.target, next);
  }
  const staged: StagedSkill[] = [];
  for (const raw of contribution.skills ?? []) {
    staged.push(stageSkill(adapter, raw, tree, mode, skillOwners));
  }
  return staged;
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
 * The whole-file write contract, shared by `files` and staged skills:
 * an existing path is a hard conflict on install, and on reapply an
 * overwrite back to pristine — skipped when byte-identical, so the
 * staged changes stay an honest diff.
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
      throw new ContributionConflictError(
        `adapter '${adapter.id}' would overwrite existing path '${filePath}'; use a patch to modify existing files`,
        adapter.id,
        filePath,
        'overwrite',
      );
    }
    const current = tree.read(filePath);
    const next = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    if (current !== null && current.equals(next)) return;
  }
  tree.write(filePath, content, fileMode !== undefined ? { mode: fileMode } : undefined);
}

function sha256Of(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}
