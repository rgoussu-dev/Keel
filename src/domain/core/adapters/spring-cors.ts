/**
 * `gateway/spring-cors` adapter — the Spring backend's side of the
 * service-to-service seam. When a sibling SPA is in scope
 * (`peer.ui.spa`), emits a `CorsConfig` into the REST executable
 * allowing the Vite dev server's origin, so the frontend can also
 * call the API directly (without its dev proxy) during development.
 * Spring has no CORS configuration properties, so the accommodation
 * is a `WebMvcConfigurer` bean rather than a properties patch; the
 * Kotlin sibling (`spring-cors-kotlin`) emits the same bean as
 * Kotlin.
 *
 * Reads `basePackage` from the Spring REST bootstrap's manifest
 * answers to place the file.
 */

import { packageToPath } from '../util.js';
import type { Adapter, Tag } from '../../contract/composition.js';
import { jvmModuleLayout } from './jvm-module-layout.js';
import { SPRING_REST_BOOTSTRAP_ID } from './spring-rest-bootstrap.js';

export const SPRING_CORS_ID = 'gateway/spring-cors';

const TEMPLATE_ROOT = 'composition/gateway/spring-cors';

const templateId = (tags: readonly Tag[]): string =>
  `${TEMPLATE_ROOT}/templates${jvmModuleLayout(tags) === 'modulith' ? '-modulith' : ''}`;

export const springCorsAdapter: Adapter = {
  id: SPRING_CORS_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.spring', 'arch.server-http', 'peer.ui.spa', 'lang.java'] },
  async contribute(ctx) {
    const basePackage = ctx.manifest.answers[SPRING_REST_BOOTSTRAP_ID]?.basePackage;
    if (!basePackage) {
      throw new Error(
        `${SPRING_CORS_ID}: requires '${SPRING_REST_BOOTSTRAP_ID}' to have run first; basePackage not in manifest`,
      );
    }
    const files = await ctx.templates.render(templateId(ctx.manifest.tags), '', {
      basePackage,
      pkgPath: packageToPath(basePackage),
    });
    return { files };
  },
};
