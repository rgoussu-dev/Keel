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
 * **The dials are the exception.** A build system, a module layout,
 * the peer context and a product's repository layout are settings of
 * the preset rather than questions of an adapter, most presets share
 * them, and `keel.dials` already snaps a value the new preset cannot
 * take to one it can. So a new preset keeps them, and resetting them
 * was only ever throwing away work: toggling an adapter on the way to
 * `quarkus-cli-rest` cost you the Maven and the modulith you had
 * picked on `quarkus-rest`. What the move could *not* keep is said in
 * one line, once the reply has settled it ({@link settle}) — a dial
 * you had moved off its default, and the language, where the new
 * shape has none by the old one's name.
 *
 * Pure, and separate from any element, so every transition is testable
 * without a DOM — the same split `steps.js` and `finder.js` live under.
 *
 * @typedef {{ kind: string } & Record<string, unknown>} Target
 * @typedef {Record<string, Record<string, string>>} Answers
 * @typedef {{ id: string }} Option
 * @typedef {{ id: string, title: string, description: string, readiness: string, requires: ReadonlyArray<string> }} VerticalOption
 * @typedef {{ id: string, change: string, because: string }} Adjustment
 * @typedef {{ target: object, buildSystems: ReadonlyArray<Option>, moduleLayouts: ReadonlyArray<Option>, services: ReadonlyArray<{ path: string, buildSystems: ReadonlyArray<Option> }>, verticals?: ReadonlyArray<VerticalOption>, adjustments?: ReadonlyArray<Adjustment> }} Dials
 * @typedef {{ from: string, dials: Record<string, unknown> }} Carried
 * @typedef {{ target: Target, answers: Answers, dials: Dials | null, generation: number, carried: Carried | null, notice: string }} Run
 * @typedef {{ kind: string, adapter?: string, question?: string, service?: string }} Binding
 */

import { languageJump } from './finder.js';

/**
 * The fields of a `new-project` target a new preset keeps. `keel.dials`
 * drops or snaps whichever the new preset cannot take, so carrying one
 * a preset has never heard of costs nothing.
 */
const CARRIED = ['layout', 'buildSystem', 'moduleLayout', 'withPeerContext'];

/**
 * The carried dials the page speaks up for when a move loses one, and
 * how a sentence names each.
 *
 * The repository layout rides along without a line: it exists only on
 * a product, and leaving a product for a single project is leaving
 * the dial behind with it, not losing a value.
 */
const ANNOUNCED = {
  buildSystem: (value) => {
    const [path, id] = value.split('=');
    return id === undefined ? `build system ${value}` : `build system ${id} for ${path}`;
  },
  moduleLayout: (value) => `module layout ${value}`,
  withPeerContext: () => 'the peer context',
};

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
  return {
    target,
    answers: {},
    dials: null,
    generation: run.generation + 1,
    carried: null,
    notice: '',
  };
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
 *     over from its dials alone, which `keel.dials` then settles.
 *
 * Any move supersedes the last one's notice: a line about a move is
 * only worth reading while that move is the latest.
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
    carried: same ? unpatched(run.carried, patch) : carriedFrom(run, target),
    notice: '',
  };
}

/**
 * The run once `keel.dials` has replied: its target is the one the
 * reply settled, its menus are the reply's.
 *
 * Adopted whole: the reply already ran the install's resolution order,
 * and a page picking its own value per menu would be a second copy of
 * it. What this adds is the line. Where the reply settles a move onto
 * a new preset, it says what that move could not keep — a dial only if
 * it had been moved off the old preset's default, since the Gradle
 * nobody chose going missing is not news, and the language only where
 * it jumped (`finder.js`'s `languageJump`), which needs the finder.
 * Without one, the line is about the dials alone.
 *
 * @param {Run} run
 * @param {Dials} dials the `keel.dials` reply
 * @param {import('./finder.js').Finder | null} [finder]
 * @returns {Run}
 */
export function settle(run, dials, finder = null) {
  const target = /** @type {Target} */ (dials.target);
  return {
    ...run,
    target,
    dials,
    carried: null,
    notice: run.carried === null ? run.notice : noticeOf(run.carried, target, finder),
  };
}

