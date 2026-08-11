/**
 * The `dev-env` vertical — the local development environment:
 * `dev/compose.yaml`, one Compose file for everything the service
 * needs on a laptop but does not own.
 *
 * The vertical itself only seeds the base (an empty `services: {}`
 * map plus the extension guidance); its value is the seam it
 * establishes. Contributing verticals patch their services in
 * through the shared helpers in `adapters/dev-env-compose.ts` — the
 * observability vertical's monitoring stack today; a persistence
 * vertical's database, a cache, a broker tomorrow — and users add
 * ad-hoc local infra to the same file.
 *
 * There is no install-order coupling: every contributor's patch is
 * seeded with the same base (`devComposeSeed`), so the file exists
 * whichever vertical runs first and the others compose onto it.
 * Greenfield HTTP stacks list this vertical for the README section
 * and the extension seam it documents; brownfield: `keel add
 * dev-env` at any point.
 */

import { devEnvComposeAdapter } from '../adapters/dev-env-compose.js';
import type { Vertical } from '../../contract/composition.js';

export const devEnvVertical: Vertical = {
  id: 'dev-env',
  description: 'Local development environment: one Compose file for the infra the dev loop needs.',
  dimensions: ['compose-base'],
  adapters: [devEnvComposeAdapter],
};
