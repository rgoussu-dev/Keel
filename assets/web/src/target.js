/**
 * What the page is about to run, and how each change moves it.
 *
 * `<keel-app>` holds four things that have to move together: the
 * target the body posts, the answers given to the adapters' questions,
 * the menus `keel.dials` last returned, and the generation — the id of
 * the one request whose reply the page will still accept. They used to
 * be moved field by field inside the element, and each state bug the
 * brownfield half shipped was one of them failing to move with the
 * others: a re-render flag that outlived the installed card that set
 * it, so every card picked after it was refused as "nothing to
 * reapply"; answers that outlived their card, and rode the next one
 * into a `--set` nobody typed; and a dials reply that outlived the
 * pick that superseded it, snapping a control back.
 *
 * **Every change supersedes whatever is in flight.** Each transition
 * here returns the next generation, so a reply to a request made
 * before it is dropped rather than adopted: `keel.dials` hands back a
 * whole target, and adopting one computed for the previous pick would
 * undo the pick.
 *
 * **A run is about one subject** — the stack a `keel new` builds, the
 * vertical a `keel add` layers on, or `keel add module` as such. A
 * different subject means different adapters, so the answers gathered
 * for the old one are meaningless, and the old menus describe nothing
 * about the new one; both start afresh. Renaming the context an
 * `add-module` run creates is not a new subject, and keeps them.
 *
 * Pure, and separate from any element, so every transition is testable
 * without a DOM — the same split `steps.js` and `finder.js` live under.
 *
 * @typedef {{ kind: string } & Record<string, unknown>} Target
 * @typedef {Record<string, Record<string, string>>} Answers
 * @typedef {{ target: Target, answers: Answers, dials: object | null, generation: number }} Run
 * @typedef {{ kind: string, adapter?: string, question?: string, service?: string }} Binding
 */

import { decodeSelection } from './finder.js';

/**
 * The run starting over at `target`, as it does whenever the page is
 * pointed at a directory. Nothing carries over but the generation,
 * which still moves on: a reply to a request made against the previous
 * directory must not land on this one.
 *
 * @param {Run} run
 * @param {Target} target
 * @returns {Run}
 */
export function restart(run, target) {
  return { target, answers: {}, dials: null, generation: run.generation + 1 };
}

/**
 * The run after its target moved.
 *
 * `patch` is read one of two ways, by whether it names a `kind`:
 *
 *   - **With one, it is the whole target.** That is how
 *     `<keel-add-form>` speaks — a card, a tab, a context name — and
 *     it replaces the target rather than merging into it. Merging is
 *     what kept `reapply: true` alive after the installed card that
 *     set it: the next card's patch simply did not mention it.
 *   - **Without one, it is the fields that moved**, the way the
 *     greenfield controls speak: a build system, a module layout, a
 *     preset. They merge — except that a new preset starts its target
 *     over, since the old stack's dials may name values the new one
 *     has never heard of.
 *
 * @param {Run} run
 * @param {Record<string, unknown>} patch
 * @returns {Run}
 */
export function retarget(run, patch) {
  const target = moved(run.target, patch);
  const same = subject(target) === subject(run.target);
  return {
    target,
    answers: same ? run.answers : {},
    dials: same ? run.dials : null,
    generation: run.generation + 1,
  };
}

/**
 * The run after a question was answered.
 *
 * Where the answer goes is the question's binding, reported by the
 * preview: an adapter's answer joins `answers` under the adapter's
 * id, and anything else is a field of the command — so it moves the
 * target, through {@link retarget}, like any other control would.
 *
 * @param {Run} run
 * @param {{ binding: Binding, value: string }} answered
 * @returns {Run}
 */
export function answer(run, { binding, value }) {
  if (binding.kind !== 'answer') return retarget(run, fieldOf(binding, value));
  const { adapter, question } = binding;
  return {
    ...run,
    answers: { ...run.answers, [adapter]: { ...(run.answers[adapter] ?? {}), [question]: value } },
    generation: run.generation + 1,
  };
}

/**
 * The whole target a vertical's card stands for.
 *
 * `reapply` is always stated, and stated for *this* card: an installed
 * vertical is offered for a re-render, any other for an install, and
 * which one a pick means has nothing to do with the card picked
 * before it.
 *
 * @param {{ installed: ReadonlyArray<{ id: string }> }} status the `/api/project` payload
 * @param {string} vertical the card's id
 * @returns {Target}
 */
export function pickVertical(status, vertical) {
  return {
    kind: 'add-vertical',
    vertical,
    reapply: status.installed.some((installed) => installed.id === vertical),
  };
}

function moved(target, patch) {
  if (patch.kind !== undefined) return patch;
  if (target.kind === 'new-project' && patch.stack !== undefined && patch.stack !== target.stack) {
    return { kind: 'new-project', stack: patch.stack };
  }
  return { ...target, ...patch };
}

function subject(target) {
  if (target.kind === 'new-project') return `new-project:${target.stack ?? ''}`;
  if (target.kind === 'add-vertical') return `add-vertical:${target.vertical ?? ''}`;
  return target.kind;
}

/** The command field a non-adapter binding fills, as a patch. */
function fieldOf(binding, value) {
  switch (binding.kind) {
    case 'buildSystem':
      // One service of a composite: the dial is `service=value`.
      return { buildSystem: binding.service === undefined ? value : `${binding.service}=${value}` };
    case 'withPeerContext':
      return { withPeerContext: value === 'yes' };
    case 'extraVerticals':
      // A set answer: comma-joined on the wire, a list in the target.
      return { extraVerticals: decodeSelection(value) };
    default:
      return { [binding.kind]: value };
  }
}
