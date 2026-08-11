/**
 * `gateway/quarkus-cors` adapter — the backend side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), patches the Quarkus REST service's
 * `application.properties` to allow the Vite dev server's origin, so
 * the frontend can also call the API directly (without its dev
 * proxy) during development. The properties are `%dev.`-scoped:
 * active in `quarkus dev` only, inert in the packaged production
 * artifact, whose SPA traffic arrives same-origin through the
 * reverse proxy.
 */

import type { Adapter } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';

export const QUARKUS_CORS_ID = 'gateway/quarkus-cors';

const PROPERTIES_TARGET = 'application/rest/executable/src/main/resources/application.properties';

const CORS_BLOCK = [
  '# Allow the sibling SPA (Vite dev server) to call this API directly',
  '# during development. %dev.-scoped: never active in production,',
  '# where SPA traffic arrives same-origin through the reverse proxy.',
  '%dev.quarkus.http.cors.enabled=true',
  '%dev.quarkus.http.cors.origins=http://localhost:5173',
].join('\n');

export const quarkusCorsAdapter: Adapter = {
  id: QUARKUS_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.quarkus', 'arch.server-http', 'peer.ui.spa'] },
  contribute() {
    return {
      patches: [
        {
          target: PROPERTIES_TARGET,
          apply: (existing) => {
            if (existing.includes('quarkus.http.cors')) return existing;
            const eol = eolOf(existing);
            return `${existing.trimEnd()}${eol}${eol}${withEol(CORS_BLOCK, eol)}${eol}`;
          },
        },
      ],
    };
  },
};
