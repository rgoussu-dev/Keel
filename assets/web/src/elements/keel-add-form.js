/**
 * `<keel-add-form>` — the brownfield half: layer verticals onto this
 * project, re-render one it has, or add a bounded context to it.
 *
 * What it offers is decided by `/api/project`, not guessed, and every
 * answer there is the one the command's own front door gives — read
 * before the click rather than met after it. The page used to offer
 * every vertical not installed as one radio group, and let the pick
 * find out whether the project could carry it: about half the cards
 * on a CLI project were a refusal, shown in a banner away from the
 * card. Now each card sits in the part the planner read it into
 * (`../additions.js`):
 *
 *   - **Ready**, **Needs another capability first** — checkboxes, and
 *     several at a time: one plan, one Generate. A "needs" card's
 *     badge names what it needs by title, and ticking it ticks them.
 *   - **Not for this project** — collapsed, one sentence each, the
 *     refusal `keel add` would give. Not a control: there is nothing
 *     to pick.
 *   - **Belongs in a service** — at a product root, what goes one
 *     directory down, and the sentence naming where.
 *   - **Installed** — a **Re-render** button each, a run of its own,
 *     never a card in the add's set; a product's glue or a bounded
 *     context, which no `keel add` names, as a chip.
 *
 * Re-renders an add proposes — an installed vertical the run changes
 * and would leave as it was — appear under the cards as toggles, once
 * the preview has said so.
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
 * the top (`../project.js`), rather than on every card it refuses.
 *
 * Status, target and preview in as properties. Out: `target-changed`
 * with a **whole** target for the tabs and the context form — a patch
 * merged into the old target is how a re-render flag used to outlive
 * the card that set it — and, for the gestures, which vertical moved
 * and how: `vertical-toggled`, `rerender-requested`, `refresh-toggled`.
 * What else a gesture moves is `../target.js`'s answer.
 */

import { checkboxCards, el, focusIn, note, refocus, refusedList } from '../dom.js';
import { additionsGroup, refreshChoices } from '../additions.js';
import { harnessNotice } from '../project.js';