/**
 * The run once a preview has replied: its answers are the ones that
 * preview asked for, and no others.
 *
 * A move within one subject keeps the answers, but it can take their
 * adapter out of the plan — an extra unticked after its question was
 * answered. An install refuses an answer no adapter of its plan reads
 * (`keel.unknown-answer`), so posting one would turn the plan this
 * preview approved into a refusal, and the command line shown beside
 * it into a `--set` the terminal refuses too. The preview is what
 * knows which questions the plan asks, and a reply is adopted only
 * while it is the latest, so what it drops is exactly what the run
 * it describes would not read.
 *
 * Not a move: the generation stays where it is, this reply being the
 * one the page was waiting for.
 *
 * @param {Run} run
 * @param {{ questions: ReadonlyArray<{ binding: Binding }> }} preview the `keel.preview` reply
 * @returns {Run}
 */
export function previewed(run, preview) {
  const asked = new Set(
    preview.questions
      .map(({ binding }) => binding)
      .filter((binding) => binding.kind === 'answer')
      .map((binding) => `${binding.adapter}:${binding.question}`),
  );
  const answers = {};
  for (const [adapter, byQuestion] of Object.entries(run.answers)) {
    const kept = Object.entries(byQuestion).filter(([question]) =>
      asked.has(`${adapter}:${question}`),
    );
    if (kept.length > 0) answers[adapter] = Object.fromEntries(kept);
  }
  return { ...run, answers };
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
    notice: '',
  };
}

/**
 * The run after an extra was ticked or unticked in the Options step's
 * "Also scaffold" group.
 *
 * The group is a set of checkboxes, and one tick is rarely one
 * vertical. **Ticking one that needs others ticks them too** — its
 * `requires`, as the last `keel.dials` reply reported them — because
 * that is the set the install runs either way: both front doors
 * include a missing prerequisite rather than refuse it, and a box
 * that stayed unticked beside a plan listing its files would be the
 * page contradicting itself. **Unticking one unticks every selected
 * vertical that needs it**, and whatever needed those in turn: a
 * vertical left ticked without what it needs would bring it straight
 * back, and the box just unticked would tick itself again on the
 * next reply.
 *
 * The set is then posted like any other dial move, and `keel.dials`
 * snaps it to the closure the install runs, in the order it runs it
 * ({@link settle}) — so the order ticks are made in is never the
 * order anything installs in. A move within one subject, so the
 * answers stay, and the next preview drops the ones an unticked
 * extra's adapters had been asked ({@link previewed}).
 *
 * @param {Run} run
 * @param {string} id the vertical the box stands for
 * @param {boolean} ticked whether the box is now ticked
 * @returns {Run}
 */
export function toggleExtra(run, id, ticked) {
  const requires = new Map(
    (run.dials?.verticals ?? []).map((vertical) => [vertical.id, vertical.requires]),
  );
  const selected = extrasOf(run.target);
  const next = ticked
    ? [...new Set([...selected, ...(requires.get(id) ?? []), id])]
    : withoutDependants(selected, requires, id);
  return retarget(run, { extraVerticals: next });
}

/**
 * The extras a target holds — `[]` until `keel.dials` has pinned them,
 * which it always does.
 *
 * @param {object | null} target
 * @returns {string[]}
 */
export function extrasOf(target) {
  const extras = target?.extraVerticals;
  return Array.isArray(extras) ? extras.map(String) : [];
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

/**
 * `selected` less `id` and everything that needs it, to a fixed
 * point: a vertical's `requires` is its whole closure today, but a
 * dependant of a dependant is still worth unticking if it ever is not.
 */
function withoutDependants(selected, requires, id) {
  const gone = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const other of selected) {
      if (gone.has(other)) continue;
      if ((requires.get(other) ?? []).some((needed) => gone.has(needed))) {
        gone.add(other);
        grew = true;
      }
    }
  }
  return selected.filter((other) => !gone.has(other));
}

function moved(target, patch) {
  if (patch.kind !== undefined) return patch;
  if (target.kind === 'new-project' && patch.stack !== undefined && patch.stack !== target.stack) {
    return { kind: 'new-project', stack: patch.stack, ...only(target, CARRIED) };
  }
  return { ...target, ...patch };
}

