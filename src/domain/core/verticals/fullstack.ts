/**
 * The `fullstack` vertical — product-level glue for composite
 * (multi-service) installs. Runs at the product root under the
 * monorepo layout; a polyrepo product has no shared root, so the
 * composite orchestrator skips it there.
 */

import { productComposeAdapter } from '../adapters/product-compose.js';
import { productDocsAdapter } from '../adapters/product-docs.js';
import type { Vertical } from '../../contract/composition.js';

export const fullstackVertical: Vertical = {
  id: 'fullstack',
  description: 'Product-root glue for multi-service workspaces.',
  dimensions: ['product-docs', 'product-compose'],
  adapters: [productDocsAdapter, productComposeAdapter],
};
