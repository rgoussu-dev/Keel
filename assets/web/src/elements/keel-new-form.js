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
 * Catalog + target in as properties, `target-changed` out with the
 * fields that moved.
 */

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

  #render() {
    if (!this.isConnected || !this.#catalog || !this.#target) return;
    const stack = this.#stack();
    const form = document.createElement('stack-pk');
    form.setAttribute('space', 'var(--s0)');
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
