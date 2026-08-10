/**
 * `gateway/spring-cors-kotlin` adapter — the Kotlin sibling of
 * `spring-cors`: emits the same `WebMvcConfigurer` CORS
 * accommodation as Kotlin when a sibling SPA is in scope. The
 * resolver keeps exactly one of the pair by language predicate.
 */

import { packageToPath } from '../util.js';
import type { Adapter } from '../../contract/composition.js';
import { SPRING_REST_KOTLIN_BOOTSTRAP_ID } from './spring-rest-kotlin-bootstrap.js';

export const SPRING_CORS_KOTLIN_ID = 'gateway/spring-cors-kotlin';

const TEMPLATE_ID = 'composition/gateway/spring-cors-kotlin/templates';

export const springCorsKotlinAdapter: Adapter = {
  id: SPRING_CORS_KOTLIN_ID,
  vertical: 'gateway',
  covers: [],
  predicate: { requires: ['framework.spring', 'arch.server-http', 'peer.ui.spa', 'lang.kotlin'] },
  async contribute(ctx) {
    const basePackage = ctx.manifest.answers[SPRING_REST_KOTLIN_BOOTSTRAP_ID]?.basePackage;
    if (!basePackage) {
      throw new Error(
        `${SPRING_CORS_KOTLIN_ID}: requires '${SPRING_REST_KOTLIN_BOOTSTRAP_ID}' to have run first; basePackage not in manifest`,
      );
    }
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      basePackage,
      pkgPath: packageToPath(basePackage),
    });
    return { files };
  },
};
