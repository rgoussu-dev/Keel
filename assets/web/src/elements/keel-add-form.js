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
 * **A card per capability, not a line in a `<select>`.** Which
 * vertical to add next is the one real question this half of the page
 * asks, and an id in a dropdown is a poor way to ask it: `iac` and
 * `dev-env` mean nothing until you have read what they buy you. Each
 * card names the concept it bears, the id `keel add <id>` takes, and
 * one line on what installing it gets you — all three from the
 * catalog, so a plugin's vertical reads the same way keel's own do.
 *
 * Status + target in as properties, `target-changed` out.
 */

import { cards } from '../dom.js';

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
    const form = document.createElement('stack-pk');
    form.setAttribute('space', 'var(--s0)');
    form.append(this.#kindField());
    form.append(this.#target.kind === 'add-module' ? this.#moduleFields() : this.#verticalFields());
    this.replaceChildren(form);
  }

  #kindField() {
    const row = document.createElement('cluster-pk');
    row.setAttribute('space', 'var(--s-2)');
    row.append(
      this.#tab('Add a vertical', this.#target.kind === 'add-vertical', () =>
        this.#change({ kind: 'add-vertical', vertical: '' }),
      ),
    );
    if (this.#status.canAddModule) {
      row.append(
        this.#tab('Add a bounded context', this.#target.kind === 'add-module', () =>
          this.#change({ kind: 'add-module', module: '' }),
        ),
      );
    }
    return row;
  }

  #tab(label, active, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (active) button.className = 'primary';
    button.addEventListener('click', onClick);
    return button;
  }

  #verticalFields() {
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');

    const available = this.#status.available;
    const installed = this.#status.installed;
    if (available.length === 0 && installed.length === 0) {
      const none = document.createElement('p');
      none.className = 'muted';
      none.textContent = 'Nothing left to install here.';
      stack.append(none);
      return stack;
    }

    // Not yet installed first: those are the ones with something new
    // to add. An installed vertical stays on the list because
    // re-rendering it is a real action, and it says so on its badge
    // rather than by being missing.
    stack.append(
      cards({
        id: 'vertical',
        chosen: this.#target.vertical ?? '',
        choices: [
          ...available.map((vertical) => this.#choice(vertical)),
          ...installed.map((vertical) => this.#choice(vertical, 'installed')),
        ],
        onChange: (value) =>
          this.#change({
            kind: 'add-vertical',
            vertical: value,
            ...(this.#isInstalled(value) ? { reapply: true } : {}),
          }),
      }),
    );

    if (this.#target.reapply === true) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent =
        'Already installed, so this is a re-render from the answers the manifest recorded. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.';
      stack.append(note);
    }
    return stack;
  }

  /**
   * One vertical as a card. The title is the concept, the id is what
   * `keel add <id>` takes, and the description is what installing it
   * buys — all three straight off the descriptor, so nothing here
   * needs a table of keel's own capability names.
   */
  #choice(vertical, badge) {
    return {
      value: vertical.id,
      label: vertical.title || vertical.id,
      meta: `keel add ${vertical.id}`,
      doc: vertical.description,
      ...(badge === undefined ? {} : { badge }),
    };
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
      this.#change({ ...this.#target, module: name.value.trim() }),
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
        this.#change({
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

  #isInstalled(id) {
    return this.#status.installed.some((vertical) => vertical.id === id);
  }
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}
