/**
 * `walking-skeleton/wc-design-system` adapter — emits the project's
 * design system as its own workspace package (`design-system/`),
 * following atomic design on top of `@rgoussu.dev/planks`:
 *
 *   - planks supplies the sub-atomic substrate — layout primitives
 *     (`<stack-pk>`, `<box-pk>`, …) and the token scale;
 *   - `src/tokens.css` layers the project's brand tokens on top;
 *   - `src/atoms/` and `src/molecules/` hold the project's own
 *     domain-blind components (a button atom, a greeting-card
 *     molecule), attributes in / `CustomEvent`s out.
 *
 * The package is invisible to the hexagon: it declares no dependency
 * on the domain packages, so a domain-aware "atom" is a wall
 * violation the workspace catches at module resolution, not a review
 * debate. Port-bound organisms (the adapter's parts) stay in the
 * deployment unit and compose these pieces.
 *
 * planks is light-DOM by design — tag-scoped styles injected once
 * into `document.head` — so the emitted components (and the
 * organisms that compose them) render in the light DOM too.
 *
 * It stays a **top-level package under both layouts**: it is
 * domain-blind, every bounded context consumes it, and under the
 * modulith it is the package the import map deduplicates. Folding it
 * into a context would give that context ownership of everyone's
 * buttons — and would put a second copy of an element-defining module
 * in every bundle that is not that context's.
 *
 * Composition: covers no dimension of `walking-skeleton` on its own;
 * it shares the bootstrap's predicate so the pair always co-fires,
 * and the bootstrap's templates (workspace globs, web-app deps, the
 * greeting organism) already compose against it.
 */

import type { Adapter } from '../../contract/composition.js';
import { WC_SPA_BOOTSTRAP_ID, wcLayoutVars } from './wc-spa-bootstrap.js';
import { wcLayout } from './wc-module-layout.js';

export const WC_DESIGN_SYSTEM_ID = 'walking-skeleton/wc-design-system';

const TEMPLATE_ROOT = 'composition/walking-skeleton/wc-design-system/templates';

export const wcDesignSystemAdapter: Adapter = {
  id: WC_DESIGN_SYSTEM_ID,
  vertical: 'walking-skeleton',
  covers: [],
  predicate: { requires: ['framework.web-components', 'arch.spa'] },
  after: [WC_SPA_BOOTSTRAP_ID],
  async contribute(ctx) {
    const npmScope = ctx.manifest.answers[WC_SPA_BOOTSTRAP_ID]?.npmScope;
    if (!npmScope) {
      throw new Error(
        `${WC_DESIGN_SYSTEM_ID}: requires '${WC_SPA_BOOTSTRAP_ID}' to have run first; npmScope not in manifest`,
      );
    }
    const layout = wcLayout(ctx.manifest.tags, npmScope);
    const vars = { npmScope, ...wcLayoutVars(layout) };
    // Under the modulith the design system is loaded as an external
    // and deduplicated through the app's import map, so it needs a
    // build of its own — a manifest difference, not a source one.
    const manifest = layout.layout === 'modulith' ? 'manifest-modulith' : 'manifest-basic';
    const [common, packaged] = await Promise.all([
      ctx.templates.render(`${TEMPLATE_ROOT}/common`, layout.designSystemRoot, vars),
      ctx.templates.render(`${TEMPLATE_ROOT}/${manifest}`, layout.designSystemRoot, vars),
    ]);
    return { files: [...common, ...packaged] };
  },
};
