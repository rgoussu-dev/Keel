/**
 * `fullstack/product-docs` adapter — emits the product root's README
 * (what the services are, how they talk, the run order) and a
 * minimal root `.gitignore`. Reads the service list from the product
 * manifest the composite orchestrator seeds before glue installs.
 *
 * Fires unconditionally within its vertical: the orchestrator only
 * installs the `fullstack` vertical when a shared product root
 * exists (monorepo layout).
 *
 * Both files are seeded upserts rather than whole-file writes, so
 * `keel new` in a repository that already holds either keeps the
 * user's file and adds keel's part to it (`adopted-files.ts`).
 */

import type { Adapter } from '../../contract/composition.js';
import { adoptingRootFiles } from './adopted-files.js';

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
    return adoptingRootFiles(files);
  },
};
