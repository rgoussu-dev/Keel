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
 *        d. apply files/patches against the Tree; collect actions
 *           and agentic bundles for the caller; fold `tagsAdd` into
 *           the running manifest.
 *   3. Record the vertical as installed and bump `updatedAt`.
 *
 * Pure with respect to disk: mutates the supplied Tree in memory and
 * returns the next manifest. The caller commits both.
 */

import { resolveAdapterAnswers, type AnswerMode, type Prompt } from './answers.js';
import { applyContribution, makeCtx, type ApplyResult } from './apply.js';
import { resolveVertical } from './resolver.js';
import type {
  DeferredAction,
  AgenticBundle,
  InstalledVertical,
  ManifestV2,
  Tag,
  Tree,
  Vertical,
} from '../domain/contract/composition.js';
import type { Logger } from '../util/log.js';

/** Inputs to `installVertical`. */
export interface InstallVerticalInputs {
  readonly vertical: Vertical;
  readonly manifest: ManifestV2;
  readonly tree: Tree;
  readonly mode: AnswerMode;
  readonly prompt: Prompt;
  readonly logger: Logger;
  readonly cwd: string;
  /** Time source — injected so tests can pin `installedAt`/`updatedAt`. */
  readonly now: () => string;
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
  const ordered = resolveVertical(inputs.vertical, inputs.manifest.tags);

  let running: ManifestV2 = inputs.manifest;
  const collectedActions: DeferredAction[] = [];
  const collectedAgentic: Record<string, AgenticBundle> = {};
  const allTagsAdded = new Set<Tag>();

  for (const adapter of ordered) {
    const stored = running.answers[adapter.id] ?? {};
    const resolution = await resolveAdapterAnswers(adapter, stored, inputs.mode, inputs.prompt);

    running = foldAnswers(running, adapter.id, resolution.answers, resolution.updates);

    const ctx = makeCtx(adapter, resolution.answers, {
      manifest: running,
      logger: inputs.logger,
      cwd: inputs.cwd,
    });
    const contribution = await adapter.contribute(ctx);
    applyContribution(adapter, contribution, inputs.tree);

    if (contribution.tagsAdd && contribution.tagsAdd.length > 0) {
      running = foldTags(running, contribution.tagsAdd);
      for (const t of contribution.tagsAdd) allTagsAdded.add(t);
    }
    for (const a of contribution.actions ?? []) collectedActions.push(a);
    if (contribution.agentic) collectedAgentic[adapter.id] = contribution.agentic;
  }

  const final = recordVertical(running, inputs.vertical, inputs.now());

  return {
    manifest: final,
    applyResult: {
      tagsAdded: [...allTagsAdded],
      agentic: collectedAgentic,
      actions: collectedActions,
    },
  };
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
