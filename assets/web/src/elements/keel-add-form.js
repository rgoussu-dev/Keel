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
 * Status + target in as properties, `target-changed` out.
 */

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
        this.#change({ kind: 'add-vertical', vertical: this.#firstAvailable() }),
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

    const select = document.createElement('select');
    select.id = 'vertical';
    for (const vertical of available) {
      select.append(option(vertical.id, `${vertical.id} — ${vertical.description}`));
    }
    for (const vertical of installed) {
      select.append(option(vertical.id, `${vertical.id} — installed (re-render)`));
    }
    select.value = this.#target.vertical ?? available[0]?.id ?? installed[0]?.id ?? '';
    select.addEventListener('change', () =>
      this.#change({
        kind: 'add-vertical',
        vertical: select.value,
        ...(this.#isInstalled(select.value) ? { reapply: true } : {}),
      }),
    );

    const label = document.createElement('label');
    label.setAttribute('for', 'vertical');
    label.textContent = 'Vertical';
    stack.append(label, select);

    if (this.#target.reapply === true) {
      const note = document.createElement('p');
      note.className = 'muted';
      note.textContent =
        'Already installed, so this is a re-render from the answers the manifest recorded. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.';
      stack.append(note);
    }
    return stack;
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

  #firstAvailable() {
    return this.#status.available[0]?.id ?? this.#status.installed[0]?.id ?? '';
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
