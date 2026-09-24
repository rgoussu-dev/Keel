/**
 * What the brownfield "What to add" step shows — the project status's
 * verticals, sorted into the parts a person decides by — and the
 * re-renders a preview proposes beside an add.
 *
 * The step used to offer every vertical not installed as one radio
 * group and let the click say whether the project could take it:
 * about half the cards on a CLI project were a refusal, met after the
 * pick, in a banner away from the card. The status reads each one
 * ahead of time now, with the planner the add itself plans by, and
 * the step draws what it read (`readiness.js` has the parts the two
 * halves share):
 *
 *   - **Ready** and **Needs another capability first** — checkboxes,
 *     several at a time, a "needs" card ticking what it needs
 *     (`target.js`'s `toggleVertical`); one plan, one Generate.
 *   - **Not for this project** — collapsed, one sentence each: the
 *     refusal `keel add` would give, word for word.
 *   - **Belongs in a service** — at a product's root, a way into each
 *     of its services ("Open backend/ (quarkus-rest · Gradle)", which
 *     re-points the page at that directory), then what goes in one of
 *     them, and the sentence saying which.
 *   - **Installed** — each with a **Re-render** action of its own
 *     (`target.js`'s `rerender`), not a card in the add's set: a
 *     re-render is a different run. What no `keel add` names — a
 *     product's glue, a bounded context — is a chip, a fact about the
 *     project rather than a control; and in a monorepo service, what
 *     the product gives it — its repository's version control, the
 *     image the product root builds — a line each, saying where from.
 *
 * Pure, and separate from any element, so the grouping is testable
 * without a DOM — the same split `steps.js`, `target.js` and
 * `extras.js` live under.
 *
 * @typedef {import('./readiness.js').Refused} Refused
 * @typedef {{ value: string, label: string, meta: string, doc: string, badge?: string }} AddCard
 * @typedef {{ id: string, title: string, doc: string, meta: string, pressed: boolean }} Rerenderable
 * @typedef {{ id: string, title: string }} Chip
 * @typedef {{ path: string, label: string }} ServiceLink
 * @typedef {{ ready: AddCard[], needs: AddCard[], refused: Refused[], elsewhere: Refused[], services: ServiceLink[], rerenderable: Rerenderable[], chips: Chip[], provided: Refused[], chosen: string[], rerendering: string | null }} AdditionsGroup
 * @typedef {{ value: string, label: string, doc: string }} RefreshChoice
 */

import { belongsElsewhere, needsBadge, refused, refusedOf, titles } from './readiness.js';
import { refreshOf, rerendering, verticalsOf } from './target.js';

/**
 * The step's parts, for this project status and target.
 *
 * @param {{ installed: ReadonlyArray<{ id: string, title: string, description: string, reapplicable?: boolean }>, available: ReadonlyArray<{ id: string, title: string, description: string, readiness: string, requires: ReadonlyArray<string>, refusal?: { code: string, message: string, refusal?: { kind: string } } }>, provided?: ReadonlyArray<{ id: string, title: string, note: string }>, services?: ReadonlyArray<{ path: string, directory: string, label: string }> }} status
 * @param {object | null} target
 * @returns {AdditionsGroup}
 */
export function additionsGroup(status, target) {
  const titleOf = titles(status.available, status.installed);
  const card = (vertical) => ({
    value: vertical.id,
    label: vertical.title || vertical.id,
    meta: `keel add ${vertical.id}`,
    doc: vertical.description,
  });
  const again = rerendering(target);
  const installed = status.installed;
  return {
    ready: status.available.filter((vertical) => vertical.readiness === 'ready').map(card),
    needs: status.available
      .filter((vertical) => vertical.readiness === 'needs')
      .map((vertical) => ({ ...card(vertical), badge: needsBadge(vertical, titleOf) })),
    refused: refusedOf(status.available),
    elsewhere: status.available.filter(belongsElsewhere).map(refused),
    services: serviceLinks(status),
    rerenderable: installed
      .filter((vertical) => vertical.reapplicable !== false)
      .map((vertical) => ({
        id: vertical.id,
        title: vertical.title || vertical.id,
        doc: vertical.description,
        meta: `keel add ${vertical.id} --reapply`,
        pressed: vertical.id === again,
      })),
    chips: installed
      .filter((vertical) => vertical.reapplicable === false)
      .map((vertical) => ({ id: vertical.id, title: vertical.title || vertical.id })),
    provided: (status.provided ?? []).map((vertical) => ({
      id: vertical.id,
      title: vertical.title || vertical.id,
      sentence: vertical.note,
    })),
    chosen: again === null ? verticalsOf(target) : [],
    rerendering: again,
  };
}

