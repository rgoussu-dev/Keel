/**
 * What the page is about to run, and how each change moves it.
 *
 * `<keel-app>` holds four things that have to move together: the
 * target the body posts, the answers given to the adapters' questions
 * (and those a preset move holds for the next preview), the menus
 * `keel.dials` last returned, and the generation — the id of the one
 * request whose reply the page will still accept. They used to
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
 * verticals a `keel add` layers on as such, the one it re-renders, or
 * `keel add module` as such. The old menus describe nothing about a
 * new subject, so they start afresh. Ticking another card into an
 * add, or out of it, is not a new subject — the set grows or shrinks,
 * like the greenfield extras — so the answers stay and the next
 * preview drops the ones no adapter of the new set asks
 * ({@link previewed}); moving between adding and re-rendering is,
 * and so is re-rendering another vertical, and those start their
 * answers afresh too: a re-render reads what the manifest recorded,
 * and has no business with what an add was asked. Renaming the
 * context an `add-module` run creates is not a new subject either,
 * and keeps them.
 *
 * **A new preset is the exception, and keeps everything.** A build
 * system, a module layout, the peer context, a product's repository
 * layout, the extras — a product's per service — and a harness left
 * out are settings of the preset rather than questions of an adapter,
 * most presets share them, and `keel.dials` already snaps a value the
 * new preset cannot take to one it can — the extras to what it can
 * carry, saying why for each it drops, a single preset's onto the one
 * service of a product that can take each, and a product's onto a
 * single preset as its own. Most answers are shared too: `vcs/git-init` asks
 * for a default branch on every preset, by the same id. So resetting
 * them was only ever throwing away work — toggling an adapter on the
 * way to `quarkus-cli-rest` cost you the Maven, the modulith, the
 * pipeline and the package you had picked on `quarkus-rest`. What the
 * move could *not* keep is said in one line, once the reply has
 * settled it ({@link settle}): a dial you had moved off its default —
 * the harness left out among them, which a product puts back — an
 * extra the new preset cannot carry, and the language, where the new
 * shape has none by the old one's name.
 *
 * The answers are **held**, not posted, until a preview of the new
 * preset says where each still goes ({@link previewed}). Posted
 * blind, an answer the new preset's question does not offer — a
 * MariaDB chosen on a JVM preset, moved to Go — is a refusal the page
 * could not navigate out of, since the question to change it on
 * comes from the preview it refused. And the project's identity is
 * asked by each family's own bootstrap, under its own id: a package
 * chosen on `quarkus-rest` is `quarkus-rest-bootstrap`'s answer, and
 * `quarkus-cli-rest` asks `quarkus-cli-bootstrap` for it. The preview
 * marks those questions (`shared: 'project'`), and a held answer to
 * one moves onto the question of the same id the new preset asks.
 *
 * Pure, and separate from any element, so every transition is testable
 * without a DOM — the same split `steps.js` and `finder.js` live under.
 *
 * @typedef {{ kind: string } & Record<string, unknown>} Target
 * @typedef {Record<string, Record<string, string>>} Answers
 * @typedef {{ id: string }} Option
 * @typedef {{ id: string, title: string, description: string, readiness: string, requires: ReadonlyArray<string>, refusal?: { code: string, message: string } }} VerticalOption
 * @typedef {{ installed: ReadonlyArray<{ id: string }>, available: ReadonlyArray<{ id: string, requires: ReadonlyArray<string> }> }} Status
 * @typedef {{ id: string, change: string, because: string, service?: string }} Adjustment
 * @typedef {{ path: string, buildSystems: ReadonlyArray<Option>, verticals?: ReadonlyArray<VerticalOption> }} ServiceDials
 * @typedef {{ target: object, buildSystems: ReadonlyArray<Option>, moduleLayouts: ReadonlyArray<Option>, services: ReadonlyArray<ServiceDials>, verticals?: ReadonlyArray<VerticalOption>, adjustments?: ReadonlyArray<Adjustment> }} Dials
 * @typedef {{ from: string, dials: Record<string, unknown> }} Carried
 * @typedef {{ adapter: string, question: string, value: string, identity: boolean }} Held
 * @typedef {{ target: Target, answers: Answers, dials: Dials | null, generation: number, carried: Carried | null, notice: string, held: ReadonlyArray<Held>, identity: ReadonlyArray<string> }} Run
 * @typedef {{ kind: string, adapter?: string, question?: string, service?: string }} Binding
 * @typedef {{ binding: Binding, value?: string, kind?: string, choices?: ReadonlyArray<{ value: string }>, shared?: string }} Asked
 */

import { languageJump } from './finder.js';

