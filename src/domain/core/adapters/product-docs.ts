/**
 * `fullstack/product-docs` adapter — emits the product root's README
 * (what the services are, how they talk, the run order) and a
 * minimal root `.gitignore`. Reads the service list from the product
 * manifest the composite orchestrator seeds before glue installs.
 *
 * Fires unconditionally within its vertical: the orchestrator only
 * installs the `fullstack` vertical when a shared product root
 * exists (monorepo layout).
 */

import type { Adapter } from '../../contract/composition.js';

export const PRODUCT_DOCS_ID = 'fullstack/product-docs';

const TEMPLATE_ID = 'composition/fullstack/product-docs/templates';

export const productDocsAdapter: Adapter = {
  id: PRODUCT_DOCS_ID,
  vertical: 'fullstack',
  covers: ['product-docs'],
  predicate: {},
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      services: ctx.manifest.services,
    });
    return { files };
  },
};
