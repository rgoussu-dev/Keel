/**
 * What a keel project's Options step shows — its "Also scaffold"
 * group, the one a new project's Options step draws its extras in,
 * read off the project status rather than a `keel.dials` reply — and
 * the re-renders a preview proposes beside an add.
 *
 * The step used to be a page of its own, "What to add", beside a new
 * project's Options: one question — what else goes in? — asked by two
 * controls, one per phase. It is one control now, and the difference
 * between the phases is data: what a new project's preset comes with
 * is a chip, what a keel project has is a box ticked and locked. The
 * status reads each vertical ahead of time, with the planner the add
 * itself plans by, and the group draws what it read (`readiness.js`
 * has the parts the two phases share):
 *
 *   - **Ready** and **Needs another capability first** — checkboxes,
 *     several at a time, a "needs" card ticking what it needs
 *     (`target.js`'s `toggleVertical`); one plan, one Generate, and
 *     the run is only ever what the ticks add — the delta.
 *   - **After adding an entrypoint** — what only an entrypoint the
 *     project can grow stops, under the action its refusal names:
 *     **Add HTTP server** (`keel add entrypoint http`), then each card,
 *     saying whether it comes with the entrypoint or is added after it.
 *   - **Installed** — what the project has, ticked and locked: an
 *     installed vertical with a **Re-render** action of its own
 *     (`target.js`'s `rerender`), since a re-render is a different
 *     run; what no `keel add` names — a product's glue, a bounded
 *     context — with none; and in a monorepo service, what the product
 *     gives it — its repository's version control, the image the
 *     product root builds — each saying where from.
 *   - **In its services** — at a product's root, what the services
 *     that could have it have — code style, the harness, the images
 *     the root builds — ticked and locked the same way, each naming
 *     the services: the root installed none of it, and adding one
 *     would add nothing.
 *   - **Not for this project** — collapsed, one sentence each: the
 *     refusal `keel add` would give, word for word.
 *   - **Belongs in a service** — at a product's root, a way into each
 *     of its services ("Open backend/ (quarkus-rest · Gradle)", which
 *     re-points the page at that directory), then what goes in one of
 *     them, and the sentence saying which.
 *
 * Pure, and separate from any element, so the grouping is testable
 * without a DOM — the same split `steps.js`, `target.js` and
 * `extras.js` live under.
 *
 * @typedef {import('./readiness.js').Refused} Refused
 * @typedef {{ value: string, label: string, meta: string, doc: string, badge?: string }} AddCard
 * @typedef {{ value: string, label: string, meta: string, doc: string, rerender: boolean, pressed: boolean }} Installed
 * @typedef {{ path: string, label: string }} ServiceLink
 * @typedef {Refused & { comes: boolean, note: string }} GrowCard
 * @typedef {{ word: string, name: string, meta: string, items: GrowCard[] }} GrowGroup
 * @typedef {{ ready: AddCard[], needs: AddCard[], grows: GrowGroup[], refused: Refused[], elsewhere: Refused[], services: ServiceLink[], installed: Installed[], inServices: Installed[], chosen: string[], rerendering: string | null }} AdditionsGroup
 * @typedef {{ value: string, label: string, doc: string }} RefreshChoice
 */

import { entrypointName } from './project.js';
import {
  belongsElsewhere,
  growingOf,
  needsBadge,
  refused,
  refusedOf,
  titles,
} from './readiness.js';
import { refreshOf, rerendering, verticalsOf } from './target.js';