/**
 * The fields of a `new-project` target a new preset keeps. `keel.dials`
 * drops or snaps whichever the new preset cannot take, so carrying one
 * a preset has never heard of costs nothing.
 */
const CARRIED = [
  'layout',
  'buildSystem',
  'moduleLayout',
  'withPeerContext',
  'extraVerticals',
  'services',
  'agentHarness',
];

/**
 * The carried dials the page speaks up for when a move loses one, and
 * how a sentence names each.
 *
 * The repository layout rides along without a line: it exists only on
 * a product, and leaving a product for a single project is leaving
 * the dial behind with it, not losing a value. The extras have a line
 * of their own, with the reason `keel.dials` dropped each (`noticeOf`).
 */
const ANNOUNCED = {
  buildSystem: (value) => {
    const [path, id] = value.split('=');
    return id === undefined ? `build system ${value}` : `build system ${id} for ${path}`;
  },
  moduleLayout: (value) => `module layout ${value}`,
  withPeerContext: () => 'the peer context',
  agentHarness: () => 'the agent harness off',
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
    held: [],
    identity: [],
  };
}

/**
 * The run after its target moved.
 *
 * `patch` is read one of two ways, by whether it names a `kind`:
 *
 *   - **With one, it is the whole target.** That is how
 *     `<keel-add-form>` speaks — a tab, a context name, and every card
 *     gesture through the transition that builds its target
 *     ({@link toggleVertical}, {@link rerender}) — and it replaces the
 *     target rather than merging into it. Merging is what kept
 *     `reapply: true` alive after the installed card that set it: the
 *     next card's patch simply did not mention it.
 *   - **Without one, it is the fields that moved**, the way the
 *     greenfield controls speak: a build system, a module layout, a
 *     preset. They merge — except that a new preset starts its target
 *     over from its dials and extras alone, which `keel.dials` then
 *     settles, and holds the answers for the next preview to place.
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
  const onward = !same && target.kind === 'new-project' && run.target?.kind === 'new-project';
  return {
    target,
    answers: same ? run.answers : {},
    dials: same ? run.dials : null,
    generation: run.generation + 1,
    carried: same ? unpatched(run.carried, patch) : carriedFrom(run, target),
    notice: '',
    held: same ? run.held : onward ? heldAcross(run) : [],
    identity: run.identity,
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
 * nobody chose going missing is not news; an extra the new preset
 * cannot carry, with the reason the reply dropped it for
 * (`adjustments`), but not one the new preset comes with, which is
 * kept rather than lost; and the language only where it jumped
 * (`finder.js`'s `languageJump`), which needs the finder. Without
 * one, the line is about the dials and extras alone.
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
    notice: run.carried === null ? run.notice : noticeOf(run.carried, dials, finder),
  };
}

/**
 * The run once a preview has replied: its answers are the ones that
 * preview asked for, and no others — and the answers a preset move
 * held are placed where it asks for them.
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
 * A held answer goes back to its own question where the new preset
 * asks it — the same adapter, asking the same thing, as every preset's
 * `vcs/git-init` does — and, failing that, an answer about the
 * project's identity goes to the identity question of the same id
 * the new preset asks under its own bootstrap. Either way only onto a
 * question nothing has answered yet, and only where the question
 * offers the value: a choice the new preset does not offer is left
 * behind rather than posted into a `keel.invalid-answer`. What finds
 * no question is let go.
 *
 * Not a move, as a rule: the generation stays where it is, this reply
 * being the one the page was waiting for. Placing a held answer the
 * preview did not already resolve to is the exception — the reply no
 * longer describes the run, so the generation moves on, and the page
 * previews again. What is still held waits for that preview, since an
 * answer can bring an adapter into the plan whose own question it is;
 * a reply that places nothing new lets the rest go.
 *
 * @param {Run} run
 * @param {{ questions: ReadonlyArray<Asked> }} preview the `keel.preview` reply
 * @returns {Run}
 */
