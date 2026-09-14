/** Reconstructs declared harness elements from a project's recorded installation history. */
import type { ManifestV2, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import { DomainError } from '../kernel/result.js';
import { addModuleInputs, CONTEXT_TAG } from './adapters/added-context.js';
import { installVertical, type InstallVerticalInputs } from './install.js';
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
 * their declared harness elements. Each recorded context gets one
 * synthetic run; no domain file, action, tag or transient input persists.
 */
export async function retrofitHarness(
  inputs: Omit<InstallVerticalInputs, 'vertical'> & {
    readonly registry: Registry;
    /** Defaults to `adopting`, the posture `keel add agent-harness` replays under. */
    readonly scope?: HarnessReplayScope;
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
    if (installed.id === 'bounded-context') continue;
    if (installed.id === 'agent-harness' && scope === 'adopting') continue;
    const vertical =
      inputs.registry.vertical(installed.id) ??
      inputs.registry
        .stacks()
        .flatMap((stack) => stack.verticals)
        .find((v) => v.id === installed.id);
    if (!vertical) {
      throw new DomainError(
        `cannot restore harness elements from installed vertical '${installed.id}' — restore the plugin that provides it and re-run '${scope === 'complete' ? 'keel docs sync' : 'keel add agent-harness'}'`,
        'keel.missing-harness-contributor',
      );
    }
    await replay(vertical, inputs.manifest);
  }
  const contexts = inputs.registry.vertical('bounded-context') ?? boundedContextVertical;
  for (const module of inputs.manifest.modules) {
    await replay(contexts, {
      ...inputs.manifest,
      tags: [...new Set([...inputs.manifest.tags, CONTEXT_TAG])],
      answers: {
        ...inputs.manifest.answers,
        ...addModuleInputs({ name: module.name, consumes: module.consumes ?? null }),
      },
    });
  }
}
