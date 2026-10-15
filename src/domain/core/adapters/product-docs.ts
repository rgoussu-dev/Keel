/**
 * `fullstack/product-docs` adapter — emits the product root's README
 * (what the services are, how they talk, the run order) and a
 * minimal root `.gitignore`. Reads the services as facets
 * (`Ctx.services`) and gives each its development run hint by family
 * (`./product-families.ts`), or _see its README_ where no family
 * matches.
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
import { familyOf } from './product-families.js';

export const PRODUCT_DOCS_ID = 'fullstack/product-docs';

const TEMPLATE_ID = 'composition/fullstack/product-docs/templates';

export const productDocsAdapter: Adapter = {
  id: PRODUCT_DOCS_ID,
  vertical: 'fullstack',
  covers: ['product-docs'],
  predicate: {},
  async contribute(ctx) {
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      // Each with the command that runs it in development, read off
      // what it is (`./product-families.ts`); one the glue does not
      // know points at its own README.
      services: ctx.services.map((service) => ({
        ...service,
        runHint: familyOf(service)?.runHint(service) ?? 'see its README',
      })),
    });
    return adoptingRootFiles(files);
  },
};
