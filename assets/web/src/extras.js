/**
 * What a new project's Options step shows in its "Also scaffold"
 * group — the verticals a preset can take on top of its own, read off
 * the `keel.dials` reply. A keel project's Options step draws the same
 * group, by the same builder (`dom.js`'s `alsoScaffold`), read off its
 * project status instead (`additions.js`).
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
 * three of them the parts a keel project's group has too
 * (`readiness.js`):
 *
 *   - **Ready** — installs here on its own.
 *   - **Needs another capability first** — installs once others
 *     have, and the card says which, by the name a person knows them
 *     by. Ticking it ticks them (`target.js`'s `toggleExtra`).
 *   - **Comes with the preset** — already part of it, shown so the
 *     question "does it have CI?" is answered where it is asked. Not
 *     a control — there is nothing to untick — but for the agent
 *     harness, where `keel.dials` says the preset may leave it out
 *     (`agentHarness`): that chip is a switch, pressed while the
 *     harness is on and let go for `keel new --no-agent-harness`.
 *   - **Not for this project** — what the preset cannot carry at all,
 *     collapsed, each with the sentence `keel new --with` would refuse
 *     it with. It used to be left out, as the terminal's menu leaves
 *     it out, and a missing box answered "why can I not have
 *     persistence?" with nothing.
 *
 * A product has one such group per service ({@link serviceExtrasGroup}),
 * each read off that service's own menu in the reply
 * (`services[].verticals`): a service's extras are its own, planned in
 * its scope, and `keel new --with backend:persistence` names them so.
 *
 * Pure, and separate from any element, so the grouping is testable
 * without a DOM — the same split `steps.js` and `target.js` live
 * under.
 *
 * @typedef {import('./target.js').VerticalOption} VerticalOption
 * @typedef {import('./target.js').Adjustment} Adjustment
 * @typedef {import('./readiness.js').Refused} Refused
 * @typedef {{ value: string, label: string, doc: string, badge?: string }} ExtraCard
 * @typedef {{ id: string, title: string, on?: boolean }} IncludedChip
 * @typedef {{ ready: ExtraCard[], needs: ExtraCard[], included: IncludedChip[], refused: Refused[], chosen: string[], line: string }} ExtrasGroup
 */

import { needsBadge, refusedOf, titles } from './readiness.js';
import { extrasOf, serviceExtrasOf } from './target.js';

/**
 * The one vertical a preset comes with that a target can leave out —
 * where the reply's `agentHarness` says this preset lets it.
 */
const HARNESS = 'agent-harness';

/**
 * The group for this dials reply and target, or null where there is
 * none — before the first reply lands, and on a product, whose extras
 * are each service's ({@link serviceExtrasGroup}).
 *
 * The agent harness's chip carries `on` where the reply lets the
 * target leave it out: whether the target keeps it, as the install
 * reads the field — on unless it is `false`.
 *
 * @param {{ verticals?: ReadonlyArray<VerticalOption>, adjustments?: ReadonlyArray<Adjustment>, services?: ReadonlyArray<unknown>, agentHarness?: boolean } | null} dials
 * @param {object | null} target
 * @returns {ExtrasGroup | null}
 */
export function extrasGroup(dials, target) {
  const verticals = dials?.verticals ?? [];
  if (verticals.length === 0 || (dials?.services ?? []).length > 0) return null;
  const titleOf = titles(verticals);
  return groupOf(verticals, extrasOf(target), dials?.adjustments ?? [], titleOf, (vertical) =>
    vertical.id === HARNESS && dials?.agentHarness === true
      ? { id: vertical.id, title: vertical.title, on: target?.agentHarness !== false }
      : { id: vertical.id, title: vertical.title },
  );
}

/**
 * The group of one service of a product — `path`, as the reply's
 * `services` lists it — or null where the reply has no menu for it:
 * before the first reply lands, and on a single preset. Its parts are
 * {@link extrasGroup}'s, read off the service's own menu; its chosen
 * boxes are the service's extras in the target (`services[path]`); its
 * line is the reply's adjustments made in that service. No chip is a
 * switch: a product's harness is not a dial.
 *
 * @param {{ services?: ReadonlyArray<{ path: string, verticals?: ReadonlyArray<VerticalOption> }>, adjustments?: ReadonlyArray<Adjustment> } | null} dials
 * @param {object | null} target
 * @param {string} path
 * @returns {ExtrasGroup | null}
 */
export function serviceExtrasGroup(dials, target, path) {
  const service = (dials?.services ?? []).find((candidate) => candidate.path === path);
  const verticals = service?.verticals ?? [];
  if (verticals.length === 0) return null;
  return groupOf(
    verticals,
    serviceExtrasOf(target, path),
    (dials?.adjustments ?? []).filter((adjustment) => adjustment.service === path),
    titles(verticals),
    (vertical) => ({ id: vertical.id, title: vertical.title }),
  );
}

/** The parts of a group, over one menu and the selection and adjustments that go with it. */
function groupOf(verticals, chosen, adjustments, titleOf, chip) {
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
    included: verticals.filter((vertical) => vertical.readiness === 'included').map(chip),
    refused: refusedOf(verticals),
    chosen,
    line: adjustmentLine(adjustments, titleOf),
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
 * A product's extras, spelled for the review: each service's titles
 * and where they go — `Persistence in backend/; Development
 * environment in frontend/` — in the order the reply lists the
 * services, or a plain "nothing extra".
 *
 * @param {{ services?: ReadonlyArray<{ path: string, verticals?: ReadonlyArray<VerticalOption> }> } | null} dials
 * @param {object | null} target
 * @returns {string}
 */
export function servicesExtrasSummary(dials, target) {
  const parts = (dials?.services ?? []).flatMap((service) => {
    const chosen = serviceExtrasOf(target, service.path);
    if (chosen.length === 0) return [];
    const titleOf = titles(service.verticals ?? []);
    return [`${chosen.map(titleOf).join(', ')} in ${service.path}/`];
  });
  return parts.length === 0 ? 'nothing extra' : parts.join('; ');
}

/**
 * Everything the last `keel.dials` reply added to the selection or
 * left out of it, as one line — each with its reason, since nothing
 * should join or leave a set of checkboxes silently. Empty when
 * nothing moved, which is the usual case: the page ticks a vertical's
 * prerequisites with it, so the reply has nothing to add.
 */
function adjustmentLine(adjustments, titleOf) {
  const parts = adjustments.map(
    (adjustment) =>
      `${adjustment.change === 'added' ? 'added' : 'left out'} ${titleOf(adjustment.id)} — ${adjustment.because}`,
  );
  if (parts.length === 0) return '';
  const line = parts.join('; ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