export function previewed(run, preview) {
  const questions = preview.questions.filter(({ binding }) => binding.kind === 'answer');
  const asked = new Map(questions.map((question) => [keyOf(question.binding), question]));
  const answers = {};
  for (const [adapter, byQuestion] of Object.entries(run.answers)) {
    const kept = Object.entries(byQuestion).filter(([question]) =>
      asked.has(`${adapter}:${question}`),
    );
    if (kept.length > 0) answers[adapter] = Object.fromEntries(kept);
  }

  const taken = new Set();
  let outdated = false;
  const open = (question) =>
    question !== undefined &&
    answers[question.binding.adapter]?.[question.binding.question] === undefined;
  const place = (entry, question) => {
    if (!open(question) || !offers(question, entry.value)) return;
    const { adapter, question: id } = question.binding;
    answers[adapter] = { ...(answers[adapter] ?? {}), [id]: entry.value };
    taken.add(entry);
    if (question.value !== entry.value) outdated = true;
  };
  for (const entry of run.held) place(entry, asked.get(keyOf(entry)));
  for (const entry of run.held) {
    if (taken.has(entry) || !entry.identity || asked.has(keyOf(entry))) continue;
    place(
      entry,
      questions.find(
        (question) =>
          question.shared === 'project' &&
          question.binding.question === entry.question &&
          open(question),
      ),
    );
  }

  return {
    ...run,
    answers,
    generation: outdated ? run.generation + 1 : run.generation,
    held: outdated ? run.held.filter((entry) => !taken.has(entry)) : [],
    identity: questions
      .filter((question) => question.shared === 'project')
      .map((question) => keyOf(question.binding)),
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
 * On a product the group is a service's, and so is the set: `service`
 * names it, its `requires` are read off that service's menu, and the
 * move is to `services[service]` — the rest of the product's extras
 * are left as they are.
 *
 * @param {Run} run
 * @param {string} id the vertical the box stands for
 * @param {boolean} ticked whether the box is now ticked
 * @param {string | null} [service] the product's service whose group it is in
 * @returns {Run}
 */
export function toggleExtra(run, id, ticked, service = null) {
  const menu =
    service === null
      ? (run.dials?.verticals ?? [])
      : ((run.dials?.services ?? []).find((candidate) => candidate.path === service)?.verticals ??
        []);
  const requires = new Map(menu.map((vertical) => [vertical.id, vertical.requires]));
  const selected = service === null ? extrasOf(run.target) : serviceExtrasOf(run.target, service);
  const next = ticked
    ? [...new Set([...selected, ...(requires.get(id) ?? []), id])]
    : withoutDependants(selected, requires, id);
  if (service === null) return retarget(run, { extraVerticals: next });
  const services = { ...(run.target?.services ?? {}) };
  if (next.length > 0) services[service] = { extraVerticals: next };
  else delete services[service];
  return retarget(run, { services });
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
 * The extras a product's target holds for its service at `path` — `[]`
 * where it names none.
 *
 * @param {object | null} target
 * @param {string} path
 * @returns {string[]}
 */
export function serviceExtrasOf(target, path) {
  const extras = target?.services?.[path]?.extraVerticals;
  return Array.isArray(extras) ? extras.map(String) : [];
}

/** Every extra a target holds: its own, then each service's, each once. */
function allExtrasOf(target) {
  const services = Object.keys(target?.services ?? {});
  return [
    ...new Set([...extrasOf(target), ...services.flatMap((path) => serviceExtrasOf(target, path))]),
  ];
}

/** Every vertical a reply's menus list, a product's services' included. */
function menusOf(dials) {
  return [
    ...(dials.verticals ?? []),
    ...(dials.services ?? []).flatMap((service) => service.verticals ?? []),
  ];
}

/**
 * The run after a card of the brownfield "What to add" step was ticked
 * or unticked.
 *
 * The cards are checkboxes, as the greenfield extras are, and one tick
 * is rarely one vertical. **Ticking one that needs others ticks them
 * too** — its `requires`, as the project status reports them — since
 * `keel add` installs them with it either way, and a card left
 * unticked beside a plan listing its files would be the page
 * contradicting itself. **Unticking one unticks every ticked vertical
 * that needs it**, and whatever needed those in turn.
 *
 * The set is posted as `verticals`, prerequisites ahead of what needs
 * them — the order the add runs them in, so the command line under
 * the plan is the one a person would type — and otherwise in the
 * order the cards are listed. A tick made while the page was
 * re-rendering an installed vertical starts a new add: the two are
 * different runs, and the re-render is let go. Re-renders taken up
 * beside the add ({@link toggleRefresh}) stay while anything is left
 * to add, and go with the last card unticked, a re-render being what
 * {@link rerender} is for.
 *
 * @param {Run} run
 * @param {Status} status the `/api/project` payload
 * @param {string} id the vertical the card stands for
 * @param {boolean} ticked whether the card is now ticked
 * @returns {Run}
 */
export function toggleVertical(run, status, id, ticked) {
  const requires = new Map(status.available.map((vertical) => [vertical.id, vertical.requires]));
  const adding = run.target?.kind === 'add-vertical' && run.target.reapply !== true;
  const selected = adding ? verticalsOf(run.target) : [];
  const next = ticked
    ? [...new Set([...selected, ...(requires.get(id) ?? []), id])]
    : withoutDependants(selected, requires, id);
  const ordered = installOrder(
    next,
    status.available.map((vertical) => vertical.id),
    requires,
  );
  return retarget(
    run,
    addTarget(ordered, adding && ordered.length > 0 ? refreshOf(run.target) : []),
  );
}

/**
 * The run after an installed vertical's **Re-render** was pressed: a
 * run of its own — `keel add <id> --reapply` — rather than a card in
 * the add's set, since a re-render rewrites what the vertical owns
 * from the answers the manifest recorded, and has no business riding
 * along with an install. Pressed again on the vertical being
 * re-rendered, it lets it go, and the page is back to adding nothing.
 *
 * @param {Run} run
 * @param {string} id the installed vertical
 * @returns {Run}
 */
export function rerender(run, id) {
  const again = rerendering(run.target) === id;
  return retarget(
    run,
    again ? addTarget([], []) : { kind: 'add-vertical', verticals: [id], reapply: true },
  );
}

/**
 * The run after a proposed re-render was taken up beside an add, or
 * let go — `keel add`'s `--refresh`: an installed vertical the run
 * would otherwise leave rendered without what it now brings.
 *
 * @param {Run} run
 * @param {string} id the installed vertical
 * @param {boolean} ticked whether it is now re-rendered in the run
 * @returns {Run}
 */
export function toggleRefresh(run, id, ticked) {
  const refresh = refreshOf(run.target).filter((other) => other !== id);
  return retarget(run, addTarget(verticalsOf(run.target), ticked ? [...refresh, id] : refresh));
}

/**
 * The verticals an `add-vertical` target names — `[]` for any other
 * target, and for one with none ticked yet.
 *
 * @param {object | null} target
 * @returns {string[]}
 */
export function verticalsOf(target) {
  const verticals = target?.kind === 'add-vertical' ? target.verticals : undefined;
  return Array.isArray(verticals) ? verticals.map(String) : [];
}

/**
 * The installed verticals an `add-vertical` target re-renders beside
 * what it adds (`refresh`) — `[]` when none.
 *
 * @param {object | null} target
 * @returns {string[]}
 */
export function refreshOf(target) {
  const refresh = target?.kind === 'add-vertical' ? target.refresh : undefined;
  return Array.isArray(refresh) ? refresh.map(String) : [];
}

/**
 * The installed vertical a target re-renders on its own, or null where
 * it is not a re-render.
 *
 * @param {object | null} target
 * @returns {string | null}
 */
export function rerendering(target) {
  if (target?.kind !== 'add-vertical' || target.reapply !== true) return null;
  return verticalsOf(target)[0] ?? null;
}

/** A whole `add-vertical` target adding `verticals`, re-rendering `refresh` beside them. */
function addTarget(verticals, refresh) {
  return {
    kind: 'add-vertical',
    verticals,
    ...(refresh.length === 0 ? {} : { refresh }),
  };
}

/**
 * `selected` in the order it installs, as far as the page can tell:
 * each vertical after what it requires, and otherwise in `listed`
 * order — the cards'. The add plans the set whole either way; this is
 * so the command line spells it the way it runs.
 */
function installOrder(selected, listed, requires) {
  const chosen = new Set(selected);
  const order = [];
  const place = (id) => {
    if (!chosen.has(id) || order.includes(id)) return;
    for (const needed of requires.get(id) ?? []) place(needed);
    order.push(id);
  };
  for (const id of [...listed, ...selected]) place(id);
  return order;
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
 * where it came from, and which of the dials and extras it carries
 * are worth a line if lost.
 *
 * Worth a line means moved off the old preset's default, and the old
 * menus are where the default is read — `keel.dials` settles an unset
 * dial to its menu's first entry, and the extras to none. Without menus, the move before this
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

/**
 * The announced dials `target` holds at something other than their
 * default — and its extras, whose default is none.
 */
function chosen(target, dials) {
  const moved = {
    buildSystem:
      dials.services.length > 0
        ? servicesMoved(target.buildSystem, dials)
        : differs(target.buildSystem, dials.buildSystems[0]?.id),
    moduleLayout: differs(target.moduleLayout, dials.moduleLayouts[0]?.id),
    withPeerContext: differs(target.withPeerContext, false),
    agentHarness: differs(target.agentHarness, true),
    extraVerticals: titled(allExtrasOf(target), dials),
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
 * `extras`, each with the title the menus that offered it gave it —
 * the reply settling the move may not list it at all. Undefined for
 * none.
 */
function titled(extras, dials) {
  if (extras.length === 0) return undefined;
  const titles = new Map(menusOf(dials).map((vertical) => [vertical.id, vertical.title]));
  return extras.map((id) => ({ id, title: titles.get(id) ?? id }));
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
 * picked before the reply lands is not one the move could lose. A
 * product's service extras are the extras, as far as that goes.
 */
function unpatched(carried, patch) {
  if (carried === null) return null;
  const touched = (field) => field in patch || (field === 'extraVerticals' && 'services' in patch);
  return {
    ...carried,
    dials: Object.fromEntries(Object.entries(carried.dials).filter(([field]) => !touched(field))),
  };
}

/**
 * The line a settled move owes the user: the language jump, then the
 * dials and extras it lost — an extra `keel.dials` gave a reason for
 * dropping in a sentence of its own, with that reason.
 */
function noticeOf(carried, dials, finder) {
  const target = dials.target;
  const lines = [];
  const jump = finder ? languageJump(finder, carried.from, String(target.stack ?? '')) : null;
  if (jump) {
    const shape = jump.shape.label.split(' — ')[0].toLowerCase();
    lines.push(
      `${jump.from.label} has no ${shape} preset, so the language is now ${jump.to.label}.`,
    );
  }
  const { extraVerticals = [], ...announced } = carried.dials;
  const dropped = extrasLost(extraVerticals, dials);
  const lost = [
    ...Object.entries(announced).flatMap(([field, value]) =>
      lostIn(target, field, value).map(ANNOUNCED[field]),
    ),
    ...dropped.filter((extra) => extra.because === undefined).map((extra) => extra.title),
  ];
  if (lost.length > 0) lines.push(`Moving to ${target.stack} did not keep ${series(lost)}.`);
  for (const extra of dropped) {
    if (extra.because !== undefined) lines.push(`${extra.title} dropped: ${extra.because}.`);
  }
  return lines.join(' ');
}

/**
 * The carried extras the settled reply does not hold, each with the
 * reason the reply gave for dropping it where it gave one. One the new
 * preset comes with is not among them: that one is kept — by the
 * preset now rather than by a box. On a product, one a service holds
 * is kept, whichever service, and one a service comes with is kept by
 * it.
 */
function extrasLost(carried, dials) {
  const kept = new Set(allExtrasOf(dials.target));
  const included = new Set(
    menusOf(dials)
      .filter((vertical) => vertical.readiness === 'included')
      .map((vertical) => vertical.id),
  );
  const reasons = new Map(
    (dials.adjustments ?? [])
      .filter((adjustment) => adjustment.change === 'dropped')
      .map((adjustment) => [adjustment.id, adjustment.because]),
  );
  return carried
    .filter(({ id }) => !kept.has(id) && !included.has(id))
    .map(({ id, title }) => ({ title, because: reasons.get(id) }));
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

/**
 * What a move onto a new preset holds for the next preview to place:
 * every answer given — each marked as the project's identity where
 * the latest preview's question for it was one — then whatever an
 * earlier move still holds that was not answered again since.
 */
function heldAcross(run) {
  const given = Object.entries(run.answers).flatMap(([adapter, byQuestion]) =>
    Object.entries(byQuestion).map(([question, value]) => ({
      adapter,
      question,
      value,
      identity: run.identity.includes(`${adapter}:${question}`),
    })),
  );
  const again = new Set(given.map(keyOf));
  return [...given, ...run.held.filter((entry) => !again.has(keyOf(entry)))];
}

/** An answer's `adapter:question` key, off its binding or a held entry alike. */
function keyOf({ adapter, question }) {
  return `${adapter}:${question}`;
}

/**
 * Whether `question` offers `value`: any value where it has no choices,
 * and otherwise one of them — each of them, for a `multi-select`,
 * whose answer is the choices comma-joined and `''` for none.
 */
function offers(question, value) {
  const choices = (question.choices ?? []).map((choice) => choice.value);
  if (choices.length === 0) return true;
  if (question.kind !== 'multi-select') return choices.includes(value);
  return value
    .split(',')
    .filter((part) => part !== '')
    .every((part) => choices.includes(part));
}

/** The fields of `object` named in `fields` that it sets. */
function only(object, fields) {
  return Object.fromEntries(
    fields.filter((field) => object[field] !== undefined).map((field) => [field, object[field]]),
  );
}

function subject(target) {
  if (target.kind === 'new-project') return `new-project:${target.stack ?? ''}`;
  if (target.kind === 'add-vertical') {
    return target.reapply === true
      ? `add-vertical:reapply:${verticalsOf(target).join(',')}`
      : 'add-vertical';
  }
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
