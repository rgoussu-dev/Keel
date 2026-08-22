/**
 * `<keel-plan>` — the right-hand column: what this install would
 * write, what it would run afterwards, and the button that commits
 * it.
 *
 * The plan is the whole reason a form beats a flag here. `keel new`
 * tells you the tree after it has written it (or under `--dry-run`,
 * in a scroll of paths); this shows it while the choices are still
 * moving, so a build-system flip is a visible diff rather than an act
 * of faith.
 *
 * Preview/report/state in as properties, `install-requested` out.
 */

import { countKinds } from '../tree.js';

export class KeelPlan extends HTMLElement {
  #preview = null;
  #report = null;
  #busy = false;
  #stale = false;
  #ready = false;
  #hint = '';

  /** @param {object|null} value the last successful preview */
  set preview(value) {
    this.#preview = value;
    this.#render();
  }

  /** @param {object|null} value the report of a completed install */
  set report(value) {
    this.#report = value;
    this.#render();
  }

  /** @param {boolean} value whether a request is in flight */
  set busy(value) {
    this.#busy = value;
    this.#render();
  }

  /** @param {boolean} value whether the shown preview predates the current answers */
  set stale(value) {
    this.#stale = value;
    this.#render();
  }

  /** @param {boolean} value whether the form is complete enough to install */
  set ready(value) {
    this.#ready = value;
    this.#render();
  }

  /** @param {string} value what to show instead of a tree, if anything */
  set hint(value) {
    this.#hint = value ?? '';
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    if (!this.isConnected) return;
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');
    stack.append(this.#header());
    if (this.#report) stack.append(this.#reportPanel());
    stack.append(this.#tree());
    const actions = this.#actions();
    if (actions) stack.append(actions);
    stack.append(this.#commit());
    this.replaceChildren(stack);
  }

  #header() {
    const row = document.createElement('cluster-pk');
    row.setAttribute('space', 'var(--s-1)');
    row.setAttribute('align', 'baseline');
    const title = document.createElement('h2');
    title.textContent = 'Plan';
    row.append(title);
    if (this.#preview) {
      const counts = countKinds(this.#preview.changes);
      const summary = document.createElement('span');
      summary.className = 'muted';
      summary.textContent = [
        `${counts.create} new`,
        counts.modify > 0 ? `${counts.modify} modified` : null,
        counts.delete > 0 ? `${counts.delete} removed` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      row.append(summary);
    }
    return row;
  }

  #tree() {
    const panel = document.createElement('div');
    panel.className = this.#stale ? 'panel tree stale' : 'panel tree';
    if (this.#hint !== '') {
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = this.#hint;
      panel.append(hint);
      return panel;
    }
    const tree = document.createElement('keel-file-tree');
    tree.changes = this.#preview?.changes ?? [];
    panel.append(tree);
    return panel;
  }

  #actions() {
    const actions = this.#preview?.actions ?? [];
    if (actions.length === 0) return null;
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s-2)');
    const title = document.createElement('h2');
    title.textContent = 'Then keel runs';
    const list = document.createElement('ul');
    list.className = 'plain actions';
    for (const action of actions) {
      const item = document.createElement('li');
      item.textContent = `! ${action}`;
      list.append(item);
    }
    stack.append(title, list);
    return stack;
  }

  #commit() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'primary';
    button.disabled = this.#busy || !this.#ready || this.#preview === null;
    button.textContent = this.#busy ? 'Working…' : 'Generate';
    button.addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('install-requested', { bubbles: true })),
    );
    return button;
  }

  #reportPanel() {
    const panel = document.createElement('div');
    panel.className = 'panel';
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s-2)');
    const title = document.createElement('h3');
    title.textContent = `Done — ${this.#report.subject}`;
    const detail = document.createElement('p');
    detail.className = 'muted';
    detail.textContent = `${this.#report.changes.length} files written${
      this.#report.actions.length > 0 ? `, ${this.#report.actions.length} actions run` : ''
    }.`;
    stack.append(title, detail);
    panel.append(stack);
    return panel;
  }
}
