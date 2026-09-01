/**
 * The top-level orchestrator: install one vertical against a manifest
 * and a Tree.
 *
 * Pipeline:
 *   1. `resolveVertical` — predicate match → topo sort → coverage check.
 *   2. For each adapter in order:
 *        a. resolve its questions against the running manifest's
 *           sticky answers (or prompt / default);
 *        b. fold the resolved answers and any tags promoted by
 *           prior adapters into a *running manifest snapshot* —
 *           every subsequent adapter's `ctx.manifest` reflects this
 *           snapshot, so adapters can read upstream choices (e.g.
 *           `basePackage` from the bootstrap) without re-asking;
 *        c. invoke `adapter.contribute(ctx)` to get a Contribution;
 *        d. apply files/patches against the Tree and stage declared
 *           skills; collect actions for the caller; fold `tagsAdd`,
 *           declared `toolchain` needs and staged-skill provenance
 *           entries into the running manifest.
 *   3. Record the vertical as installed and bump `updatedAt`.
 *
 * Pure with respect to disk: mutates the supplied Tree in memory and
 * returns the next manifest. The caller commits both.
 */

import { resolveAdapterAnswers } from './answers.js';
import type { AnswerMode, Prompt } from '../contract/ports/prompt.js';
import { effectiveTags } from '../contract/manifest.js';
import { TOOLCHAIN_SCHEMA_VERSION, type ToolchainNeed } from '../contract/toolchain.js';
import {
  applyContribution,
  makeCtx,
  type ApplyMode,
  type ApplyResult,
  type StagedSkill,
} from './apply.js';
import { resolveVertical } from './resolver.js';
import type {
  Adapter,
  DeferredAction,
  InstalledVertical,
  ManifestEntry,
  ManifestV2,
  Tag,
  Tree,
  Vertical,
} from '../contract/composition.js';
import type { Logger } from '../contract/ports/logger.js';
import type { ProcessRunner } from '../contract/ports/process-runner.js';
import type { TemplateSource } from '../contract/ports/template-source.js';

/** Inputs to `installVertical`. */
export interface InstallVerticalInputs {
  readonly vertical: Vertical;
  readonly manifest: ManifestV2;
  readonly tree: Tree;
  readonly mode: AnswerMode;
  readonly prompt: Prompt;
  readonly logger: Logger;
  readonly cwd: string;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
  /** Time source — injected so tests can pin `installedAt`/`updatedAt`. */
  readonly now: () => string;
  /**
   * Conflict posture towards files already in the Tree; defaults to
   * `install`. `reapply` re-renders over the previous rendering — see
   * {@link ApplyMode}.
   */
  readonly apply?: ApplyMode;
}

/** Result of installing a vertical. */
export interface InstallVerticalResult {
  /** The next manifest, with tags/vertical/answers merged. */
  readonly manifest: ManifestV2;
  /** The raw apply result, for diagnostics or reuse by callers. */
  readonly applyResult: ApplyResult;
}

export async function installVertical(
  inputs: InstallVerticalInputs,
): Promise<InstallVerticalResult> {
  const ordered = resolveVertical(inputs.vertical, effectiveTags(inputs.manifest));

  let running: ManifestV2 = inputs.manifest;
  const collectedActions: DeferredAction[] = [];
  const collectedSkills: StagedSkill[] = [];
  const skillOwners = new Map<string, string>();
  const allTagsAdded = new Set<Tag>();

  for (const adapter of ordered) {
    const stored = { ...sharedAnswers(running, adapter), ...(running.answers[adapter.id] ?? {}) };
    const resolution = await resolveAdapterAnswers(adapter, stored, inputs.mode, inputs.prompt);

    running = foldAnswers(running, adapter.id, resolution.answers, resolution.updates);

    const ctx = makeCtx(adapter, resolution.answers, {
      manifest: running,
      logger: inputs.logger,
      cwd: inputs.cwd,
      templates: inputs.templates,
      processes: inputs.processes,
    });
    const contribution = await adapter.contribute(ctx);
    const staged = applyContribution(adapter, contribution, inputs.tree, inputs.apply, skillOwners);

    if (contribution.tagsAdd && contribution.tagsAdd.length > 0) {
      assertDeclaredPromotions(inputs.vertical, adapter, contribution.tagsAdd);
      running = foldTags(running, contribution.tagsAdd);
      for (const t of contribution.tagsAdd) allTagsAdded.add(t);
    }
    if (contribution.toolchain && contribution.toolchain.length > 0) {
      running = foldToolchain(running, contribution.toolchain);
    }
    if (staged.length > 0) {
      assertDeclaredSkills(inputs.vertical, adapter, staged);
      running = foldSkillEntries(running, staged, inputs.now());
      collectedSkills.push(...staged);
    }
    for (const a of contribution.actions ?? []) collectedActions.push(a);
  }

  const final = recordVertical(running, inputs.vertical, inputs.now());

  return {
    manifest: final,
    applyResult: {
      tagsAdded: [...allTagsAdded],
      skills: collectedSkills,
      actions: collectedActions,
    },
  };
}

/**
 * Holds `Vertical.promotes` to its meaning: the complete set of tags
 * installing the vertical may add.
 *
 * The declaration exists so a caller can reason about promotions
 * *before* the install — which is only sound while it is exhaustive,
 * and nothing about writing `tagsAdd` in an adapter makes an author
 * revisit a list in another file. So the engine checks it where the
 * two meet. An undeclared tag is a keel bug, not a user error, so it
 * throws rather than travelling as an `Err`.
 */