/**
 * At a product root, a way into each of its services: the directory to
 * point the page at — the status reports it whole, so the page builds
 * no path of its own — and the button's words, which name the service
 * by its directory and what it is. Empty anywhere else.
 *
 * @param {{ services?: ReadonlyArray<{ path: string, directory: string, label: string }> }} status
 * @returns {ServiceLink[]}
 */
export function serviceLinks(status) {
  return (status.services ?? []).map((service) => ({
    path: service.directory,
    label: `Open ${service.path}/ (${service.label})`,
  }));
}

/**
 * The installed verticals an add could re-render in the same run, as
 * toggles: each the latest preview proposes — the run changes what it
 * would render, and leaves it as it was — and each the target already
 * re-renders, which that preview no longer proposes because it is
 * doing it. Empty on a re-render, which is a run of its own, and
 * before anything is ticked.
 *
 * Each says why in the words a person reads a plan in: what it reads
 * that the run brings, or that what the run adds changes which
 * adapters it would render with now.
 *
 * @param {{ refreshProposals?: ReadonlyArray<{ vertical: string, reads: ReadonlyArray<string>, adapters?: object }> } | null} preview
 * @param {object | null} target
 * @param {{ installed: ReadonlyArray<{ id: string, title: string }>, available: ReadonlyArray<{ id: string, title: string }> }} status
 * @returns {RefreshChoice[]}
 */
export function refreshChoices(preview, target, status) {
  if (rerendering(target) !== null || verticalsOf(target).length === 0) return [];
  const titleOf = titles(status.installed, status.available);
  const proposals = new Map(
    (preview?.refreshProposals ?? []).map((proposal) => [proposal.vertical, proposal]),
  );
  const ids = [...new Set([...proposals.keys(), ...refreshOf(target)])];
  return ids.map((id) => {
    const proposal = proposals.get(id);
    return {
      value: id,
      label: `Re-render ${titleOf(id)} too`,
      doc: proposal === undefined ? 'Re-rendered in this run.' : why(proposal, titleOf),
    };
  });
}

/**
 * What an add holds, spelled for the review: the verticals by title,
 * in the order they install, then the re-renders beside them.
 *
 * @param {{ installed: ReadonlyArray<{ id: string, title: string }>, available: ReadonlyArray<{ id: string, title: string }> }} status
 * @param {object | null} target
 * @returns {{ adds: string, refreshes: string }}
 */
export function additionsSummary(status, target) {
  const titleOf = titles(status.available, status.installed);
  return {
    adds: verticalsOf(target).map(titleOf).join(', '),
    refreshes: refreshOf(target).map(titleOf).join(', '),
  };
}

/** Why a proposal is made, as one sentence. */
function why(proposal, titleOf) {
  const reasons = [
    ...(proposal.reads.length > 0
      ? [`reads ${proposal.reads.map(titleOf).join(', ')}, which it was rendered without`]
      : []),
    ...(proposal.adapters === undefined ? [] : ['renders differently with what this adds']),
  ];
  const line = reasons.join(', and ') || 'renders differently with what this adds';
  return `${line.charAt(0).toUpperCase()}${line.slice(1)} — re-rendering it rewrites the files it owns.`;
}
