/**
 * `<keel-add-form>` — a keel project's middle steps, one at a time:
 * **Project**, what it already is, and **Options**, what goes on top of
 * it — or a bounded context.
 *
 * The page used to have a step of its own here, "What to add", beside
 * a new project's Options: two controls asking one question — what
 * else goes in? — one per phase. The directory now decides which flow
 * the rail is (`../steps.js`). On a keel project the preset steps
 * collapse into **Project**: its settled choices, read back from its
 * manifest in words (`../project.js`), and nothing to change. Then
 * **Options** draws the very "Also scaffold" group a new project's
 * Options step draws its extras in (`../dom.js`'s `alsoScaffold`), in
 * the parts `../additions.js` reads off the project status — each
 * answer there the one the command's own front door gives, read before
 * the click rather than met after it:
 *
 *   - **Ready**, **Needs another capability first** — checkboxes, and
 *     several at a time: one plan, one Generate, `keel add` of what the
 *     ticks add and nothing else. A "needs" card's badge names what it
 *     needs by title, and ticking it ticks them.
 *   - **Proposed re-renders** — an installed vertical the run changes
 *     and would leave as it was, as a toggle, once the preview has said
 *     so.
 *   - **Installed** — what the project has, ticked and locked, where a
 *     new project's group lists what its preset comes with: a
 *     **Re-render** beside each vertical `keel add --reapply` names, a
 *     run of its own, never a box in the add's set; a product's glue or
 *     a bounded context, which no `keel add` names, without one; what a
 *     monorepo service has from its product, saying where from.
 *   - **Not for this project** — collapsed, one sentence each, the
 *     refusal `keel add` would give. Not a control: there is nothing to
 *     pick.
 *   - **Belongs in a service** — at a product root, an **Open
 *     backend/** button per service, which points the page there
 *     (`service-opened`), then what goes one directory down and the
 *     sentence naming where.
 *
 * **A card per capability, not a line in a `<select>`.** Which
 * vertical to add next is the one real question this half of the page
 * asks, and an id in a dropdown is a poor way to ask it: `iac` and
 * `dev-env` mean nothing until you have read what they buy you. Each
 * card names the concept it bears, the id `keel add <id>` takes, and
 * one line on what installing it gets you — all three from the
 * catalog, so a plugin's vertical reads the same way keel's own do.
 *
 * `keel add module`'s tab is always there, and disabled with its
 * reason where the project status says the command would refuse —
 * the flat layout, a product root — rather than missing, which said
 * nothing about why.
 *
 * A project written by another harness generation says so once, at
 * the top of Options (`../project.js`), rather than on every card it
 * refuses.
 *
 * Status, target, preview and step in as properties. Out:
 * `target-changed` with a **whole** target for the tabs and the context
 * form — a patch merged into the old target is how a re-render flag
 * used to outlive the card that set it — and, for the gestures, which
 * vertical moved and how: `vertical-toggled`, `rerender-requested`,
 * `refresh-toggled`; and `service-opened` with the directory of the
 * service to open. What else a gesture moves is `../target.js`'s
 * answer.
 */

import {
  alsoScaffold,
  el,
  focusIn,
  lockedPart,
  note,
  refocus,
  refusedList,
  sentence,
  tickPart,
} from '../dom.js';
import { additionsGroup, refreshChoices } from '../additions.js';
import { harnessNotice, projectSummary } from '../project.js';
import { OPTIONS, PROJECT } from '../steps.js';

export class KeelAddForm extends HTMLElement {
  #status = null;
  #target = null;
  #preview = null;
  #step = OPTIONS;
  /** Whether "Not for this project" is open — the reader's, kept across redraws. */
  #refusedOpen = false;