/**
 * The group's parts, for this project status and target.
 *
 * `installed` lists the manifest's verticals in the order it records
 * them, then what the product gives a monorepo service: each a box the
 * page draws ticked and locked, `rerender` where `keel add <id>
 * --reapply` re-renders it — and `pressed` on the one the target is
 * re-rendering. At a product root, what the status reports as provided
 * is its services' rather than anything the root installed, so it is
 * `inServices` instead, locked the same way; empty anywhere else.
 *
 * `grows` holds, per entrypoint the project can grow, what only that
 * entrypoint stops: the entrypoint's name and command, and each card
 * with its refusal's sentence and a note on what the entrypoint makes
 * of it — it comes with it, or is added after it, a linked project
 * too where it waits on one. Those cards are in no other part.
 *
 * @param {{ installed: ReadonlyArray<{ id: string, title: string, description: string, reapplicable?: boolean }>, available: ReadonlyArray<{ id: string, title: string, description: string, readiness: string, requires: ReadonlyArray<string>, refusal?: import('./readiness.js').RefusalDescriptor }>, provided?: ReadonlyArray<{ id: string, title: string, note: string }>, services?: ReadonlyArray<{ path: string, directory: string, label: string }>, entrypoints?: ReadonlyArray<import('./project.js').EntrypointStatus> }} status
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
  const provided = (status.provided ?? []).map((vertical) => ({
    value: vertical.id,
    label: vertical.title || vertical.id,
    meta: '',
    doc: vertical.note,
    rerender: false,
    pressed: false,
  }));
  const root = (status.services ?? []).length > 0;
  return {
    ready: status.available.filter((vertical) => vertical.readiness === 'ready').map(card),
    needs: status.available
      .filter((vertical) => vertical.readiness === 'needs')
      .map((vertical) => ({ ...card(vertical), badge: needsBadge(vertical, titleOf) })),
    grows: growingOf(status.available).map((group) => ({
      word: group.word,
      name: entrypointName(status, group.word),
      meta: `keel add entrypoint ${group.word}`,
      items: group.items.map(({ comes, linked, ...item }) => ({
        ...item,
        comes,
        note: comes
          ? 'Comes with it.'
          : linked
            ? 'Added after it, once a linked project serves it.'
            : 'Added after it.',
      })),
    })),
    refused: refusedOf(status.available),
    elsewhere: status.available.filter(belongsElsewhere).map(refused),
    services: serviceLinks(status),
    installed: [
      ...installed.map((vertical) => {
        const rerender = vertical.reapplicable !== false;
        return {
          value: vertical.id,
          label: vertical.title || vertical.id,
          meta: rerender ? `keel add ${vertical.id} --reapply` : '',
          doc: vertical.description,
          rerender,
          pressed: rerender && vertical.id === again,
        };
      }),
      ...(root ? [] : provided),
    ],
    inServices: root ? provided : [],
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
 * in the order they install, then the re-renders beside them. An
 * entrypoint's add names no vertical; it has a row of its own.
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

/**
 * What adding the entrypoint `word` names does, in the sentences its
 * form says it in: what becomes of the project — the agent harness
 * re-rendered only where the project has one — then, by title, what
 * the run installs (the status's `installs`), what _Add verticals_
 * takes after it, and what waits on a linked project too. A list with
 * nothing in it says nothing.
 *
 * @param {{ installed: ReadonlyArray<{ id: string, title: string }>, available: ReadonlyArray<import('./readiness.js').ReadinessEntry>, entrypoints?: ReadonlyArray<import('./project.js').EntrypointStatus> }} status
 * @param {string} word
 * @returns {{ summary: string, notes: string[] }}
 */
export function entrypointNotes(status, word) {
  const titleOf = titles(status.available, status.installed);
  const installs = (status.entrypoints ?? []).find((entry) => entry.word === word)?.installs ?? [];
  const after = growingOf(status.available)
    .filter((group) => group.word === word)
    .flatMap((group) => group.items)
    .filter((item) => !item.comes);
  const named = (lead, items) => (items.length === 0 ? [] : [`${lead}: ${items.join(', ')}.`]);
  const harness = status.installed.some(({ id }) => id === 'agent-harness');
  return {
    summary: `The project becomes the preset with both entrypoints: what that preset has and this project lacks is added,${harness ? ' the agent harness is re-rendered to speak of both,' : ''} and keel writes nothing of the entrypoint already here — on the JVM, the queued formatter still formats the whole project.`,
    notes: [
      ...named('Comes with it', installs.map(titleOf)),
      ...named(
        'Added after it, from Add verticals',
        after.filter((item) => !item.linked).map((item) => item.title),
      ),
      ...named(
        'Added after it, once a linked project serves it',
        after.filter((item) => item.linked).map((item) => item.title),
      ),
    ],
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
