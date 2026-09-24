/**
 * `<keel-new-form>` — the greenfield half, one step at a time.
 *
 * The element renders **one** step of the drill-down or the dials,
 * whichever `step` names. That is the whole difference from the form
 * this replaced: the four narrowing questions used to sit on screen
 * together as facets, and now they are asked the way the terminal
 * wizard asks them — widest first, each within the last — because
 * "language, adapters, framework, all at once" is a grid you have to
 * already understand to use.
 *
 * **Two sources, and each answers a different question.** Whether a
 * dial exists at all is a property of the preset, so the catalog
 * decides that: `quarkus-rest` has a build-system control because it
 * offers Gradle or Maven, and `go-cli` has none. What that control
 * may be *set to* is a property of the combination — a `Conflict` can
 * name two dials at once — so `keel.dials` decides that, and the
 * options come from there. Keeping the two apart is what stops a
 * control disappearing under the user when a rule narrows it to one
 * value: the choice is still shown, with only the legal value on it.
 *
 * Nothing here re-states a rule. The peer-context checkbox used to
 * read `moduleLayout === 'modulith'`, which was a third copy of
 * `peer-context-needs-modulith` living in the browser; it now asks
 * `dials.peerContext`, which is the declaration itself.
 *
 * **These controls are not rendered from the preview's question
 * list**, and the difference matters. A stack-level dial is a field of
 * the command, so once it is set the install stops asking about it —
 * a control driven by the preview would vanish the moment it was
 * used. That is exactly what the extras did while they were a
 * preview question: one tick, and the list was gone. They are the
 * "Also scaffold" group here now, drawn from `dials.verticals`
 * (`../extras.js`), and `keel.dials` pins them on every target it
 * settles so the preview never asks them again. Everything
 * conditional still comes back from the preview and is rendered by
 * `<keel-question-list>`.
 *
 * **Focus survives a re-render.** Every reply redraws the step, and a
 * box ticked from the keyboard would otherwise hand the focus back to
 * the page body — so the focused control is found again by its id, or
 * by its group and value, once the new one is in.
 *
 * Catalog, dials, target and step in as properties; `target-changed`
 * out with the fields that moved — the agent harness pressed off or
 * back on among them, `agentHarness` — and `extra-toggled` out with
 * the vertical an "Also scaffold" box stands for and whether it is now
 * ticked — what else that tick moves is `../target.js`'s answer.
 */

import {
  decodeSelection,
  encodeSelection,
  locate,
  pickEntrypoints,
  pickFramework,
  pickLanguage,
  pickShape,
} from '../finder.js';
import {
  cards,
  checkboxCards,
  el,
  focusIn,
  help,
  icon,
  note,
  prose,
  refocus,
  refusedList,
} from '../dom.js';
import { extrasGroup } from '../extras.js';
import { ENTRYPOINTS, FRAMEWORK, LANGUAGE, OPTIONS, SHAPE } from '../steps.js';

export class KeelNewForm extends HTMLElement {
  #catalog = null;
  #dials = null;
  #target = null;
  #step = SHAPE;
  /** Whether "Not for this project" is open — the reader's, kept across redraws. */
  #refusedOpen = false;

  /** @param {object} value the `/api/catalog` payload */
  set catalog(value) {
    this.#catalog = value;
    this.#render();
  }

  /**
   * @param {object|null} value the `/api/dials` payload, or null
   * before the first one lands — in which case the controls fall back
   * to the catalog's unfiltered lists, which is what they describe
   * with no rule in play.
   */
  set dials(value) {
    this.#dials = value;
    this.#render();
  }

  /** @param {object} value the current new-project target */
  set target(value) {
    this.#target = value;
    this.#render();
  }

  /** @param {string} value which step to render; see `../steps.js` */
  set step(value) {
    this.#step = value;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #change(patch) {
    this.dispatchEvent(new CustomEvent('target-changed', { bubbles: true, detail: patch }));
  }