  /** @param {object} value the `/api/project` payload */
  set status(value) {
    if (value === this.#status) return;
    this.#status = value;
    this.#render();
  }

  /** @param {object} value the current add-vertical / add-module target */
  set target(value) {
    if (value === this.#target) return;
    this.#target = value;
    this.#render();
  }

  /** @param {object|null} value the last preview, for the re-renders it proposes */
  set preview(value) {
    if (value === this.#preview) return;
    this.#preview = value;
    this.#render();
  }

  /** @param {string} value which step to render — `project` or `options`; see `../steps.js` */
  set step(value) {
    if (value === this.#step) return;
    this.#step = value;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }

  #render() {
    if (!this.isConnected || !this.#status || !this.#target) return;
    const focused = focusIn(this);
    const form = el('stack-pk', { attrs: { space: 'var(--s0)' } });
    form.append(...(this.#step === PROJECT ? this.#projectFields() : this.#optionFields()));
    this.replaceChildren(form);
    refocus(this, focused);
  }

  /**
   * What the project already is — where a new project's preset steps
   * ask it — as a summary with nothing on it to change: the preset it
   * reads as and the choices that made it, its services and contexts,
   * then what it has installed.
   */
  #projectFields() {
    const summary = projectSummary(this.#status);
    return [
      el(
        'dl',
        { id: 'project-profile', class: 'summary' },
        ...summary.rows.flatMap((row) => [
          el('dt', { text: row.label }),
          el('dd', {}, el('span', { class: 'mono', text: row.value })),
        ]),
      ),
      el(
        'div',
        { class: 'project-installed' },
        el('h4', { id: 'project-installed-title', text: 'Installed' }),
        el(
          'ul',
          {
            id: 'project-installed',
            class: 'plain chips',
            attrs: { 'aria-labelledby': 'project-installed-title' },
          },
          ...summary.installed.map((vertical) =>
            el('li', { class: 'chip', text: vertical.title, attrs: { 'data-id': vertical.id } }),
          ),
        ),
      ),
    ];
  }

  /** What goes on top, or a bounded context: the tabs, then the one the target is on. */
  #optionFields() {
    const fields = [];
    // Once, above everything it stops: a project from another harness
    // generation refuses every card but the harness's own. A status,
    // not an alert: the form is rebuilt on every pick, and an alert
    // would interrupt each one to repeat a fact that has not changed.
    const stale = harnessNotice(this.#status);
    if (stale !== null) {
      fields.push(
        el('p', {
          class: 'error',
          text: stale,
          attrs: { role: 'status', 'data-role': 'harness-generation' },
        }),
      );
    }
    fields.push(...this.#kindField());
    fields.push(this.#target.kind === 'add-module' ? this.#moduleFields() : this.#verticalFields());
    return fields;
  }

  /**
   * The two tabs, and — where `keel add module` would be refused before
   * it reads a name — the reason, under a tab drawn disabled. A tab
   * already open does nothing: re-opening it would start its form over.
   */
  #kindField() {
    const adding = this.#target.kind !== 'add-module';
    const refusal = this.#status.canAddModule ? null : this.#status.moduleRefusal;
    const row = el(
      'cluster-pk',
      { attrs: { space: 'var(--s-2)', role: 'group', 'aria-label': 'What to add' } },
      this.#tab('tab-vertical', 'Add verticals', adding, () =>
        this.#emit('target-changed', { kind: 'add-vertical', verticals: [] }),
      ),
      this.#tab('tab-module', 'Add a bounded context', !adding, () =>
        this.#emit('target-changed', { kind: 'add-module', module: '' }),
      ),
    );
    const module = row.querySelector('#tab-module');
    if (!refusal || !(module instanceof HTMLButtonElement)) return [row];
    module.disabled = true;
    module.setAttribute('aria-describedby', 'module-refusal');
    return [
      row,
      el(
        'p',
        { id: 'module-refusal', class: 'muted', attrs: { 'data-role': 'module-refusal' } },
        sentence(refusal.message),
      ),
    ];
  }

  #tab(id, label, active, onClick) {
    return el('button', {
      id,
      type: 'button',
      text: label,
      class: active ? 'primary' : '',
      attrs: { 'aria-pressed': String(active) },
      on: {
        click: () => {
          if (!active) onClick();
        },
      },
    });
  }

  /**
   * The "Also scaffold" group, on what this project has: the boxes that
   * tick, the re-renders the preview proposes, what is installed —
   * ticked and locked, each vertical with its **Re-render** — what the
   * project cannot take, and at a product root what belongs in a
   * service.
   */
  #verticalFields() {
    const group = additionsGroup(this.#status, this.#target);
    const nothing =
      group.ready.length +
        group.needs.length +
        group.refused.length +
        group.elsewhere.length +
        group.services.length +
        group.installed.length ===
      0;
    if (nothing) return note('Nothing left to install here.');

    const tick = (id, ticked) => this.#emit('vertical-toggled', { id, ticked });
    const refresh = refreshChoices(this.#preview, this.#target, this.#status);
    return alsoScaffold({
      id: 'extras',
      title: 'Also scaffold',
      count: group.chosen.length,
      help: 'Installed in one run, on top of what this project has — `keel add` with each id ticked, and nothing else. A box that needs others ticks them too; what the project has is ticked for good, and a vertical of it is re-rendered from its own button.',
      parts: [
        group.ready.length === 0
          ? null
          : tickPart({
              id: 'extras-ready',
              title: 'Ready',
              choices: group.ready,
              chosen: group.chosen,
              onTick: tick,
            }),
        group.needs.length === 0
          ? null
          : tickPart({
              id: 'extras-needs',
              title: 'Needs another capability first',
              choices: group.needs,
              chosen: group.chosen,
              onTick: tick,
            }),
        refresh.length === 0
          ? null
          : tickPart({
              id: 'extras-refresh',
              title: 'Proposed re-renders',
              choices: refresh,
              chosen: this.#target.refresh ?? [],
              onTick: (id, ticked) => this.#emit('refresh-toggled', { id, ticked }),
              role: 'refresh',
            }),
        group.installed.length === 0
          ? null
          : lockedPart({
              id: 'extras-installed',
              title: 'Installed',
              items: group.installed.map((vertical) => ({
                ...vertical,
                chosen: vertical.pressed,
                action: vertical.rerender ? this.#rerenderButton(vertical) : null,
              })),
            }),
        group.refused.length === 0
          ? null
          : refusedList({
              id: 'extras-refused',
              title: 'Not for this project',
              items: group.refused,
              open: this.#refusedOpen,
              onToggle: (open) => (this.#refusedOpen = open),
            }),
        this.#elsewhereField(group.services, group.elsewhere),
        group.rerendering === null
          ? null
          : note(
              'Already installed, so this is a re-render from the answers the manifest recorded. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.',
            ),
      ],
    });
  }

  /**
   * An installed vertical's **Re-render**: `keel add <id> --reapply`,
   * a run of its own, pressed while it is the run.
   */
  #rerenderButton(vertical) {
    return el('button', {
      id: `rerender-${vertical.value}`,
      type: 'button',
      class: vertical.pressed ? 'primary' : 'ghost',
      text: 'Re-render',
      attrs: {
        'aria-pressed': String(vertical.pressed),
        'aria-label': `Re-render ${vertical.label}`,
      },
      on: { click: () => this.#emit('rerender-requested', { id: vertical.value }) },
    });
  }

  /**
   * At a product root, a way into each service, then what belongs in
   * one of them — each with the sentence naming which. Open, not
   * collapsed: unlike "not for this project" it is a direction, one
   * directory down, and the buttons take it.
   */
  #elsewhereField(services, elsewhere) {
    if (services.length + elsewhere.length === 0) return null;
    return el(
      'div',
      { id: 'extras-elsewhere' },
      el('h4', { id: 'extras-elsewhere-title', text: 'Belongs in a service' }),
      services.length === 0
        ? null
        : el(
            'cluster-pk',
            {
              id: 'extras-services',
              attrs: { space: 'var(--s-2)', role: 'group', 'aria-label': 'Open a service' },
            },
            ...services.map((service) =>
              el('button', {
                type: 'button',
                class: 'ghost',
                text: service.label,
                attrs: { 'data-path': service.path },
                on: { click: () => this.#emit('service-opened', { path: service.path }) },
              }),
            ),
          ),
      elsewhere.length === 0
        ? null
        : el(
            'ul',
            {
              class: 'plain refused-list',
              attrs: { 'aria-labelledby': 'extras-elsewhere-title' },
            },
            ...elsewhere.map((item) =>
              el(
                'li',
                { attrs: { 'data-id': item.id } },
                el('span', { class: 'refused-title', text: item.title }),
                el('span', { class: 'muted' }, sentence(item.sentence)),
              ),
            ),
          ),
    );
  }

  #moduleFields() {
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');

    const name = document.createElement('input');
    name.type = 'text';
    name.id = 'module';
    name.value = this.#target.module ?? '';
    name.placeholder = 'billing';
    name.addEventListener('change', () =>
      this.#emit('target-changed', { ...this.#target, module: name.value.trim() }),
    );

    const label = document.createElement('label');
    label.setAttribute('for', 'module');
    label.textContent = 'Context name';
    const doc = document.createElement('p');
    doc.className = 'muted';
    doc.textContent = `One word — it becomes a directory and an identifier in every language the stack spells. Taken: ${
      this.#status.modules.map((module) => module.name).join(', ') || 'none'
    }.`;
    stack.append(label, name, doc);

    const consumable = this.#status.modules.filter((module) => module.seam);
    if (consumable.length > 0) {
      const select = document.createElement('select');
      select.id = 'consumes';
      select.append(option('', 'nothing — a standalone context'));
      for (const module of consumable) select.append(option(module.name, module.name));
      select.value = this.#target.consumes ?? '';
      select.addEventListener('change', () =>
        this.#emit('target-changed', {
          kind: 'add-module',
          module: this.#target.module ?? '',
          ...(select.value === '' ? {} : { consumes: select.value }),
        }),
      );
      const consumesLabel = document.createElement('label');
      consumesLabel.setAttribute('for', 'consumes');
      consumesLabel.textContent = 'Consumes';
      const consumesDoc = document.createElement('p');
      consumesDoc.className = 'muted';
      consumesDoc.textContent =
        'Emits a gateway reaching that context through its user-side/service seam. Only contexts publishing one are listed.';
      stack.append(consumesLabel, select, consumesDoc);
    }
    return stack;
  }
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}
