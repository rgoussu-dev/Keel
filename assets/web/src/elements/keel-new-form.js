/**
 * `<keel-new-form>` — the greenfield half: the stack and its dials.
 *
 * These controls are **not** rendered from the preview's question
 * list, and the difference matters. A stack-level dial is a field of
 * the command, so once it is set the install stops asking about it —
 * a control driven by the preview would vanish the moment it was
 * used. Everything conditional comes back from the preview instead
 * and is rendered by `<keel-question-list>`.
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
 * **Finding the stack.** Above those dials sit three facets —
 * language, user-side adapters, framework — the browser half of the
 * drill-down `keel new` asks as questions. They are the same tree
 * either way (`Catalog.finder`, walked by `../finder.js`), narrowed
 * differently: a terminal asks in sequence because it has no choice,
 * a form shows all three at once and re-filters as they move. What
 * they produce is a preset id, so `target.stack` stays the single
 * source of truth and the flat picker below them keeps working —
 * it is also the way to reach a fullstack product, which names no
 * language and so appears in no facet.
 *
 * **Two cards, and the split is the drill-down's own.** Finding a
 * preset and configuring the one you found are different questions,
 * asked in that order by the terminal wizard and run together into
 * one undifferentiated column by the first version of this form. The
 * headings are what tell a first-time reader that the second half
 * only makes sense once the first has settled.
 *
 * Catalog, dials and target in as properties, `target-changed` out
 * with the fields that moved.
 */

import { el, field, help, select, tile } from '../dom.js';
import {
  decodeSelection,
  encodeSelection,
  locate,
  pickEntrypoints,
  pickLanguage,
} from '../finder.js';

export class KeelNewForm extends HTMLElement {
  #catalog = null;
  #dials = null;
  #target = null;

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

  connectedCallback() {
    this.#render();
  }