function assertDeclaredPromotions(
  vertical: Vertical,
  adapter: Adapter,
  tagsAdd: readonly Tag[],
): void {
  const declared = new Set(vertical.promotes ?? []);
  const undeclared = tagsAdd.filter((tag) => !declared.has(tag));
  if (undeclared.length === 0) return;
  throw new Error(
    `adapter '${adapter.id}' promotes ${undeclared.join(', ')}, which vertical '${vertical.id}' does not declare in 'promotes' — add it there, or the front-door coverage check will refuse compositions this tag enables`,
  );
}

/**
 * Holds `Vertical.skills` to its meaning, exactly as
 * {@link assertDeclaredPromotions} holds `promotes`: the complete set
 * of skill names installing the vertical may stage. An undeclared
 * name is a keel (or plugin) bug, not a user error, so it throws.
 */
function assertDeclaredSkills(
  vertical: Vertical,
  adapter: Adapter,
  staged: readonly StagedSkill[],
): void {
  const declared = new Set(vertical.skills ?? []);
  const undeclared = staged.map((skill) => skill.name).filter((name) => !declared.has(name));
  if (undeclared.length === 0) return;
  throw new Error(
    `adapter '${adapter.id}' contributes skill '${undeclared.join("', '")}', which vertical '${vertical.id}' does not declare in 'skills' — add it there, so what an assembly ships can be reported before applying`,
  );
}

/**
 * Upserts one provenance record per staged skill file into the
 * manifest's `entries`, keyed by target path: `source` names the
 * owning adapter, the hashes pin the pristine content, and a reapply
 * refreshes hashes in place — keeping the original `installedAt` —
 * instead of duplicating the entry.
 */
function foldSkillEntries(
  manifest: ManifestV2,
  staged: readonly StagedSkill[],
  now: string,
): ManifestV2 {
  const byTarget = new Map<string, ManifestEntry>(manifest.entries.map((e) => [e.target, e]));
  for (const skill of staged) {
    for (const file of skill.files) {
      const prior = byTarget.get(file.path);
      byTarget.set(file.path, {
        source: skill.adapterId,
        target: file.path,
        sha256Shipped: file.sha256,
        sha256Current: file.sha256,
        installedAt: prior?.installedAt ?? now,
      });
    }
  }
  return { ...manifest, entries: [...byTarget.values()] };
}

/**
 * The sticky memory an adapter borrows from its
 * {@link Adapter.sharesAnswersWith} siblings — earlier entries first,
 * each overridden by the next, and all of them by the adapter's own
 * recorded answers at the call site.
 */
function sharedAnswers(manifest: ManifestV2, adapter: Adapter): Record<string, string> {
  const shared: Record<string, string> = {};
  for (const id of adapter.sharesAnswersWith ?? []) {
    Object.assign(shared, manifest.answers[id] ?? {});
  }
  return shared;
}

function foldAnswers(
  manifest: ManifestV2,
  adapterId: string,
  resolved: Readonly<Record<string, string>>,
  updates: Readonly<Record<string, string>>,
): ManifestV2 {
  // The full resolution map includes both already-stored sticky
  // answers (returned for the running snapshot so downstream
  // adapters can read them) and newly-supplied ones (the `updates`
  // subset, which is what gets persisted on a sticky question's
  // first ask). For the running snapshot, fold the full resolved
  // map so adapters always see the same view; the persistence
  // distinction (sticky-vs-repeat) shows up in `answer.persist` and
  // is preserved here implicitly because `updates` is a subset of
  // `resolved`.
  void updates;
  if (Object.keys(resolved).length === 0) return manifest;
  return {
    ...manifest,
    answers: {
      ...manifest.answers,
      [adapterId]: { ...(manifest.answers[adapterId] ?? {}), ...resolved },
    },
  };
}

// Upsert by tool: reapply refreshes a need's version in place (the
// pin-bump path) rather than duplicating the entry; needs another
// adapter declared earlier stay. Sorted so the block is deterministic
// regardless of adapter resolution order.
function foldToolchain(manifest: ManifestV2, needs: readonly ToolchainNeed[]): ManifestV2 {
  const merged = new Map<string, ToolchainNeed>(
    (manifest.toolchain?.needs ?? []).map((n) => [n.tool, n]),
  );
  for (const need of needs) merged.set(need.tool, need);
  return {
    ...manifest,
    toolchain: {
      schemaVersion: TOOLCHAIN_SCHEMA_VERSION,
      needs: [...merged.values()].sort((a, b) => a.tool.localeCompare(b.tool)),
      // The manager choice belongs to the provisioning engine, not to
      // this vertical: a reapply refreshes versions and leaves the
      // recorded choice exactly where the engine put it.
      ...(manifest.toolchain?.provider === undefined
        ? {}
        : { provider: manifest.toolchain.provider }),
    },
  };
}

function foldTags(manifest: ManifestV2, tagsAdd: readonly Tag[]): ManifestV2 {
  return {
    ...manifest,
    tags: [...new Set([...manifest.tags, ...tagsAdd])].sort(),
  };
}

function recordVertical(manifest: ManifestV2, vertical: Vertical, now: string): ManifestV2 {
  const verticals: InstalledVertical[] = manifest.verticals.some((v) => v.id === vertical.id)
    ? [...manifest.verticals]
    : [...manifest.verticals, { id: vertical.id, installedAt: now }];
  return {
    ...manifest,
    verticals,
    updatedAt: now,
  };
}
