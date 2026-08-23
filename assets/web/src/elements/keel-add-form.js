/**
 * `<keel-add-form>` — the brownfield half: layer a vertical onto this
 * project, or add a bounded context to it.
 *
 * What it offers is decided by `/api/project`, not guessed. An
 * installed vertical is offered for `--reapply` and not for a second
 * install; `keel add module` appears only where the project status
 * says it would be accepted — the modulith layout, not a product
 * root, and a family whose adapters really emit a context. Every one
 * of those is a refusal the handler would issue anyway; reading them
 * up front turns an error message into a control that is simply not
 * there.
 *
 * **The two commands are a segmented switch, not two buttons.**
 * `keel add <vertical>` and `keel add module <name>` are alternatives,
 * and a pair of buttons where the active one merely turns teal says
 * "actions" where the truth is "modes".
 *
 * **A vertical's description belongs under the control.** Folding it
 * into the option label — `ci — the pipeline…` — made the menu a wall
 * of sentences and left the chosen one's description visible only
 * while the menu was open, which is the one moment you cannot read it
 * against anything else.
 *
 * Status + target in as properties, `target-changed` out.
 */

import { el, field, help, select } from '../dom.js';

export class KeelAddForm extends HTMLElement {
  #status = null;
  #target = null;

  /** @param {object} value the `/api/project` payload */
  set status(value) {
    this.#status = value;
    this.#render();
  }

  /** @param {object} value the current add-vertical / add-module target */
  set target(value) {
    this.#target = value;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #change(target) {
    this.dispatchEvent(new CustomEvent('target-changed', { bubbles: true, detail: target }));
  }

  #render() {
    if (!this.isConnected || !this.#status || !this.#target) return;
    const module = this.#target.kind === 'add-module';
    this.replaceChildren(
      el(
        'stack-pk',
        { attrs: { space: 'var(--s0)' } },
        this.#kindSwitch(),
        el(
          'section',
          { class: 'card' },
          el('div', { class: 'card-body' }, module ? this.#moduleFields() : this.#verticalFields()),
        ),
      ),
    );
  }

  /**
   * The two commands, where there are two.
   *
   * `keel add module` is refused outside the modulith layout, so on
   * most projects there is one mode — and a switch with one position
   * is a control that asks a question with no second answer.
   */
  #kindSwitch() {
    if (!this.#status.canAddModule) return null;
    return el(
      'div',
      { class: 'segmented', attrs: { role: 'group', 'aria-label': 'What to add' } },
      this.#tab('Add a vertical', this.#target.kind === 'add-vertical', () =>
        this.#change({ kind: 'add-vertical', vertical: this.#firstAvailable() }),
      ),
      this.#tab('Add a bounded context', this.#target.kind === 'add-module', () =>
        this.#change({ kind: 'add-module', module: '' }),
      ),
    );
  }

  #tab(label, active, onClick) {
    return el('button', {
      type: 'button',
      text: label,
      attrs: { 'aria-pressed': String(active) },
      on: { click: onClick },
    });
  }

  #verticalFields() {
    const available = this.#status.available;
    const installed = this.#status.installed;
    if (available.length === 0 && installed.length === 0) {
      return help('Nothing left to install here.');
    }

    const chosen = this.#target.vertical ?? available[0]?.id ?? installed[0]?.id ?? '';
    const control = select({
      id: 'vertical',
      value: chosen,
      choices: [],
      onChange: (value) =>
        this.#change({
          kind: 'add-vertical',
          vertical: value,
          ...(this.#isInstalled(value) ? { reapply: true } : {}),
        }),
    });
    for (const [label, group, suffix] of [
      ['Not installed yet', available, ''],
      ['Already installed', installed, ' (re-render)'],
    ]) {
      if (group.length === 0) continue;
      const optgroup = el('optgroup', { attrs: { label } });
      for (const vertical of group) {
        optgroup.append(
          el('option', {
            value: vertical.id,
            text: `${vertical.id}${suffix}`,
            title: vertical.description,
          }),
        );
      }
      control.append(optgroup);
    }
    control.value = chosen;

    const description = [...available, ...installed].find(
      (vertical) => vertical.id === chosen,
    )?.description;

    return el(
      'stack-pk',
      { attrs: { space: 'var(--s-1)' } },
      field({ id: 'vertical', label: 'Vertical', control, doc: description ?? '' }),
      this.#target.reapply === true
        ? el(
            'div',
            { class: 'banner' },
            el(
              'span',
              {},
              el('span', { class: 'banner-title', text: 'Re-render, not a second install' }),
              help(
                'The answers the manifest recorded are replayed. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.',
              ),
            ),
          )
        : null,
    );
  }

  #moduleFields() {
    const taken = this.#status.modules.map((module) => module.name);
    const name = el('input', {
      type: 'text',
      id: 'module',
      value: this.#target.module ?? '',
      placeholder: 'billing',
      attrs: { spellcheck: 'false', autocomplete: 'off' },
      on: {
        change: () => this.#change({ ...this.#target, module: name.value.trim() }),
      },
    });

    const fields = [
      field({
        id: 'module',
        label: 'Context name',
        control: name,
        doc: `One word — it becomes a directory and an identifier in every language the stack spells.${
          taken.length > 0 ? ` Already taken: ${taken.join(', ')}.` : ''
        }`,
      }),
    ];

    const consumable = this.#status.modules.filter((module) => module.seam);
    if (consumable.length > 0) {
      fields.push(
        field({
          id: 'consumes',
          label: 'Consumes',
          doc: 'Emits a gateway reaching that context through its user-side/service seam. Only contexts publishing one are listed.',
          control: select({
            id: 'consumes',
            value: this.#target.consumes ?? '',
            choices: [
              { value: '', label: 'nothing — a standalone context' },
              ...consumable.map((module) => ({ value: module.name, label: module.name })),
            ],
            onChange: (value) =>
              this.#change({
                kind: 'add-module',
                module: this.#target.module ?? '',
                ...(value === '' ? {} : { consumes: value }),
              }),
          }),
        }),
      );
    }
    return el('stack-pk', { attrs: { space: 'var(--s0)' } }, ...fields);
  }

  #firstAvailable() {
    return this.#status.available[0]?.id ?? this.#status.installed[0]?.id ?? '';
  }

  #isInstalled(id) {
    return this.#status.installed.some((vertical) => vertical.id === id);
  }
}
