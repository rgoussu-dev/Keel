/**
 * `<keel-target-picker>` — where the project goes.
 *
 * A path field plus a folder browser, because "type the absolute
 * path" is a poor first impression and a browser cannot open a native
 * directory dialog for a local server. Only directories are listed;
 * a path that does not exist yet is legal and says so, since typing
 * the folder you are about to create is the normal way to start.
 *
 * Listing in as a property, `target-chosen` out: `{ path }`.
 */

export class KeelTargetPicker extends HTMLElement {
  #listing = null;
  #path = '';

  /** @param {object} value the last `/api/browse` listing */
  set listing(value) {
    this.#listing = value;
    if (value) this.#path = value.path;
    this.#render();
  }

  get listing() {
    return this.#listing;
  }

  connectedCallback() {
    this.#render();
  }

  #choose(path) {
    this.dispatchEvent(new CustomEvent('target-chosen', { bubbles: true, detail: { path } }));
  }

  #render() {
    if (!this.isConnected) return;
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s-1)');
    stack.append(this.#field(), this.#crumbs());
    if (this.#listing) stack.append(this.#folders());
    this.replaceChildren(stack);
  }

  #field() {
    const row = document.createElement('cluster-pk');
    row.setAttribute('space', 'var(--s-2)');
    row.setAttribute('align', 'center');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'grow';
    input.value = this.#path;
    input.setAttribute('aria-label', 'Project directory');
    input.addEventListener('change', () => this.#choose(input.value.trim()));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') this.#choose(input.value.trim());
    });

    row.append(input);
    if (this.#listing && !this.#listing.exists) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'will be created';
      row.append(badge);
    } else if (this.#listing && this.#listing.empty) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'empty';
      row.append(badge);
    }
    return row;
  }

  #crumbs() {
    const row = document.createElement('cluster-pk');
    row.className = 'crumbs';
    row.setAttribute('space', 'var(--s-3)');
    if (this.#listing?.parent) {
      row.append(this.#jump('↑ parent', this.#listing.parent));
    }
    return row;
  }

  #folders() {
    const box = document.createElement('div');
    box.className = 'folders';
    if (this.#listing.entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.style.padding = 'var(--s-2)';
      empty.textContent = this.#listing.exists
        ? 'No subdirectories here.'
        : 'This directory does not exist yet.';
      box.append(empty);
      return box;
    }
    for (const entry of this.#listing.entries) {
      box.append(this.#jump(entry.name, entry.path));
    }
    return box;
  }

  #jump(label, path) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => this.#choose(path));
    return button;
  }
}
