/**
 * `gateway/micronaut-cors` adapter — the Micronaut backend's side of
 * the service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), emits a dev-environment-scoped
 * `application-dev.properties` allowing the Vite dev server's
 * origin, so the frontend can also call the API directly (without
 * its dev proxy) during development — run the service with
 * `MICRONAUT_ENVIRONMENTS=dev` to activate it. The production
 * artifact never loads it: SPA traffic arrives same-origin through
 * the reverse proxy. Language-agnostic: the Java and Kotlin
 * bootstraps emit resources at the same path.
 */

import type { Adapter, Tag } from '../../contract/composition.js';
import { jvmModuleLayout } from './jvm-module-layout.js';

export const MICRONAUT_CORS_ID = 'gateway/micronaut-cors';

const TEMPLATE_ROOT = 'composition/gateway/micronaut-cors';

const templateId = (tags: readonly Tag[]): string =>
  `${TEMPLATE_ROOT}/templates${jvmModuleLayout(tags) === 'modulith' ? '-modulith' : ''}`;

export const micronautCorsAdapter: Adapter = {
  id: MICRONAUT_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.micronaut', 'arch.server-http', 'peer.ui.spa'] },
  async contribute(ctx) {
    const files = await ctx.templates.render(templateId(ctx.manifest.tags), '', {});
    return { files };
  },
};
