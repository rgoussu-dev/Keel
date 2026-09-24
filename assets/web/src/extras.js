/**
 * What the Options step's "Also scaffold" group shows — the verticals
 * a preset can take on top of its own, read off the `keel.dials`
 * reply.
 *
 * The extras used to be a question the preview asked, and a question
 * is the wrong control for them: the install stops asking one the
 * moment it is answered, so the list vanished after the first tick —
 * one extra at most, never unticked. They are a menu now, like the
 * build system, and `keel.dials` pins the choice on every target it
 * settles so the preview never asks it again.
 *
 * The group is in four parts, because the planner reads four
 * different answers to "can this go on too?" (`VerticalOption`) —
 * three of them the parts the brownfield page draws its cards in too
 * (`readiness.js`):
 *
 *   - **Ready** — installs here on its own.
 *   - **Needs another capability first** — installs once others
 *     have, and the card says which, by the name a person knows them
 *     by. Ticking it ticks them (`target.js`'s `toggleExtra`).
 *   - **Comes with the preset** — already part of it, shown so the
 *     question "does it have CI?" is answered where it is asked. Not
 *     a control: there is nothing to untick.
 *   - **Not for this project** — what the preset cannot carry at all,
 *     collapsed, each with the sentence `keel new --with` would refuse
 *     it with. It used to be left out, as the terminal's menu leaves
 *     it out, and a missing box answered "why can I not have
 *     persistence?" with nothing.
 *
 * Pure, and separate from any element, so the grouping is testable
 * without a DOM — the same split `steps.js` and `target.js` live
 * under.
 *
 * @typedef {import('./target.js').VerticalOption} VerticalOption
 * @typedef {import('./target.js').Adjustment} Adjustment
 * @typedef {import('./readiness.js').Refused} Refused
 * @typedef {{ value: string, label: string, doc: string, badge?: string }} ExtraCard
 * @typedef {{ ready: ExtraCard[], needs: ExtraCard[], included: { id: string, title: string }[], refused: Refused[], chosen: string[], line: string }} ExtrasGroup
 */

import { needsBadge, refusedOf, titles } from './readiness.js';
import { extrasOf } from './target.js';

/**
 * The group for this dials reply and target, or null where there is
 * none — before the first reply lands, and on a product, whose
 * services each carry their own extras.
 *
 * @param {{ verticals?: ReadonlyArray<VerticalOption>, adjustments?: ReadonlyArray<Adjustment> } | null} dials
 * @param {object | null} target
 * @returns {ExtrasGroup | null}
 */
export function extrasGroup(dials, target) {
  const verticals = dials?.verticals ?? [];
  if (verticals.length === 0) return null;
  const titleOf = titles(verticals);
  const card = (vertical) => ({
    value: vertical.id,
    label: vertical.title,
    doc: vertical.description,
  });
  return {
    ready: verticals.filter((vertical) => vertical.readiness === 'ready').map(card),
    needs: verticals
      .filter((vertical) => vertical.readiness === 'needs')
      .map((vertical) => ({ ...card(vertical), badge: needsBadge(vertical, titleOf) })),
    included: verticals
      .filter((vertical) => vertical.readiness === 'included')
      .map((vertical) => ({ id: vertical.id, title: vertical.title })),
    refused: refusedOf(verticals),
    chosen: extrasOf(target),
    line: adjustmentLine(dials, titleOf),
  };
}

/**
 * The extras a target holds, spelled for the review: titles, in the
 * order they install, or a plain "nothing extra".
 *
 * @param {{ verticals?: ReadonlyArray<VerticalOption> } | null} dials
 * @param {object | null} target
 * @returns {string}
 */
export function extrasSummary(dials, target) {
  const titleOf = titles(dials?.verticals ?? []);
  const chosen = extrasOf(target);
  return chosen.length === 0 ? 'nothing extra' : chosen.map(titleOf).join(', ');
}

/**
 * Everything the last `keel.dials` reply added to the selection or
 * left out of it, as one line — each with its reason, since nothing
 * should join or leave a set of checkboxes silently. Empty when
 * nothing moved, which is the usual case: the page ticks a vertical's
 * prerequisites with it, so the reply has nothing to add.
 */
function adjustmentLine(dials, titleOf) {
  const parts = (dials?.adjustments ?? []).map(
    (adjustment) =>
      `${adjustment.change === 'added' ? 'added' : 'left out'} ${titleOf(adjustment.id)} — ${adjustment.because}`,
  );
  if (parts.length === 0) return '';
  const line = parts.join('; ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
