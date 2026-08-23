/**
 * `<keel-plan>` — the right-hand column: what this install would
 * write, what it would run afterwards, and the command that is
 * equivalent to it.
 *
 * The plan is the whole reason a form beats a flag here. `keel new`
 * tells you the tree after it has written it (or under `--dry-run`,
 * in a scroll of paths); this shows it while the choices are still
 * moving, so a build-system flip is a visible diff rather than an act
 * of faith. It stays on screen through **every** step of the wizard
 * for that reason: the tree redrawing as you answer is what makes the
 * answer mean something, and a stepper that hid it until the end
 * would have thrown that away. The shell pins this column so that
 * holds on a long step too, not only a short one.
 *
 * The Generate button is not here. It belongs to the review step —
 * `<keel-review>` — which is the one place the run is committed from.
 *
 * **The skeleton is built once.** Every preview used to replace this
 * subtree, which reset the tree's scroll position on each keystroke:
 * scroll to the file you were watching, change a dial, and you are
 * back at the top. Now each region is addressed and updated in place,
 * and only the parts that changed are rewritten.
 *
 * **Why the CLI line is here.** The page and the terminal are two
 * primary adapters over one mediator, so every state this wizard
 * reaches is a command somebody could have typed. Showing it turns a
 * one-off click into something that can go in a README or a CI job —
 * and it is how a user who started here learns the command they will
 * use from then on. It is derived from the same body the review step
 * posts (`../command.js`), so it cannot describe a different install.
 *
 * Preview/report/state in as properties; nothing out.
 */

import { commandFor, commandText } from '../command.js';
import { el, icon } from '../dom.js';
import { countKinds } from '../tree.js';

export class KeelPlan extends HTMLElement {
  #preview = null;
  #report = null;
  #stale = false;
  #hint = '';
  #body = null;
  #built = false;

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

  /** @param {boolean} value whether the shown preview predates the current answers */
  set stale(value) {
    this.#stale = value;
    this.#render();
  }

  /** @param {string} value what to show instead of a tree, if anything */
  set hint(value) {
    this.#hint = value ?? '';
    this.#render();
  }

  /** @param {object|null} value the exact body the review step posts */
  set body(value) {
    this.#body = value;
    this.#render();
  }

  connectedCallback() {
    this.#build();
    this.#render();
  }

  /* ---- the skeleton -------------------------------------------- */

  #build() {
    if (this.#built) return;
    this.#built = true;
    this.replaceChildren(
      el(
        'div',
        { class: 'plan' },
        el(
          'div',
          { class: 'plan-head' },
          el('h2', { text: 'Plan' }),
          el('div', { class: 'plan-counts', attrs: { 'data-role': 'counts' } }),
        ),
        el('div', { attrs: { 'data-role': 'report' }, hidden: true }),
        el(
          'div',
          { class: 'tree-panel' },
          el('div', { class: 'working-bar', attrs: { 'data-role': 'working' }, hidden: true }),
          el('div', { class: 'tree', attrs: { 'data-role': 'tree' } }),
        ),
        el(
          'section',
          { attrs: { 'data-role': 'actions' }, hidden: true },
          el(
            'div',
            { class: 'section-head' },
            el('h3', { text: 'Then keel runs' }),
            el('span', { class: 'muted', text: 'on your machine' }),
          ),
          el('ul', { class: 'actions' }),
        ),
        el(
          'section',
          { attrs: { 'data-role': 'cli' }, hidden: true },
          el(
            'div',
            { class: 'section-head' },
            el('h3', {}, icon('terminal'), el('span', { text: ' Same run, from the terminal' })),
            el(
              'button',
              {
                type: 'button',
                class: 'ghost',
                attrs: { 'data-role': 'copy', 'aria-label': 'Copy the command' },
                on: { click: () => void this.#copy() },
              },
              icon('copy'),
              el('span', { text: 'Copy' }),
            ),
          ),
          el('code', { class: 'cli-block', attrs: { 'data-role': 'cli-text' } }),
        ),
      ),
    );
  }

  /* ---- updates ------------------------------------------------- */

  #render() {
    if (!this.isConnected) return;
    this.#build();
    this.#renderCounts();
    this.#renderReport();
    this.#renderTree();
    this.#renderActions();
    this.#renderCommand();
  }

