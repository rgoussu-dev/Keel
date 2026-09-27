/**
 * The `fullstack` vertical — product-level glue for composite
 * (multi-service) installs. Runs at the product root under the
 * monorepo layout; a polyrepo product has no shared root, so the
 * composite orchestrator skips it there.
 */

import { productComposeAdapter } from '../adapters/product-compose.js';
import { productDocsAdapter } from '../adapters/product-docs.js';
import { productHarnessAdapter } from '../adapters/product-harness.js';
import { CLAUDE_KIT_TAG } from '../adapters/claude-kit.js';
import { AGENT_HARNESS_TAG, type Vertical } from '../../contract/composition.js';

export const fullstackVertical: Vertical = {
  id: 'fullstack',
  title: 'Product root',
  description: 'Product-root glue for multi-service workspaces.',
  dimensions: ['product-docs', 'product-compose', 'product-harness'],
  // The product root activates its own harness: `agent-harness` is a
  // single-service vertical and does not install here — its services
  // have it, and `keel add` of it here adds nothing — so the tag that
  // opens the engine's final pass (and with it the `keel:map`
  // projection) comes from `product-harness`.
  promotes: [AGENT_HARNESS_TAG],
  // …and a service's harness never replaces it: a family kit writes the
  // binding spec over the root's own `AGENTS.md`, which indexes the
  // services' instead. A rule of the piece that is there, so the
  // planner reads `agent-harness` as not for the root however its tags
  // came to match a family, and the root reads it as there, in its
  // services.
  conflicts: [
    {
      id: 'fullstack/one-harness',
      when: [CLAUDE_KIT_TAG],
      reason:
        "a product root carries a harness of its own, which indexes its services'; a service's harness goes in the service",
    },
  ],
  adapters: [productDocsAdapter, productComposeAdapter, productHarnessAdapter],
};