  #change(patch) {
    this.dispatchEvent(new CustomEvent('target-changed', { bubbles: true, detail: patch }));
  }

  #stack() {
    return this.#catalog?.stacks.find((stack) => stack.id === this.#target?.stack) ?? null;
  }

  /** Where the current preset sits in the finder; null for a product. */
  #located() {
    const finder = this.#catalog?.finder;
    if (!finder || !this.#target?.stack) return null;
    return locate(finder, this.#target.stack);
  }

  #render() {
    if (!this.isConnected || !this.#catalog || !this.#target) return;
    const stack = this.#stack();
    this.replaceChildren(
      el(
        'stack-pk',
        { attrs: { space: 'var(--s0)' } },
        this.#finderCard(stack),
        stack ? this.#dialsCard(stack) : null,
      ),
    );
  }

  /* ---- card one: which preset ---------------------------------- */

  #finderCard(stack) {
    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el('h3', { text: 'Find your stack' }),
        el('span', { class: 'chip accent', text: this.#target.stack || 'nothing chosen' }),
      ),
      el(
        'div',
        { class: 'card-body' },
        el(
          'stack-pk',
          { attrs: { space: 'var(--s0)' } },
          ...this.#finderFields(),
          this.#stackField(),
          stack && stack.description !== '' ? help(stack.description) : null,
        ),
      ),
    );
  }

  /**
   * The three facets, in narrowing order. Each is dropped where it
   * has nothing to ask: a language reaching one entrypoint
   * combination, or a combination reaching one framework, has
   * answered by existing — the same rule the terminal wizard skips a
   * question under.
   */
  #finderFields() {
    const finder = this.#catalog.finder;
    if (!finder || finder.languages.length === 0) return [];
    const here = this.#located();
    const fields = [this.#languageField(finder, here)];
    if (!here) return fields;
    const step = here.language.entrypointStep;
    if (step) fields.push(this.#entrypointsField(here, step));
    if (here.combination.frameworks.length > 1) fields.push(this.#frameworkField(here));
    return fields;
  }

  #languageField(finder, here) {
    const choices = finder.languages.map((language) => ({
      value: language.id,
      label: language.label,
      doc: language.doc,
    }));
    // A product sits in no language, so the select needs something to
    // display for it — and picking a real language from there is a
    // legitimate move out of the product and into a preset.
    if (!here) choices.unshift({ value: '', label: '— a fullstack product (two services)' });
    return field({
      id: 'language',
      label: 'Language',
      doc: here?.language.doc ?? 'Pick a language to narrow to a single-project preset.',
      control: select({
        id: 'language',
        value: here?.language.id ?? '',
        choices,
        onChange: (value) => {
          const stack = value === '' ? null : pickLanguage(finder, value, here);
          if (stack) this.#change({ stack });
          else this.#render();
        },
      }),
    });
  }

  #entrypointsField(here, step) {
    const chosen = encodeSelection(here.combination.entrypoints);
    // 'select' means this language's subsets are not all presets, so
    // the combinations are spelled out and a single choice is right.
    if (step.kind !== 'multi-select') {
      return field({
        id: 'entrypoints',
        label: 'User-side adapters',
        doc: ENTRYPOINTS_DOC,
        control: select({
          id: 'entrypoints',
          value: chosen,
          choices: step.choices.map((choice) => ({
            value: choice.id,
            label: choice.label,
            doc: choice.doc,
          })),
          onChange: (value) => this.#retargetEntrypoints(here, value),
        }),
      });
    }

    // Tiles rather than a `<select multiple>`: two or three options
    // that each want a sentence of explanation are a group of
    // choices, and a multi-select hides both the explanation and the
    // fact that more than one is allowed.
    const picked = new Set(decodeSelection(chosen));
    const tiles = el(
      'div',
      { class: 'tiles' },
      ...step.choices.map((choice) =>
        tile({
          value: choice.id,
          title: choice.label,
          doc: choice.doc ?? '',
          checked: picked.has(choice.id),
          onToggle: (checked) => {
            const next = step.choices
              .map((candidate) => candidate.id)
              .filter((value) => (value === choice.id ? checked : picked.has(value)));
            this.#retargetEntrypoints(here, encodeSelection(next));
          },
        }),
      ),
    );

    return el(
      'div',
      { class: 'field' },
      el(
        'div',
        { class: 'field-label' },
        el('p', { id: 'entrypoints', class: 'tile-title', text: 'User-side adapters' }),
      ),
      tiles,
      help(ENTRYPOINTS_DOC, 'margin-block-start: var(--s-3)'),
    );
  }

  /**
   * Moves to the combination `answer` names — or snaps the control
   * back when it names none, which is how an emptied checkbox group
   * is refused rather than resolved to a preset nobody asked for.
   */
  #retargetEntrypoints(here, answer) {
    const stack = pickEntrypoints(here.language, answer, here);
    if (stack) this.#change({ stack });
    else this.#render();
  }

  #frameworkField(here) {
    return field({
      id: 'framework',
      label: 'Framework',
      doc: 'Which framework the adapters are built on.',
      control: select({
        id: 'framework',
        value: here.framework.id,
        choices: here.combination.frameworks.map((framework) => ({
          value: framework.id,
          label: framework.label,
        })),
        onChange: (value) => {
          const chosen = here.combination.frameworks.find((f) => f.id === value);
          if (chosen) this.#change({ stack: chosen.stack });
        },
      }),
    });
  }

  /**
   * The flat list of every preset, grouped so a two-service product
   * is visibly a different kind of thing from a single project —
   * which is the one distinction the facets above cannot draw,
   * because a product names no language to be filed under.
   */
  #stackField() {
    const control = select({
      id: 'stack',
      value: this.#target.stack,
      choices: [],
      onChange: (value) => this.#change({ stack: value }),
    });
    const single = this.#catalog.stacks.filter((stack) => stack.services.length === 0);
    const products = this.#catalog.stacks.filter((stack) => stack.services.length > 0);
    for (const [label, group] of [
      ['Single project', single],
      ['Fullstack products (two services)', products],
    ]) {
      if (group.length === 0) continue;
      const optgroup = el('optgroup', { attrs: { label } });
      for (const stack of group) {
        optgroup.append(
          el('option', { value: stack.id, text: stack.id, title: stack.description }),
        );
      }
      control.append(optgroup);
    }
    control.value = this.#target.stack;
    return field({ id: 'stack', label: 'Preset', control });
  }

  /* ---- card two: how it is built ------------------------------- */

  #dialsCard(stack) {
    const fields = [];
    if (stack.services.length > 0) {
      fields.push(this.#layoutField());
      for (const service of stack.services) {
        if (service.buildSystems.length > 1) {
          fields.push(this.#serviceBuildField(service, this.#serviceOptions(service)));
        }
      }
    } else {
      // The catalog says whether the control exists; the dials say
      // what may be on it.
      if (stack.buildSystems.length > 1) fields.push(this.#buildField(this.#buildSystems(stack)));
      if (stack.moduleLayouts.length > 1) {
        fields.push(this.#moduleLayoutField(this.#moduleLayouts(stack)));
      }
      if (this.#dials?.peerContext === true) fields.push(this.#peerContextField());
    }
    if (fields.length === 0) return null;
    return el(
      'section',
      { class: 'card' },
      el(
        'div',
        { class: 'card-head' },
        el('h3', { text: 'Shape' }),
        el('span', { class: 'muted', text: 'What this preset lets you change' }),
      ),
      el(
        'div',
        { class: 'card-body' },
        el('stack-pk', { attrs: { space: 'var(--s0)' } }, ...fields),
      ),
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
    const value = this.#target.buildSystem ?? options[0].id;
    return field({
      id: 'buildSystem',
      label: 'Build system',
      doc: docOf(options, value),
      control: select({
        id: 'buildSystem',
        value,
        choices: options.map(asChoice),
        onChange: (chosen) => this.#change({ buildSystem: chosen }),
      }),
    });
  }

  #serviceBuildField(service, options) {
    const chosen = serviceBuild(this.#target.buildSystem, service.path) ?? options[0].id;
    return field({
      id: `buildSystem-${service.path}`,
      label: `Build system — ${service.path}`,
      tag: service.stack,
      doc: docOf(options, chosen),
      control: select({
        id: `buildSystem-${service.path}`,
        value: chosen,
        choices: options.map(asChoice),
        onChange: (value) =>
          this.#change({
            buildSystem: withServiceBuild(this.#target.buildSystem, service.path, value),
          }),
      }),
    });
  }

  #moduleLayoutField(options) {
    const value = this.#target.moduleLayout ?? options[0].id;
    return field({
      id: 'moduleLayout',
      label: 'Module layout',
      doc: docOf(options, value),
      control: select({
        id: 'moduleLayout',
        value,
        choices: options.map(asChoice),
        onChange: (chosen) => this.#change({ moduleLayout: chosen }),
      }),
    });
  }

  #layoutField() {
    return field({
      id: 'layout',
      label: 'Repository layout',
      doc: 'How the services of this product live in version control.',
      control: select({
        id: 'layout',
        value: this.#target.layout ?? 'monorepo',
        choices: [
          { value: 'monorepo', label: 'monorepo — one repository, services as subdirectories' },
          { value: 'polyrepo', label: 'polyrepo — one repository per service' },
        ],
        onChange: (value) => this.#change({ layout: value }),
      }),
    });
  }

  #peerContextField() {
    return el(
      'div',
      { class: 'tiles' },
      tile({
        value: 'peer-context',
        title: 'Scaffold a second bounded context',
        doc:
          'It reaches the first only through its user-side/service seam — the inter-context ' +
          'edge made demonstrable rather than merely described.',
        checked: this.#target.withPeerContext === true,
        onToggle: (checked) => this.#change({ withPeerContext: checked }),
      }),
    );
  }
}

const ENTRYPOINTS_DOC =
  'How the outside world drives the hexagon. Picking more than one gives the composed preset — one project, one domain, both entrypoints — not two services.';

const asChoice = (option) => ({ value: option.id, label: option.label, doc: option.doc });

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
