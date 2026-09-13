/** Reconstructs declared harness elements from a project's recorded installation history. */
import type { ManifestV2, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import { DomainError } from '../kernel/result.js';
import { addModuleInputs, CONTEXT_TAG } from './adapters/added-context.js';
import { installVertical, type InstallVerticalInputs } from './install.js';
import { boundedContextVertical } from './verticals/bounded-context.js';

/**
 * Re-renders installed contributors non-interactively, collecting only
 * their declared harness elements. Each recorded context gets one
 * synthetic run; no domain file, action, tag or transient input persists.
 */
export async function retrofitHarness(
  inputs: Omit<InstallVerticalInputs, 'vertical'> & { readonly registry: Registry },
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
  for (const installed of inputs.manifest.verticals) {
    if (installed.id === 'agent-harness' || installed.id === 'bounded-context') continue;
    const vertical =
      inputs.registry.vertical(installed.id) ??
      inputs.registry
        .stacks()
        .flatMap((stack) => stack.verticals)
        .find((v) => v.id === installed.id);
    if (!vertical) {
      throw new DomainError(
        `cannot restore harness elements from installed vertical '${installed.id}' — restore the plugin that provides it and re-run 'keel add agent-harness'`,
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
