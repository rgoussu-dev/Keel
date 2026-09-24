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
 * The group is in three parts, because the planner reads three
 * different answers to "can this go on too?" (`VerticalOption`):
 *
 *   - **Ready** — installs here on its own.
 *   - **Needs another capability first** — installs once others
 *     have, and the card says which, by the name a person knows them
 *     by. Ticking it ticks them (`target.js`'s `toggleExtra`).
 *   - **Comes with the preset** — already part of it, shown so the
 *     question "does it have CI?" is answered where it is asked. Not
 *     a control: there is nothing to untick.
 *
 * A vertical the preset cannot carry at all is in none of them —
 * `keel.dials` leaves it out, as the terminal's menu does.
 *
 * Pure, and separate from any element, so the grouping is testable
 * without a DOM — the same split `steps.js` and `target.js` live
 * under.
 *
 * @typedef {import('./target.js').VerticalOption} VerticalOption
 * @typedef {import('./target.js').Adjustment} Adjustment
 * @typedef {{ value: string, label: string, doc: string, badge?: string }} ExtraCard
 * @typedef {{ ready: ExtraCard[], needs: ExtraCard[], included: { id: string, title: string }[], chosen: string[], line: string }} ExtrasGroup
 */

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
 * What a "needs" card says it needs, by title: the verticals ticking
 * it brings along, or — where two different sets would each do — that
 * the choice between them is the user's to make first.
 */
function needsBadge(vertical, titleOf) {
  return vertical.requires.length === 0
    ? 'needs one of several verticals first'
    : `needs ${vertical.requires.map(titleOf).join(', ')}`;
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

/** A lookup from vertical id to title, falling back to the id for one the reply did not list. */
function titles(verticals) {
  const byId = new Map(verticals.map((vertical) => [vertical.id, vertical.title]));
  return (id) => byId.get(id) ?? id;
}
