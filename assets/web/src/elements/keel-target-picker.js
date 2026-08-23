/**
 * `<keel-target-picker>` — where the project goes.
 *
 * A path field plus a folder browser, because "type the absolute
 * path" is a poor first impression and a browser cannot open a native
 * directory dialog for a local server. Only directories are listed;
 * a path that does not exist yet is legal and says so, since typing
 * the folder you are about to create is the normal way to start.
 *
 * **The browser is a disclosure, and the crumbs are the navigation.**
 * A folder list is the thing you need for the ten seconds it takes to
 * find a directory and never again — held open it was the largest
 * region on the page for the least-used control. So it opens on
 * request and closes once a directory is chosen, and the path itself
 * became the trail: every segment is a jump, where the old picker's
 * only way back up was one `↑ parent` click at a time.
 *
 * Listing in as a property, `target-chosen` out: `{ path }`.
 */

import { el, icon } from '../dom.js';

export class KeelTargetPicker extends HTMLElement {
  #listing = null;
  #path = '';
  #open = false;

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

  #choose(path, { close = false } = {}) {
    if (close) this.#open = false;
    this.dispatchEvent(new CustomEvent('target-chosen', { bubbles: true, detail: { path } }));
  }

  #render() {
    if (!this.isConnected) return;
    this.replaceChildren(
      el(
        'div',
        {},
        this.#row(),
        this.#crumbs(),
        this.#open && this.#listing ? this.#folders() : null,
      ),
    );
  }

  #row() {
    const input = el('input', {
      type: 'text',
      class: 'path-input',
      value: this.#path,
      attrs: { 'aria-label': 'Project directory', spellcheck: 'false' },
      on: {
        change: () => this.#choose(input.value.trim()),
        keydown: (event) => {
          if (event.key === 'Enter') this.#choose(input.value.trim());
        },
      },
    });

    const toggle = el(
      'button',
      {
        type: 'button',
        attrs: { 'aria-expanded': String(this.#open) },
        on: {
          click: () => {
            this.#open = !this.#open;
            this.#render();
          },
        },
      },
      icon('folder'),
      el('span', { text: this.#open ? 'Close' : 'Browse' }),
    );

    return el('div', { class: 'location-row' }, input, this.#stateBadge(), toggle);
  }

  /** What this directory already is, said once and in one place. */
  #stateBadge() {
    if (!this.#listing) return null;
    if (!this.#listing.exists) return el('span', { class: 'chip', text: 'will be created' });
    if (this.#listing.empty) return el('span', { class: 'chip', text: 'empty' });
    return el('span', { class: 'chip', text: `${this.#listing.entries.length} folders` });
  }

  /**
   * The path as a trail of jumps.
   *
   * Split on whichever separator the server's own paths use, so a
   * Windows path is not mangled into one unclickable segment — the
   * page never constructs a path, it only re-joins prefixes of one it
   * was given.
   */
  #crumbs() {
    const row = el('nav', { class: 'crumbs', attrs: { 'aria-label': 'Path' } });
    const path = this.#listing?.path ?? this.#path;
    if (path === '') return row;
    const separator = path.includes('\\') && !path.startsWith('/') ? '\\' : '/';
    const segments = path.split(separator);
    let prefix = '';
    segments.forEach((segment, index) => {
      const last = index === segments.length - 1;
      prefix = index === 0 ? segment : `${prefix}${separator}${segment}`;
      const here = prefix === '' ? separator : prefix;
      // An absolute POSIX path splits to a leading empty segment; it
      // is the root, and the root already looks like a separator.
      const label = segment === '' ? separator : segment;
      if (index > 1 || (index === 1 && segments[0] !== '')) {
        row.append(el('span', { class: 'sep', text: separator }));
      }
      row.append(
        el('button', {
          type: 'button',
          text: label,
          disabled: last,
          style: last ? 'color: var(--keel-ink); font-weight: 600' : null,
          on: { click: () => this.#choose(here, { close: true }) },
        }),
      );
    });
    return row;
  }

  #folders() {
    const box = el('div', { class: 'folders' });
    if (this.#listing.parent) {
      box.append(
        el(
          'button',
          {
            type: 'button',
            on: { click: () => this.#choose(this.#listing.parent) },
          },
          icon('up', 'folder-icon'),
          el('span', { text: '..' }),
        ),
      );
    }
    if (this.#listing.entries.length === 0) {
      box.append(
        el('p', {
          class: 'empty',
          text: this.#listing.exists
            ? 'No subdirectories here — this is a fine place to scaffold into.'
            : 'This directory does not exist yet; keel will create it.',
        }),
      );
      return box;
    }
    for (const entry of this.#listing.entries) {
      box.append(
        el(
          'button',
          {
            type: 'button',
            title: entry.path,
            on: { click: () => this.#choose(entry.path) },
          },
          icon('folder', 'folder-icon'),
          el('span', { text: entry.name }),
        ),
      );
    }
    return box;
  }
}
