/** Reconstructs declared harness elements from a project's recorded installation history. */
import type { ManifestV2, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import { DomainError } from '../kernel/result.js';
import { addModuleInputs, CONTEXT_TAG } from './adapters/added-context.js';
import { addedContextsOf } from './contexts.js';
import { installVertical, type InstallVerticalInputs } from './install.js';
import { missingHarnessContributorSentence } from './refusals.js';
import { installedVertical } from './registry.js';
import { boundedContextVertical } from './verticals/bounded-context.js';

/**
 * How much of a project's recorded installation history a replay
 * covers.
 *
 * `adopting` is what `keel add agent-harness` needs: every recorded
 * contributor **except** the harness vertical itself, which the
 * enclosing install is rendering for real. `complete` adds it back —
 * what the navigation index needs, since the family kits' documents
 * and skills are the harness vertical's own and an index missing them
 * would be an index of nothing.
 */
export type HarnessReplayScope = 'adopting' | 'complete';

/**
 * Re-renders installed contributors non-interactively, collecting only
 * their declared harness elements. Each context `keel add module` added
 * (`./contexts.ts` `addedContextsOf`) gets one synthetic run of keel's own
 * `bounded-context` — the vertical that command runs, never one a
 * registry lists — and the skeleton's and the peer's none, since they
 * are `walking-skeleton`'s, replayed with it; no domain file, action,
 * tag or transient input persists.
 */
export async function retrofitHarness(
  inputs: Omit<InstallVerticalInputs, 'vertical'> & {
    readonly registry: Registry;
    /** Defaults to `adopting`, the posture `keel add agent-harness` replays under. */
    readonly scope?: HarnessReplayScope;
    /**
     * The command line of the run that replays, which a refusal of a
     * recorded vertical nothing registered provides names to re-run.
     * Defaults to `keel docs sync` under `complete`, and to `keel add
     * agent-harness` otherwise.
     */
    readonly line?: string;
  },
): Promise<void> {
  const replay = async (vertical: Vertical, manifest: ManifestV2) => {
    await installVertical({
      ...inputs,
      vertical,
      manifest,
      mode: 'non-interactive',
      apply: 'reapply',
      harnessOnly: true,
    });
  };
  const scope = inputs.scope ?? 'adopting';
  for (const installed of inputs.manifest.verticals) {
    if (installed.id === boundedContextVertical.id) continue;
    if (installed.id === 'agent-harness' && scope === 'adopting') continue;
    const vertical = installedVertical(inputs.registry, installed.id);
    if (!vertical) {
      throw new DomainError(
        missingHarnessContributorSentence(
          installed.id,
          inputs.line ?? (scope === 'complete' ? 'keel docs sync' : 'keel add agent-harness'),
        ),
        'keel.missing-harness-contributor',
      );
    }
    await replay(vertical, inputs.manifest);
  }
  for (const context of addedContextsOf(inputs.manifest)) {
    await replay(boundedContextVertical, {
      ...inputs.manifest,
      tags: [...new Set([...inputs.manifest.tags, CONTEXT_TAG])],
      answers: { ...inputs.manifest.answers, ...addModuleInputs(context) },
    });
  }
}