/**
 * What a move onto a new preset has to account for once it settles:
 * where it came from, and which of the dials it carries are worth a
 * line if lost.
 *
 * Worth a line means moved off the old preset's default, and the old
 * menus are where the default is read — `keel.dials` settles an unset
 * dial to its menu's first entry. Without menus, the move before this
 * one never settled, so this one carries on from where that one did:
 * the same preset, whose language a jump is measured from, and the
 * same dials still pending.
 */
function carriedFrom(run, target) {
  if (target.kind !== 'new-project' || run.target?.kind !== 'new-project') return null;
  if (run.dials === null && run.carried !== null) return run.carried;
  return {
    from: String(run.target.stack ?? ''),
    dials: run.dials === null ? {} : chosen(run.target, run.dials),
  };
}

/** The announced dials `target` holds at something other than their default. */
function chosen(target, dials) {
  const moved = {
    buildSystem:
      dials.services.length > 0
        ? servicesMoved(target.buildSystem, dials)
        : differs(target.buildSystem, dials.buildSystems[0]?.id),
    moduleLayout: differs(target.moduleLayout, dials.moduleLayouts[0]?.id),
    withPeerContext: differs(target.withPeerContext, false),
  };
  return Object.fromEntries(Object.entries(moved).filter(([, value]) => value !== undefined));
}

/** `value`, where it is set to something other than `fallback`. */
function differs(value, fallback) {
  return value === undefined || value === fallback ? undefined : value;
}

/**
 * The `path=id` pairs of a product's build systems that a service
 * holds off its first option — each service is a dial of its own, and
 * a Maven backend beside the default npm front end moved one, not two.
 */
function servicesMoved(raw, dials) {
  const defaults = new Set(
    dials.services
      .filter((service) => service.buildSystems.length > 0)
      .map((service) => `${service.path}=${service.buildSystems[0].id}`),
  );
  const moved = pairsOf(raw).filter((pair) => !defaults.has(pair));
  return moved.length === 0 ? undefined : moved.join(',');
}

/**
 * A composite `buildSystem`'s `path=id` pairs, the way the page's own
 * per-service control writes them; a single project's plain id has
 * none.
 */
function pairsOf(raw) {
  return String(raw ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.indexOf('=') > 0);
}

/**
 * `carried`, less the dials a patch has just set by hand — a value
 * picked before the reply lands is not one the move could lose.
 */
function unpatched(carried, patch) {
  if (carried === null) return null;
  return {
    ...carried,
    dials: Object.fromEntries(Object.entries(carried.dials).filter(([field]) => !(field in patch))),
  };
}

/** The line a settled move owes the user: the language jump, then the dials it lost. */
function noticeOf(carried, target, finder) {
  const lines = [];
  const jump = finder ? languageJump(finder, carried.from, String(target.stack ?? '')) : null;
  if (jump) {
    const shape = jump.shape.label.split(' — ')[0].toLowerCase();
    lines.push(
      `${jump.from.label} has no ${shape} preset, so the language is now ${jump.to.label}.`,
    );
  }
  const lost = Object.entries(carried.dials).flatMap(([field, value]) =>
    lostIn(target, field, value).map(ANNOUNCED[field]),
  );
  if (lost.length > 0) lines.push(`Moving to ${target.stack} did not keep ${series(lost)}.`);
  return lines.join(' ');
}

/**
 * What of a carried `value` the settled `target` does not hold: the
 * value itself, or — for a product's build systems, one dial per
 * service — each service's pair it did not keep.
 */
function lostIn(target, field, value) {
  const pairs = field === 'buildSystem' ? pairsOf(value) : [];
  if (pairs.length === 0) return target[field] === value ? [] : [value];
  const kept = new Set(pairsOf(target.buildSystem));
  return pairs.filter((pair) => !kept.has(pair));
}

/** `a`, `a or b`, `a, b or c`. */
function series(items) {
  return items.length === 1
    ? items[0]
    : `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

/** The fields of `object` named in `fields` that it sets. */
function only(object, fields) {
  return Object.fromEntries(
    fields.filter((field) => object[field] !== undefined).map((field) => [field, object[field]]),
  );
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
    default:
      return { [binding.kind]: value };
  }
}
