import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';

/**
 * Scaffolds the {@code /iac/cloudrun/} OpenTofu module and the
 * {@code /iac/bootstrap/} one-shot that provisions the resources tofu
 * itself cannot create (the GCS state bucket and the required GCP APIs).
 *
 * What the module declares:
 *   - a Cloud Run v2 service with scale-to-zero defaults;
 *   - an Artifact Registry Docker repo colocated with the service;
 *   - a Workload Identity Federation pool + provider + service account,
 *     scoped by an `attribute.repository` condition so only the chosen
 *     GitHub repo can impersonate the deployer SA (no long-lived keys);
 *   - a `Dockerfile` that builds Quarkus as a **native image** — this is
 *     where keel's "packaging is iac's job" convention lands: the
 *     application module itself stays packaging-agnostic.
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
    'Scaffold /iac/cloudrun/ (tofu Cloud Run + WIF) and /iac/bootstrap/ (state-bucket one-shot).',
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
      'iac-cloudrun: /iac/cloudrun + /iac/bootstrap rendered. Next: PROJECT_ID=… ./iac/bootstrap/bootstrap.sh',
    );
  },
};
