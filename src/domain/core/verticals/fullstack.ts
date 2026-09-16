/**
 * The `fullstack` vertical — product-level glue for composite
 * (multi-service) installs. Runs at the product root under the
 * monorepo layout; a polyrepo product has no shared root, so the
 * composite orchestrator skips it there.
 */

import { productComposeAdapter } from '../adapters/product-compose.js';
import { productDocsAdapter } from '../adapters/product-docs.js';
import { productHarnessAdapter } from '../adapters/product-harness.js';
import { AGENT_HARNESS_TAG, type Vertical } from '../../contract/composition.js';

export const fullstackVertical: Vertical = {
  id: 'fullstack',
  title: 'Product root',
  description: 'Product-root glue for multi-service workspaces.',
  dimensions: ['product-docs', 'product-compose', 'product-harness'],
  // The product root activates its own harness: `agent-harness` is a
  // single-service vertical and refuses to install here, so the tag
  // that opens the engine's final pass (and with it the `keel:map`
  // projection) comes from `product-harness`.
  promotes: [AGENT_HARNESS_TAG],
  adapters: [productDocsAdapter, productComposeAdapter, productHarnessAdapter],
};