  /** Moves to `stack`, or re-renders to snap a refused control back. */
  #moveTo(stack) {
    if (stack) this.#change({ stack });
    else this.#render();
  }

  #stack() {
    return this.#catalog?.stacks.find((stack) => stack.id === this.#target?.stack) ?? null;
  }

  /** Where the current preset sits in the finder; null if unplaceable. */
  #located() {
    const finder = this.#catalog?.finder;
    if (!finder || !this.#target?.stack) return null;
    return locate(finder, this.#target.stack);
  }

  #render() {
    if (!this.isConnected || !this.#catalog || !this.#target) return;
    const focused = focusIn(this);
    const form = document.createElement('stack-pk');
    form.setAttribute('space', 'var(--s0)');
    form.append(...this.#fields());
    this.replaceChildren(form);
    refocus(this, focused);
  }

  /** The controls of the step being shown, or an explanation of its absence. */
  #fields() {
    const here = this.#located();
    if (this.#step === SHAPE) return [this.#shapeField(here)];
    if (this.#step === OPTIONS) return this.#optionFields();
    if (!here) return [note(UNPLACEABLE)];
    if (this.#step === LANGUAGE) return [this.#languageField(here)];
    if (this.#step === FRAMEWORK) return [this.#frameworkField(here)];
    if (this.#step === ENTRYPOINTS) return [this.#entrypointsField(here)];
    return [];
  }

  /* ---- the drill-down ------------------------------------------ */

  #shapeField(here) {
    const finder = this.#catalog.finder;
    return cards({
      id: 'shape',
      chosen: here?.shape.id ?? '',
      choices: (finder?.shapes ?? []).map((shape) => ({
        value: shape.id,
        label: shape.label,
        doc: shape.doc,
      })),
      onChange: (value) => this.#moveTo(pickShape(finder, value, here)),
    });
  }

  #languageField(here) {
    return cards({
      id: 'language',
      chosen: here.language.id,
      choices: here.shape.languages.map((language) => ({
        value: language.id,
        label: language.label,
        doc: language.doc,
      })),
      onChange: (value) => this.#moveTo(pickLanguage(here.shape, value, here)),
    });
  }

  #frameworkField(here) {
    return cards({
      id: 'framework',
      chosen: here.framework.id,
      choices: here.language.frameworks.map((framework) => ({
        value: framework.id,
        label: framework.label,
        doc: framework.combinations.map((combination) => combination.stack).join(', '),
      })),
      onChange: (value) => this.#moveTo(pickFramework(here.language, value, here)),
    });
  }

  /**
   * The last narrowing step. A checkbox group where every subset of
   * what it shows is a preset, and a single choice over spelled-out
   * combinations where it is not — the engine says which, because a
   * page guessing wrong offers a combination it cannot resolve.
   */
  #entrypointsField(here) {
    const step = here.framework.entrypointStep;
    const chosen = encodeSelection(here.combination.entrypoints);
    if (step.kind !== 'multi-select') {
      return cards({
        id: 'entrypoints',
        chosen,
        choices: step.choices.map((choice) => ({
          value: choice.id,
          label: choice.label,
          doc: choice.doc,
        })),
        onChange: (value) => this.#moveTo(pickEntrypoints(here.framework, value)),
      });
    }
    return checkboxCards({
      id: 'entrypoints',
      chosen: [...decodeSelection(chosen)],
      choices: step.choices.map((choice) => ({
        value: choice.id,
        label: choice.label,
        doc: choice.doc,
      })),
      onChange: (values) => this.#moveTo(pickEntrypoints(here.framework, encodeSelection(values))),
    });
  }

  /* ---- the dials ----------------------------------------------- */

  #optionFields() {
    const stack = this.#stack();
    if (!stack) return [note(UNPLACEABLE)];
    if (stack.services.length > 0) {
      const fields = [this.#layoutField()];
      for (const service of stack.services) {
        if (service.buildSystems.length > 1) {
          fields.push(this.#serviceBuildField(service, this.#serviceOptions(service)));
        }
      }
      return fields;
    }
    const fields = [];
    // The catalog says whether the control exists; the dials say what
    // may be on it.
    if (stack.buildSystems.length > 1) fields.push(this.#buildField(this.#buildSystems(stack)));
    if (stack.moduleLayouts.length > 1) {
      fields.push(this.#moduleLayoutField(this.#moduleLayouts(stack)));
    }
    if (this.#dials?.peerContext === true) fields.push(this.#peerContextField());
    const extras = extrasGroup(this.#dials, this.#target);
    if (extras !== null) fields.push(this.#extrasField(stack, extras));
    if (fields.length > 0) return fields;
    // Every preset has this step, so one pinning both dials is drawn
    // before its extras have arrived — and "nothing to choose" would
    // be wrong for as long as the first reply takes.
    return [
      note(
        this.#dials === null
          ? 'Reading what this preset can take…'
          : 'This preset pins every dial — nothing to choose.',
      ),
    ];
  }

  /**
   * "Also scaffold": the verticals this preset can take on top of its
   * own, in the parts `../extras.js` sorts them into, and — collapsed,
   * each with its reason — the ones it cannot take. Ticking and
   * unticking are gestures rather than field edits — one box can move
   * several — so a box emits which vertical it is and how it moved,
   * and `<keel-app>` asks `../target.js` for the rest.
   */
  #extrasField(stack, extras) {
    const chosen = extras.chosen;
    const part = (id, title, choices) => {
      const heading = el('h4', { id: `${id}-title`, text: title });
      const group = checkboxCards({
        id,
        chosen,
        choices,
        onChange: (values) => {
          const now = new Set(values);
          const moved = choices.find(
            (choice) => now.has(choice.value) !== chosen.includes(choice.value),
          );
          if (moved) this.#toggle(moved.value, now.has(moved.value));
        },
      });
      group.setAttribute('role', 'group');
      group.setAttribute('aria-labelledby', heading.id);
      return el('div', {}, heading, group);
    };
    const switchable = extras.included.find((vertical) => vertical.on !== undefined);
    const included =
      extras.included.length === 0
        ? null
        : el(
            'div',
            {},
            el('h4', { id: 'extras-included-title', text: `Comes with ${stack.id}` }),
            el(
              'ul',
              {
                id: 'extras-included',
                class: 'plain chips',
                attrs: { 'aria-labelledby': 'extras-included-title' },
              },
              ...extras.included.map((vertical) =>
                vertical.on === undefined
                  ? el('li', {
                      class: 'chip',
                      text: vertical.title,
                      attrs: { 'data-id': vertical.id },
                    })
                  : el('li', { attrs: { 'data-id': vertical.id } }, this.#harnessSwitch(vertical)),
              ),
            ),
            switchable === undefined ? null : harnessHint(switchable),
          );
    return el(
      'section',
      { id: 'extras', class: 'extras', attrs: { 'aria-labelledby': 'extras-title' } },
      el(
        'div',
        { class: 'section-head' },
        el('h3', { id: 'extras-title', text: 'Also scaffold' }),
        el('span', {
          class: chosen.length > 0 ? 'chip accent' : 'chip',
          text: `${chosen.length} chosen`,
        }),
      ),
      help(
        `Installed in the same run, on top of what \`${stack.id}\` brings, in the order they build on one another. Everything here is also available later with \`keel add\`.`,
      ),
      extras.line === ''
        ? null
        : el('p', {
            class: 'extras-line',
            text: extras.line,
            attrs: { role: 'status', 'data-role': 'extras-line' },
          }),
      extras.ready.length === 0 ? null : part('extras-ready', 'Ready', extras.ready),
      extras.needs.length === 0
        ? null
        : part('extras-needs', 'Needs another capability first', extras.needs),
      included,
      extras.refused.length === 0
        ? null
        : refusedList({
            id: 'extras-refused',
            title: 'Not for this project',
            items: extras.refused,
            open: this.#refusedOpen,
            onToggle: (open) => (this.#refusedOpen = open),
          }),
    );
  }

  #toggle(id, ticked) {
    this.dispatchEvent(new CustomEvent('extra-toggled', { bubbles: true, detail: { id, ticked } }));
  }

  /**
   * The agent harness's chip where the preset may leave it out: the
   * same chip in the same list — it comes with the preset like the
   * others — drawn as a toggle button, pressed while the harness is on
   * and let go for `--no-agent-harness`. One field moves, so it is a
   * field edit like the peer-context box, not an extras gesture.
   */
  #harnessSwitch(chip) {
    return el(
      'button',
      {
        id: 'agentHarness',
        type: 'button',
        class: 'chip switch',
        attrs: { 'aria-pressed': String(chip.on), 'aria-describedby': 'agentHarness-hint' },
        on: { click: () => this.#change({ agentHarness: !chip.on }) },
      },
      chip.on ? icon('check') : null,
      chip.title,
    );
  }

  /**
   * Build systems still legal here, or the catalog's whole list until
   * the first dials reply lands — which is what the list means with
   * no rule in play, and the only honest thing to render before the
   * engine has been asked.
   */
  #buildSystems(stack) {
    const offered = this.#dials?.buildSystems ?? [];
    return offered.length > 0 ? offered : stack.buildSystems;
  }

  /** Module layouts still legal here; same fallback. */
  #moduleLayouts(stack) {
    const offered = this.#dials?.moduleLayouts ?? [];
    return offered.length > 0 ? offered : stack.moduleLayouts;
  }

  /** One service's build systems; same fallback. */
  #serviceOptions(service) {
    const offered = (this.#dials?.services ?? []).find(
      (candidate) => candidate.path === service.path,
    );
    return offered && offered.buildSystems.length > 0 ? offered.buildSystems : service.buildSystems;
  }

  #buildField(options) {
    return field({
      id: 'buildSystem',
      label: 'Build system',
      doc: docOf(options, this.#target.buildSystem),
      value: this.#target.buildSystem ?? options[0].id,
      choices: options.map(asChoice),
      onChange: (value) => this.#change({ buildSystem: value }),
    });
  }

  #serviceBuildField(service, options) {
    const chosen = serviceBuild(this.#target.buildSystem, service.path) ?? options[0].id;
    return field({
      id: `buildSystem-${service.path}`,
      label: `Build system — ${service.path} (${service.stack})`,
      doc: docOf(options, chosen),
      value: chosen,
      choices: options.map(asChoice),
      onChange: (value) =>
        this.#change({
          buildSystem: withServiceBuild(this.#target.buildSystem, service.path, value),
        }),
    });
  }

  #moduleLayoutField(options) {
    return field({
      id: 'moduleLayout',
      label: 'Module layout',
      doc: docOf(options, this.#target.moduleLayout),
      value: this.#target.moduleLayout ?? options[0].id,
      choices: options.map(asChoice),
      onChange: (value) => this.#change({ moduleLayout: value }),
    });
  }

  #layoutField() {
    return field({
      id: 'layout',
      label: 'Repository layout',
      doc: 'How the services of this product live in version control.',
      value: this.#target.layout ?? 'monorepo',
      choices: [
        { value: 'monorepo', label: 'monorepo — one repository, services as subdirectories' },
        { value: 'polyrepo', label: 'polyrepo — one repository per service' },
      ],
      onChange: (value) => this.#change({ layout: value }),
    });
  }

  #peerContextField() {
    const label = document.createElement('label');
    label.className = 'checkbox';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.id = 'withPeerContext';
    box.checked = this.#target.withPeerContext === true;
    box.addEventListener('change', () => this.#change({ withPeerContext: box.checked }));
    const text = document.createElement('span');
    text.innerHTML =
      'Scaffold a second bounded context<br />' +
      '<span class="muted">It reaches the first only through its <code>user-side/service</code> seam — the inter-context edge made demonstrable rather than merely described.</span>';
    label.append(box, text);
    return label;
  }
}

/**
 * The line under a harness that can be left out, saying which way it
 * is and what pressing it does — its state in words, beside the
 * pressed look, and the switch's description for a screen reader.
 */
function harnessHint(chip) {
  return el(
    'p',
    { id: 'agentHarness-hint', class: 'help' },
    prose(
      chip.on
        ? `${chip.title} is on. Press it to leave the agent documents, skills and hooks out — \`keel new --no-agent-harness\`.`
        : `${chip.title} is left out: no agent documents, skills or hooks. Press it to put it back, or adopt it later with \`keel add agent-harness\`.`,
    ),
  );
}

/**
 * What a step says when the chosen preset sits nowhere in the finder
 * tree — a plugin's, most likely. The narrowing has nothing to narrow,
 * and the preset picker above the rail is the way to move.
 */
const UNPLACEABLE =
  'This preset is not on the guided path — the finder could not place it. Its dials still apply, and the Preset picker above is how to move off it.';

function field({ id, label, doc, value, choices, onChange }) {
  const wrapper = document.createElement('stack-pk');
  wrapper.setAttribute('space', 'var(--s-3)');

  const caption = document.createElement('label');
  caption.setAttribute('for', id);
  caption.textContent = label;

  const select = document.createElement('select');
  select.id = id;
  for (const choice of choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    select.append(option);
  }
  select.value = value;
  select.addEventListener('change', () => onChange(select.value));

  wrapper.append(caption, select);
  if (doc !== '') {
    const help = document.createElement('p');
    help.className = 'muted';
    help.textContent = doc;
    wrapper.append(help);
  }
  return wrapper;
}

const asChoice = (option) => ({ value: option.id, label: option.label });

const docOf = (options, id) => options.find((option) => option.id === id)?.doc ?? '';

/**
 * A composite `buildSystem` travels as `path=id` pairs, since the
 * choice is per service. These two keep the page honest about that
 * rather than inventing a parallel shape the API would have to learn.
 */
function serviceBuild(raw, path) {
  if (!raw) return undefined;
  for (const entry of raw.split(',')) {
    const [name, id] = entry.split('=');
    if (name?.trim() === path) return id?.trim();
  }
  return undefined;
}

function withServiceBuild(raw, path, id) {
  const pairs = new Map();
  for (const entry of (raw ?? '').split(',')) {
    const [name, value] = entry.split('=');
    if (name?.trim() && value?.trim()) pairs.set(name.trim(), value.trim());
  }
  pairs.set(path, id);
  return [...pairs].map(([name, value]) => `${name}=${value}`).join(',');
}
