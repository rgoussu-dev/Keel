import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';

/**
 * Scaffolds two OpenTofu modules split by lifecycle:
 *
 *   - {@code /iac/bootstrap/} runs once from a developer laptop and
 *     owns everything long-lived and rarely-changing: the GCS tofu
 *     state bucket (via a shell pre-step; tofu can't manage its own
 *     backend), the Artifact Registry Docker repo, the Workload
 *     Identity Federation pool + provider, and the deployer service
 *     account — scoped by an `attribute.repository` condition so only
 *     the chosen GitHub repo can impersonate it (no long-lived keys).
 *   - {@code /iac/cloudrun/} runs from CI on every push and owns the
 *     Cloud Run v2 service only. Because bootstrap creates WIF + AR
 *     + deployer SA up front, the very first `git push` to `main`
 *     can create the service unattended — there is no "first
 *     deploy must happen from a laptop" step.
 *
 * Both modules back their state in the same GCS bucket under distinct
 * prefixes (`bootstrap/state` and `cloudrun/state`).
 *
 * The Dockerfile lives with `/iac/cloudrun/` and builds the Quarkus
 * runnable as a GraalVM native image — keel's "packaging is iac's
 * job" convention keeps the application module packaging-agnostic.
 *
 * Tofu variables (project id, service name, image reference, GitHub
 * slug) are supplied at `tofu plan`/`apply` time and never at scaffold
 * time, so a single generated module is re-usable across envs and
 * forks. The schematic takes no required parameters for this reason.
 *
 * Composition: invoked by walking-skeleton when Cloud Run is the chosen
 * deploy target; also runs standalone via `keel generate iac-cloudrun`.
 */
export const iacCloudrunSchematic: Schematic = {
  name: 'iac-cloudrun',
  description:
    'Scaffold /iac/bootstrap/ (tofu AR + WIF + deployer SA, run once) and /iac/cloudrun/ (tofu Cloud Run service, run by CI).',
  parameters: [],

  async run(tree: Tree, _options: Options, ctx: Context): Promise<void> {
    const templateRoot = path.join(
      paths.asset('schematics'),
      'iac-cloudrun',
      'templates',
      'common',
    );
    await renderTemplate(tree, templateRoot, '', {});
    ctx.logger.info(
      'iac-cloudrun: /iac/bootstrap + /iac/cloudrun rendered. Next: PROJECT_ID=… ./iac/bootstrap/bootstrap.sh, then `cd iac/bootstrap && tofu apply`.',
    );
  },
};
