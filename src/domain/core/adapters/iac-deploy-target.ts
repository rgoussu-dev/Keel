/**
 * `iac/deploy-target` adapter — provisions, in OpenTofu, the deploy
 * target the `distribution` vertical publishes to. Keyed on the
 * `dist.container-image` tag that vertical promotes: a registry-fed
 * runtime is the only target shape keel knows how to provision, so
 * without a release pipeline pushing images there is nothing to key
 * on.
 *
 * The **deployment flavor is read, not re-asked** — exactly as the
 * JVM image flavor is read by the release pipeline. `distribution`
 * already asked compose-vs-helm and emitted the matching descriptor;
 * this adapter reads that recorded dial and provisions the shape the
 * descriptor deploys to: `compose` → a Docker VM the compose file
 * runs on, `helm` → a managed Kubernetes cluster the chart installs
 * into. A second question could provision a target the descriptor
 * cannot use.
 *
 * The **cloud provider is a sticky dial** with one template subtree
 * per choice, following the `ci` provider and the deployment flavor:
 * nothing in the manifest's tag set knows which cloud the project
 * deploys to, so the choice belongs to the user, asked exactly once.
 *
 * Binding spec §5 shapes every emitted tree: modules live at
 * `/iac/<target>/`, state is remote by default (the provider's
 * S3-compatible object storage) with a one-shot `bootstrap.sh` that
 * provisions the state bucket from a local-state bootstrap config,
 * one state per environment via workspaces, and no secret ever lands
 * in a file — provider credentials ride the environment, 12-factor.
 */

import type { Adapter, Ctx, ManifestV2, Question, Tag } from '../../contract/composition.js';
import { bootstrapProjectName, deployFlavor, type DeployFlavor } from './distribution-container.js';

export const IAC_DEPLOY_TARGET_ID = 'iac/deploy-target';

/** A cloud provider keel can provision a deploy target on. */
export type IacCloud = 'digitalocean' | 'scaleway';

/** Every cloud the dial offers, in choice order. */
export const IAC_CLOUDS: readonly IacCloud[] = ['digitalocean', 'scaleway'];

/** The tag recorded once a deploy target exists, whatever the cloud. */
export const OPENTOFU_TAG: Tag = 'iac.opentofu';

/** The capability tag naming the cloud a deploy target was provisioned on. */
export function cloudTag(cloud: IacCloud): Tag {
  return `cloud.${cloud}`;
}

/**
 * The cloud dial. DigitalOcean and Scaleway are the blessed shapes:
 * each serves both recorded flavors with an honest screenful of
 * OpenTofu (a Docker VM, or a managed Kubernetes cluster). The
 * hyperscalers are deliberately deferred — their honest minimal
 * footprint (VPC + IAM) is an order of magnitude more surface, and
 * blessing one should be driven by a real consumer project, not a
 * guess (see `docs/roadmap.md` §M).
 */
export const CLOUD_QUESTION: Question = {
  id: 'cloud',
  prompt: 'Cloud provider?',
  doc: 'Where the deploy target lives; credentials ride the environment, never a file.',
  default: 'digitalocean',
  memory: 'sticky',
  choices: [
    {
      value: 'digitalocean',
      label: 'DigitalOcean — iac/digitalocean/',
      doc: 'A Docker droplet (compose) or a DOKS cluster (helm); state in Spaces.',
    },
    {
      value: 'scaleway',
      label: 'Scaleway — iac/scaleway/',
      doc: 'A Docker instance (compose) or a Kapsule cluster (helm); state in Object Storage.',
    },
  ],
};

/** Validates a raw `cloud` answer, failing loudly on anything else. */
export function iacCloud(raw: string, requesterId: string): IacCloud {
  const cloud = IAC_CLOUDS.find((c) => c === raw);
  if (cloud) return cloud;
  throw new Error(
    `${requesterId}: unsupported cloud '${raw}'; supported: ${IAC_CLOUDS.join(', ')}`,
  );
}

/**
 * The deployment flavor the `distribution` vertical recorded — the
 * sticky `deploy` answer of whichever `distribution/*-container`
 * adapter fired. Fails with the fix in the message when absent: the
 * target must match the descriptor, so keel refuses to guess one.
 */
export function recordedDeployFlavor(manifest: ManifestV2, requesterId: string): DeployFlavor {
  for (const [adapterId, answers] of Object.entries(manifest.answers)) {
    const raw = adapterId.startsWith('distribution/') ? answers['deploy'] : undefined;
    if (raw) return deployFlavor(raw, requesterId);
  }
  throw new Error(
    `${requesterId}: the deploy target matches the descriptor the distribution vertical emitted — run 'keel add distribution' first (no recorded 'deploy' answer under a 'distribution/*' adapter)`,
  );
}

export const iacDeployTargetAdapter: Adapter = {
  id: IAC_DEPLOY_TARGET_ID,
  vertical: 'iac',
  covers: ['deploy-target'],
  predicate: { requires: ['dist.container-image'] },
  questions: [CLOUD_QUESTION],
  async contribute(ctx: Ctx) {
    const cloud = iacCloud(ctx.answer('cloud'), IAC_DEPLOY_TARGET_ID);
    const flavor = recordedDeployFlavor(ctx.manifest, IAC_DEPLOY_TARGET_ID);
    const vars = { projectName: bootstrapProjectName(ctx.manifest) };
    const files = [
      ...(await ctx.templates.render(`composition/iac/deploy-target/${cloud}/common`, '', vars)),
      ...(await ctx.templates.render(`composition/iac/deploy-target/${cloud}/${flavor}`, '', vars)),
    ];
    return { files, tagsAdd: [OPENTOFU_TAG, cloudTag(cloud)] };
  },
};
