/**
 * `<keel-file-tree>` — the plan, as a tree.
 *
 * Data in as a property (`changes`), nothing out: it is a read-only
 * view. Renders in the light DOM so the page's stylesheet and planks'
 * tag-scoped rules both reach it.
 *
 * Three things it does that a bare nesting of `<ul>`s does not, all
 * of them about a real plan's real shape — 300-odd paths, most of
 * them deep:
 *
 * - **Single-child directory chains are joined.** A Java scaffold
 *   spends five levels on `src/main/java/com/example` before the
 *   first file; rendered one level per line that is five lines and
 *   five indents of nothing. Joined, it is one line and one indent,
 *   which is how every file browser worth using shows it.
 * - **Directories collapse**, and the collapsed set survives a
 *   re-render, because the element instance does. Folding away a
 *   subtree you have already read is the only way a long plan stays
 *   navigable while the dials keep moving.
 * - **Each directory carries its file count**, so a folded subtree
 *   still says how much is inside it.
 */

import { el } from '../dom.js';
import { foldTree } from '../tree.js';

/** The gutter mark per change kind. */
const MARKS = { create: '+', modify: '~', delete: '−' };

export class KeelFileTree extends HTMLElement {
  #changes = [];
  /** Directory paths the reader has folded away. */
  #collapsed = new Set();

  /** @param {{ path: string, kind: string }[]} value */
  set changes(value) {
    this.#changes = value ?? [];
    this.#render();
  }

  get changes() {
    return this.#changes;
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    if (!this.isConnected) return;
    if (this.#changes.length === 0) {
      this.replaceChildren(
        el('p', { class: 'tree-empty', text: 'Nothing to write for this combination yet.' }),
      );
      return;
    }
    this.replaceChildren(this.#list(foldTree(this.#changes).map(compress)));
  }

  #list(nodes) {
    const ul = el('ul');
    for (const node of nodes) {
      ul.append(node.children.length > 0 ? this.#directory(node) : this.#file(node));
    }
    return ul;
  }

  #directory(node) {
    const collapsed = this.#collapsed.has(node.path);
    const item = el('li', { class: collapsed ? 'dir collapsed' : 'dir' });
    const row = el(
      'span',
      {
        class: 'row',
        attrs: { role: 'button', tabindex: '0', 'aria-expanded': String(!collapsed) },
        on: {
          click: () => this.#toggle(node.path),
          keydown: (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              this.#toggle(node.path);
            }
          },
        },
      },
      el('span', { class: 'twisty', text: '⌄' }),
      el('span', { class: 'name', text: `${node.name}/` }),
      el('span', { class: 'count', text: String(leaves(node)) }),
    );
    item.append(row, this.#list(node.children.map(compress)));
    return item;
  }

  #file(node) {
    const kind = node.kind ?? '';
    return el(
      'li',
      { class: kind },
      el(
        'span',
        { class: 'row' },
        el('span', { class: 'mark', text: MARKS[kind] ?? '' }),
        el('span', { class: 'name', text: node.name }),
      ),
    );
  }

  #toggle(path) {
    if (this.#collapsed.has(path)) this.#collapsed.delete(path);
    else this.#collapsed.add(path);
    this.#render();
  }
}

/**
 * Joins a chain of directories that each hold exactly one directory
 * and nothing else, so `src/main/java/com/example` is one row.
 *
 * The joined node keeps the *deepest* path as its identity, which is
 * what the collapsed set keys on — fold `src/main/java/com/example`
 * and it stays folded when a later preview adds a sibling three
 * levels up and the chain breaks.
 */
function compress(node) {
  if (node.children.length === 0) return node;
  let name = node.name;
  let current = node;
  while (current.children.length === 1 && current.children[0].children.length > 0) {
    current = current.children[0];
    name = `${name}/${current.name}`;
  }
  return { ...current, name };
}

/** How many files sit under a node, at any depth. */
function leaves(node) {
  if (node.children.length === 0) return 1;
  return node.children.reduce((total, child) => total + leaves(child), 0);
}
