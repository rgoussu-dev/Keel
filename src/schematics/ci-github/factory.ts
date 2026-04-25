import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';

/**
 * Scaffolds two GitHub Actions workflows that together implement the
 * "build once, promote many" pipeline:
 *
 *   - `.github/workflows/ci.yml` — on every push to `main` (and PR): run
 *     Gradle `check build`, tag the resulting native image with the
 *     commit SHA (`:sha-<12>`), push to Artifact Registry, and roll the
 *     Cloud Run revision through `tofu apply`. Continuous deployment,
 *     per §6 of the conventions. Pull requests build + test but never
 *     deploy.
 *
 *   - `.github/workflows/release.yml` — manual `workflow_dispatch` with
 *     a `bump` input (`patch | minor | major`). Re-tags the latest
 *     `:sha-<…>` image as `:vX.Y.Z` and `:latest` without rebuilding
 *     (image promotion is atomic at the registry level), bumps
 *     `gradle.properties`, shifts the `CHANGELOG.md [Unreleased]` entry
 *     to a dated heading, commits with `[skip ci]`, and pushes the
 *     `vX.Y.Z` tag.
 *
 * Both workflows authenticate to GCP via Workload Identity Federation
 * (no long-lived SA JSON keys). Required GitHub secrets — written to
 * the repo after running `iac/bootstrap/bootstrap.sh` and the first
 * `tofu apply`:
 *   GCP_PROJECT_ID, GCP_REGION, GCP_WIF_PROVIDER,
 *   GCP_DEPLOYER_SA_EMAIL, GCP_RUNTIME_SA_EMAIL,
 *   GCP_ARTIFACT_REGISTRY_URL.
 *
 * Parameters:
 *   - `serviceName` — used to inject the Cloud Run service name into
 *     `tofu apply -var service_name=...`. The walking-skeleton
 *     orchestrator passes its `projectName`.
 *
 * Composition: normally invoked by walking-skeleton alongside
 * `iac-cloudrun`; also runs standalone.
 */
export const ciGithubSchematic: Schematic = {
  name: 'ci-github',
  description: 'GitHub Actions workflows: CD on main + workflow_dispatch release promoting images.',
  parameters: [
    {
      name: 'serviceName',
      description: 'Cloud Run service name injected into tofu apply.',
      required: true,
      prompt: { kind: 'input', name: 'serviceName', message: 'cloud run service name' },
    },
  ],

  async run(tree: Tree, options: Options, ctx: Context): Promise<void> {
    const vars = resolve(options);
    const templateRoot = path.join(paths.asset('schematics'), 'ci-github', 'templates', 'common');
    await renderTemplate(tree, templateRoot, '', vars as unknown as Record<string, unknown>);
    ctx.logger.info(
      'ci-github: ci.yml + release.yml rendered. Remember to set the GCP_* GitHub secrets after the first tofu apply.',
    );
  },
};

interface ResolvedVars {
  serviceName: string;
}

function resolve(options: Options): ResolvedVars {
  const raw = String(options['serviceName'] ?? '').trim();
  if (!raw) throw new Error('ci-github: `serviceName` is required');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(raw)) {
    throw new Error(
      `ci-github: invalid serviceName "${raw}" (lowercase letters, digits, and dashes only; must start with a letter; 63 chars max)`,
    );
  }
  return { serviceName: raw };
}