export class KeelAddForm extends HTMLElement {
  #status = null;
  #target = null;
  #preview = null;
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
    // Once, above everything it stops: a project from another harness
    // generation refuses every card but the harness's own. A status,
    // not an alert: the form is rebuilt on every pick, and an alert
    // would interrupt each one to repeat a fact that has not changed.
    const stale = harnessNotice(this.#status);
    if (stale !== null) {
      form.append(
        el('p', {
          class: 'error',
          text: stale,
          attrs: { role: 'status', 'data-role': 'harness-generation' },
        }),
      );
    }
    form.append(...this.#kindField());
    form.append(this.#target.kind === 'add-module' ? this.#moduleFields() : this.#verticalFields());
    this.replaceChildren(form);
    refocus(this, focused);
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
      this.#tab('tab-vertical', 'Add a vertical', adding, () =>
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
      el('p', {
        id: 'module-refusal',
        class: 'muted',
        text: refusal.message,
        attrs: { 'data-role': 'module-refusal' },
      }),
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

  #verticalFields() {
    const group = additionsGroup(this.#status, this.#target);
    const nothing =
      group.ready.length + group.needs.length + group.refused.length + group.elsewhere.length ===
        0 && group.rerenderable.length + group.chips.length === 0;
    if (nothing) return note('Nothing left to install here.');

    const part = (id, title, choices) => {
      const heading = el('h4', { id: `${id}-title`, text: title });
      const cards = checkboxCards({
        id,
        chosen: group.chosen,
        choices,
        onChange: (values) => {
          const now = new Set(values);
          const moved = choices.find(
            (choice) => now.has(choice.value) !== group.chosen.includes(choice.value),
          );
          if (moved) {
            this.#emit('vertical-toggled', { id: moved.value, ticked: now.has(moved.value) });
          }
        },
      });
      cards.setAttribute('role', 'group');
      cards.setAttribute('aria-labelledby', heading.id);
      return el('div', {}, heading, cards);
    };

    const refresh = refreshChoices(this.#preview, this.#target, this.#status);
    const refreshed = new Set(this.#target.refresh ?? []);
    const refreshPart =
      refresh.length === 0
        ? null
        : (() => {
            const heading = el('h4', { id: 'add-refresh-title', text: 'Proposed re-renders' });
            const cards = checkboxCards({
              id: 'add-refresh',
              chosen: [...refreshed],
              choices: refresh,
              onChange: (values) => {
                const now = new Set(values);
                const moved = refresh.find(
                  (choice) => now.has(choice.value) !== refreshed.has(choice.value),
                );
                if (moved) {
                  this.#emit('refresh-toggled', { id: moved.value, ticked: now.has(moved.value) });
                }
              },
            });
            cards.setAttribute('role', 'group');
            cards.setAttribute('aria-labelledby', heading.id);
            return el('div', { attrs: { 'data-role': 'refresh' } }, heading, cards);
          })();

    return el(
      'section',
      { id: 'additions', class: 'picks', attrs: { 'aria-label': 'Verticals to add' } },
      group.ready.length === 0 ? null : part('add-ready', 'Ready', group.ready),
      group.needs.length === 0
        ? null
        : part('add-needs', 'Needs another capability first', group.needs),
      refreshPart,
      group.refused.length === 0
        ? null
        : refusedList({
            id: 'add-refused',
            title: 'Not for this project',
            items: group.refused,
            open: this.#refusedOpen,
            onToggle: (open) => (this.#refusedOpen = open),
          }),
      this.#elsewhereField(group.elsewhere),
      this.#installedField(group),
      group.rerendering === null
        ? null
        : note(
            'Already installed, so this is a re-render from the answers the manifest recorded. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.',
          ),
    );
  }

  /**
   * At a product root, what belongs in one of its services — each
   * with the sentence naming which. Open, not collapsed: unlike "not
   * for this project" it is a direction, one directory down.
   */
  #elsewhereField(elsewhere) {
    if (elsewhere.length === 0) return null;
    return el(
      'div',
      { id: 'add-elsewhere' },
      el('h4', { id: 'add-elsewhere-title', text: 'Belongs in a service' }),
      el(
        'ul',
        { class: 'plain refused-list', attrs: { 'aria-labelledby': 'add-elsewhere-title' } },
        ...elsewhere.map((item) =>
          el(
            'li',
            { attrs: { 'data-id': item.id } },
            el('span', { class: 'refused-title', text: item.title }),
            el('span', { class: 'muted', text: item.sentence }),
          ),
        ),
      ),
    );
  }

  /**
   * What the project has: a row per vertical `keel add --reapply`
   * re-renders, its **Re-render** a toggle for that run alone, and a
   * chip per recorded piece no `keel add` names.
   */
  #installedField(group) {
    if (group.rerenderable.length + group.chips.length === 0) return null;
    return el(
      'div',
      { id: 'add-installed' },
      el('h4', { id: 'add-installed-title', text: 'Installed' }),
      group.rerenderable.length === 0
        ? null
        : el(
            'ul',
            { class: 'plain installed-list', attrs: { 'aria-labelledby': 'add-installed-title' } },
            ...group.rerenderable.map((vertical) =>
              el(
                'li',
                {
                  class: vertical.pressed ? 'installed chosen' : 'installed',
                  attrs: { 'data-id': vertical.id },
                },
                el(
                  'span',
                  { class: 'card-body' },
                  el('span', { class: 'card-title', text: vertical.title }),
                  el('span', { class: 'muted mono', text: vertical.meta }),
                ),
                el('button', {
                  id: `rerender-${vertical.id}`,
                  type: 'button',
                  class: vertical.pressed ? 'primary' : 'ghost',
                  text: 'Re-render',
                  title: vertical.doc,
                  attrs: {
                    'aria-pressed': String(vertical.pressed),
                    'aria-label': `Re-render ${vertical.title}`,
                  },
                  on: { click: () => this.#emit('rerender-requested', { id: vertical.id }) },
                }),
              ),
            ),
          ),
      group.chips.length === 0
        ? null
        : el(
            'ul',
            { id: 'add-installed-chips', class: 'plain chips' },
            ...group.chips.map((chip) =>
              el('li', { class: 'chip', text: chip.title, attrs: { 'data-id': chip.id } }),
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
