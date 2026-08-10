/**
 * `gateway/micronaut-cors` adapter — the Micronaut backend's side of
 * the service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), patches the REST service's
 * `application.properties` to allow the Vite dev server's origin, so
 * the frontend can also call the API directly (without its dev
 * proxy) during development. Language-agnostic: the Java and Kotlin
 * bootstraps emit the properties file at the same path.
 */

import type { Adapter } from '../../contract/composition.js';

export const MICRONAUT_CORS_ID = 'gateway/micronaut-cors';

const PROPERTIES_TARGET = 'application/rest/executable/src/main/resources/application.properties';

const CORS_BLOCK = [
  '# Allow the sibling SPA (Vite dev server) to call this API directly.',
  'micronaut.server.cors.enabled=true',
  'micronaut.server.cors.configurations.ui.allowed-origins=http://localhost:5173',
].join('\n');

export const micronautCorsAdapter: Adapter = {
  id: MICRONAUT_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.micronaut', 'arch.server-http', 'peer.ui.spa'] },
  contribute() {
    return {
      patches: [
        {
          target: PROPERTIES_TARGET,
          apply: (existing) => {
            if (existing.includes('micronaut.server.cors')) return existing;
            return `${existing.trimEnd()}\n\n${CORS_BLOCK}\n`;
          },
        },
      ],
    };
  },
};
