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
 * Composition: covers no dimension of `walking-skeleton` on its own;
 * it shares the bootstrap's predicate so the pair always co-fires,
 * and the bootstrap's templates (workspace globs, web-app deps, the
 * greeting organism) already compose against it.
 */

import type { Adapter } from '../../contract/composition.js';
import { WC_SPA_BOOTSTRAP_ID } from './wc-spa-bootstrap.js';

export const WC_DESIGN_SYSTEM_ID = 'walking-skeleton/wc-design-system';

const TEMPLATE_ID = 'composition/walking-skeleton/wc-design-system/templates';

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
    const files = await ctx.templates.render(TEMPLATE_ID, '', { npmScope });
    return { files };
  },
};