  #part(role) {
    return this.querySelector(`[data-role="${role}"]`);
  }

  #renderCounts() {
    const host = this.#part('counts');
    if (!host) return;
    if (this.#preview === null) {
      host.replaceChildren();
      return;
    }
    const counts = countKinds(this.#preview.changes);
    host.replaceChildren(
      ...[
        ['create', counts.create, 'new'],
        ['modify', counts.modify, 'modified'],
        ['delete', counts.delete, 'removed'],
      ]
        .filter(([, count], index) => count > 0 || index === 0)
        .map(([kind, count, label]) =>
          el(
            'span',
            { class: `chip ${kind}` },
            el('span', { class: 'dot' }),
            el('span', { text: `${count} ${label}` }),
          ),
        ),
    );
  }

  #renderReport() {
    const host = this.#part('report');
    if (!host) return;
    host.hidden = this.#report === null;
    if (this.#report === null) return;
    host.className = 'banner success';
    host.replaceChildren(
      el('span', {}, icon('check')),
      el(
        'span',
        {},
        el('span', { class: 'banner-title', text: `Done — ${this.#report.subject}` }),
        el('p', {
          class: 'help',
          text: `${this.#report.changes.length} files written${
            this.#report.actions.length > 0 ? `, ${this.#report.actions.length} actions run` : ''
          }.`,
        }),
      ),
    );
  }

  /**
   * The tree, or the reason there is none.
   *
   * The file tree is **removed** rather than hidden when a hint takes
   * its place: a refused run has no plan, and a `<keel-file-tree>`
   * still in the document — empty, or holding the last good tree —
   * would say it has one.
   */
  #renderTree() {
    const host = this.#part('tree');
    const working = this.#part('working');
    if (!host || !working) return;

    working.hidden = !this.#stale;
    host.classList.toggle('stale', this.#stale);

    if (this.#hint !== '') {
      host.replaceChildren(el('p', { class: 'tree-empty', text: this.#hint }));
      return;
    }
    let tree = host.querySelector('keel-file-tree');
    if (!tree) {
      tree = document.createElement('keel-file-tree');
      host.replaceChildren(tree);
    }
    tree.changes = this.#preview?.changes ?? [];
  }

  #renderActions() {
    const host = this.#part('actions');
    if (!host) return;
    const actions = this.#preview?.actions ?? [];
    host.hidden = actions.length === 0;
    const list = host.querySelector('ul');
    if (!list) return;
    list.replaceChildren(
      ...actions.map((action) =>
        el('li', {}, el('span', { class: 'prompt', text: '›' }), el('span', { text: action })),
      ),
    );
  }

  #renderCommand() {
    const host = this.#part('cli');
    const text = this.#part('cli-text');
    if (!host || !text) return;
    const tokens = this.#body === null ? [] : commandFor(this.#body);
    host.hidden = tokens.length === 0;
    if (tokens.length === 0) return;
    text.replaceChildren(
      ...tokens.flatMap((token, index) => [
        ...(index === 0 ? [] : [document.createTextNode(' ')]),
        el('span', { class: token.kind === 'flag' ? 'flag' : '', text: token.text }),
      ]),
    );
  }

  async #copy() {
    const button = this.#part('copy');
    if (this.#body === null || !button) return;
    const line = commandText(commandFor(this.#body));
    const label = button.querySelector('span');
    try {
      await navigator.clipboard.writeText(line);
      if (label) label.textContent = 'Copied';
    } catch {
      // No clipboard permission — say so rather than looking broken.
      if (label) label.textContent = `Press ${mac() ? 'Cmd' : 'Ctrl'}-C`;
      const text = this.#part('cli-text');
      if (text) getSelection()?.selectAllChildren(text);
    }
    setTimeout(() => {
      if (label) label.textContent = 'Copy';
    }, 1600);
  }
}

/** Whether the shortcut should be spelled the Apple way. */
function mac() {
  return /Mac|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent ?? '');
}
