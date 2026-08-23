/**
 * The `iac` vertical — answers "where does this project run?" in
 * OpenTofu, per binding spec §5. Its one adapter provisions the
 * deploy target the `distribution` vertical publishes to, matching
 * the recorded deployment flavor: `compose` → a Docker VM, `helm` →
 * a managed Kubernetes cluster. The cloud provider is a sticky dial
 * (DigitalOcean or Scaleway), one template subtree per choice.
 *
 * Brownfield-installable via `keel add iac`; keyed on the
 * `dist.container-image` tag, so `keel add distribution` comes
 * first — a target with no release pipeline feeding it would be
 * infrastructure keel cannot honestly wire to anything.
 */

import {
  IAC_CLOUDS,
  OPENTOFU_TAG,
  cloudTag,
  iacDeployTargetAdapter,
} from '../adapters/iac-deploy-target.js';
import type { Vertical } from '../../contract/composition.js';

export const iacVertical: Vertical = {
  id: 'iac',
  title: 'Infrastructure as code',
  description: 'Where this project runs — the OpenTofu deploy target.',
  dimensions: ['deploy-target'],
  promotes: [OPENTOFU_TAG, ...IAC_CLOUDS.map(cloudTag)],
  adapters: [iacDeployTargetAdapter],
};
