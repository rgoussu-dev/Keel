/**
 * `walking-skeleton/wc-spa-bootstrap` adapter — emits a runnable
 * framework-free web-components SPA as an npm workspace: a
 * `domain/domain-api` package (ports, commands, read models — no DOM
 * lib), a `domain/domain-core` package (factories only via its
 * `exports` map), and an `application/web-app` deployment unit (Vite
 * shell whose `main.ts` is the assembly point, wiring ports to
 * elements over the WCCG Context protocol).
 *
 * This is the frontend seed of the `walking-skeleton` vertical. It
 * covers the `entrypoint` dimension and is predicated on
 * `framework.web-components + arch.spa`, the browser sibling of the
 * Quarkus CLI bootstrap's `framework.quarkus + arch.cli`.
 *
 * The architectural walls are held by the workspace itself: domain
 * packages compile with `"lib": ["ES2022"]` (no `"DOM"`), deep
 * imports die at module resolution via each package's `exports` map,
 * and the dependency direction is the workspace dependency graph.
 * There is deliberately no mediator — per-use-case driving ports are
 * delivered through typed context keys, and cross-cutting concerns
 * decorate the domain factories at the assembly point.
 */

import type { Adapter } from '../../contract/composition.js';

export const WC_SPA_BOOTSTRAP_ID = 'walking-skeleton/wc-spa-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/wc-spa-bootstrap/templates';

const NPM_SCOPE_RE = /^[a-z][a-z0-9-]{0,38}$/;
const PROJECT_NAME_RE = /^[a-z][a-z0-9-]{0,62}$/;

export const wcSpaBootstrapAdapter: Adapter = {
  id: WC_SPA_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  questions: [
    {
      id: 'npmScope',
      prompt: 'npm scope (without the @)',
      doc: 'Used as the workspace package scope (@scope/domain-api) and the custom-element tag prefix (<scope-greeting>). Lowercase + digits + dashes; must start with a letter.',
      default: 'acme',
      memory: 'sticky',
    },
    {
      id: 'projectName',
      prompt: 'Project name',
      doc: 'Used as the workspace root package name and the page title. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const npmScope = validateNpmScope(ctx.answer('npmScope').trim());
    const projectName = validateProjectName(ctx.answer('projectName').trim());
    const files = await ctx.templates.render(TEMPLATE_ID, '', { npmScope, projectName });
    return { files };
  },
};

function validateNpmScope(s: string): string {
  if (!NPM_SCOPE_RE.test(s)) {
    throw new Error(
      `wc-spa-bootstrap: invalid npmScope '${s}' — lowercase + digits + dashes, start with a letter, ≤39 chars, no leading @`,
    );
  }
  return s;
}

function validateProjectName(s: string): string {
  if (!PROJECT_NAME_RE.test(s)) {
    throw new Error(
      `wc-spa-bootstrap: invalid projectName '${s}' — lowercase + digits + dashes, start with a letter, ≤63 chars`,
    );
  }
  return s;
}
