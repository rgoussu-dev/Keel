/**
 * The engine's shared spine: the ports the handlers run on, reading
 * the contract (the manifest's `toolchain` block, guarded), and the
 * shapes both handlers derive from a provider record. Shared so
 * install and check cannot drift on what "no block", "uncovered
 * need", or "manager present" means.
 */

import type { ManifestStore } from '../../contract/ports/manifest-store.js';
import type { ProcessRunner } from '../../contract/ports/process-runner.js';
import type { TreeFactory } from '../../contract/ports/tree.js';
import type { ToolchainNeed } from '../../contract/toolchain.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { ProvisionedTool } from '../contract/commands.js';
import type { ToolchainProvider } from './provider.js';

/**
 * The ports the provisioning handlers are wired with — all from
 * `domain/contract/ports`, the shared half of the seam. The context
 * declares no ports of its own: the block rides the manifest store,
 * the config lands through a Tree, and the provider's binary is
 * reached through the ProcessRunner, the same wall keel's deferred
 * actions use.
 */
export interface ToolchainDeps {
  readonly trees: TreeFactory;
  readonly manifests: ManifestStore;
  readonly processes: ProcessRunner;
}

/**
 * Reads the project's declared needs, or the reason there are none
 * to provision: no project, no block, or a need the provider does
 * not cover — the coverage invariant says a provider is never
 * offered for a needs set it covers only partially, so an uncovered
 * need is a refusal, not a skip.
 */
export async function loadNeeds(
  deps: ToolchainDeps,
  cwd: string,
  provider: ToolchainProvider,
): Promise<Result<readonly ToolchainNeed[]>> {
  const scopeRoot = projectScopeRoot(cwd);
  const manifest = await deps.manifests.read(scopeRoot);
  if (!manifest) {
    return err(
      new DomainError(
        `no project initialised at ${scopeRoot} — run 'keel new --stack=<id>' first`,
        'keel.not-initialised',
      ),
    );
  }
  if (!manifest.toolchain) {
    return err(
      new DomainError(
        "the manifest declares no toolchain block — run 'keel add toolchain' first",
        'keel.toolchain-not-declared',
      ),
    );
  }
  const uncovered = manifest.toolchain.needs.filter((need) => !provider.covers.includes(need.tool));
  if (uncovered.length > 0) {
    return err(
      new DomainError(
        `${provider.id} cannot satisfy: ${uncovered.map((need) => need.tool).join(', ')} — ` +
          'a provider is only offered for a needs set it covers whole',
        'keel.toolchain-uncovered-need',
      ),
    );
  }
  return ok(manifest.toolchain.needs);
}

/** The needs as the report DTOs carry them: spelled, in block order. */
export function provisionedTools(
  provider: ToolchainProvider,
  needs: readonly ToolchainNeed[],
): readonly ProvisionedTool[] {
  return needs.map((need) => {
    const spelled = provider.spell(need);
    return {
      tool: need.tool,
      version: need.version,
      spelledName: spelled.name,
      spelledVersion: spelled.version,
    };
  });
}

/** Whether the provider's binary answers its presence probe. */
export function managerPresent(
  deps: ToolchainDeps,
  provider: ToolchainProvider,
  cwd: string,
): boolean {
  const probe = deps.processes.run(provider.probe.command, provider.probe.args, { cwd });
  return probe.startFailure === undefined && probe.status === 0;
}
