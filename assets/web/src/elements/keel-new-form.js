/**
 * `<keel-new-form>` — the greenfield half: the stack and its dials.
 *
 * These controls are rendered from the **catalog**, not from the
 * preview's question list, and the difference matters. A stack-level
 * dial is a field of the command, so once it is set the install stops
 * asking about it — a control driven by the preview would vanish the
 * moment it was used. The catalog describes them statically, which is
 * exactly what they are: `quarkus-rest` offers Gradle or Maven
 * whatever else you pick. Everything conditional comes back from the
 * preview and is rendered by `<keel-question-list>`.
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
 * Catalog + target in as properties, `target-changed` out with the
 * fields that moved.
 */

import {
  decodeSelection,
  encodeSelection,
  locate,
  pickEntrypoints,
  pickLanguage,
} from '../finder.js';

export class KeelNewForm extends HTMLElement {
  #catalog = null;
  #target = null;

  /** @param {object} value the `/api/catalog` payload */
  set catalog(value) {
    this.#catalog = value;
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
    const form = document.createElement('stack-pk');
    form.setAttribute('space', 'var(--s0)');
    form.append(...this.#finderFields());
    form.append(this.#stackField());
    if (!stack) {
      this.replaceChildren(form);
      return;
    }
    if (stack.description !== '') {
      const doc = document.createElement('p');
      doc.className = 'muted';
      doc.textContent = stack.description;
      form.append(doc);
    }
    if (stack.services.length > 0) {
      form.append(this.#layoutField());
      for (const service of stack.services) {
        if (service.buildSystems.length > 1) form.append(this.#serviceBuildField(service));
      }
    } else {
      if (stack.buildSystems.length > 1) form.append(this.#buildField(stack));
      if (stack.moduleLayouts.length > 1) form.append(this.#moduleLayoutField(stack));
      if (stack.peerContext && this.#target.moduleLayout === 'modulith') {
        form.append(this.#peerContextField());
      }
    }
    this.replaceChildren(form);
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
    }));
    // A product sits in no language, so the select needs something to
    // display for it — and picking a real language from there is a
    // legitimate move out of the product and into a preset.
    if (!here) choices.unshift({ value: '', label: '— a fullstack product (two services)' });
    return field({
      id: 'language',
      label: 'Language',
      doc: here?.language.doc ?? 'Pick a language to narrow to a single-project preset.',
      value: here?.language.id ?? '',
      choices,
      onChange: (value) => {
        const stack = value === '' ? null : pickLanguage(finder, value, here);
        if (stack) this.#change({ stack });
        else this.#render();
      },
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
        value: chosen,
        choices: step.choices.map((choice) => ({ value: choice.id, label: choice.label })),
        onChange: (value) => this.#retargetEntrypoints(here, value),
      });
    }
    return checkboxes({
      id: 'entrypoints',
      label: 'User-side adapters',
      doc: ENTRYPOINTS_DOC,
      chosen: decodeSelection(chosen),
      choices: step.choices,
      onChange: (values) => this.#retargetEntrypoints(here, encodeSelection(values)),
    });
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
      value: here.framework.id,
      choices: here.combination.frameworks.map((framework) => ({
        value: framework.id,
        label: framework.label,
      })),
      onChange: (value) => {
        const chosen = here.combination.frameworks.find((f) => f.id === value);
        if (chosen) this.#change({ stack: chosen.stack });
      },
    });
  }

  #stackField() {
    return field({
      id: 'stack',
      label: 'Stack',
      doc: '',
      value: this.#target.stack,
      choices: this.#catalog.stacks.map((stack) => ({ value: stack.id, label: stack.id })),
      onChange: (value) => this.#change({ stack: value }),
    });
  }

  #buildField(stack) {
    return field({
      id: 'buildSystem',
      label: 'Build system',
      doc: docOf(stack.buildSystems, this.#target.buildSystem),
      value: this.#target.buildSystem ?? stack.buildSystems[0].id,
      choices: stack.buildSystems.map(asChoice),
      onChange: (value) => this.#change({ buildSystem: value }),
    });
  }

  #serviceBuildField(service) {
    const chosen =
      serviceBuild(this.#target.buildSystem, service.path) ?? service.buildSystems[0].id;
    return field({
      id: `buildSystem-${service.path}`,
      label: `Build system — ${service.path} (${service.stack})`,
      doc: docOf(service.buildSystems, chosen),
      value: chosen,
      choices: service.buildSystems.map(asChoice),
      onChange: (value) =>
        this.#change({
          buildSystem: withServiceBuild(this.#target.buildSystem, service.path, value),
        }),
    });
  }

  #moduleLayoutField(stack) {
    return field({
      id: 'moduleLayout',
      label: 'Module layout',
      doc: docOf(stack.moduleLayouts, this.#target.moduleLayout),
      value: this.#target.moduleLayout ?? stack.moduleLayouts[0].id,
      choices: stack.moduleLayouts.map(asChoice),
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

const ENTRYPOINTS_DOC =
  'How the outside world drives the hexagon. Picking more than one gives the composed preset — one project, one domain, both entrypoints — not two services.';

/**
 * A checkbox group, for the entrypoint facet where every subset is a
 * preset. A `<select multiple>` would do the same job and read worse
 * at two or three options, which is all this ever has.
 */
function checkboxes({ id, label, doc, chosen, choices, onChange }) {
  const wrapper = document.createElement('stack-pk');
  wrapper.setAttribute('space', 'var(--s-3)');

  const caption = document.createElement('p');
  caption.id = id;
  caption.textContent = label;
  wrapper.append(caption);

  const picked = new Set(chosen);
  for (const choice of choices) {
    const line = document.createElement('label');
    line.className = 'checkbox';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = choice.id;
    box.checked = picked.has(choice.id);
    box.title = choice.doc;
    box.addEventListener('change', () => {
      const next = choices
        .map((candidate) => candidate.id)
        .filter((value) => (value === choice.id ? box.checked : picked.has(value)));
      onChange(next);
    });
    const text = document.createElement('span');
    text.textContent = choice.label;
    line.append(box, text);
    wrapper.append(line);
  }

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
