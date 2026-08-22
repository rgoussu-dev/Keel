/**
 * `<keel-file-tree>` — the plan, as a tree.
 *
 * Data in as a property (`changes`), nothing out: it is a read-only
 * view. Renders in the light DOM so the page's stylesheet and planks'
 * tag-scoped rules both reach it.
 */

import { foldTree } from '../tree.js';

export class KeelFileTree extends HTMLElement {
  #changes = [];

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
    this.replaceChildren();
    if (this.#changes.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'muted';
      empty.textContent = 'Nothing to write yet.';
      this.append(empty);
      return;
    }
    this.append(list(foldTree(this.#changes)));
  }
}

function list(nodes) {
  const ul = document.createElement('ul');
  for (const node of nodes) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    const directory = node.children.length > 0;
    label.className = directory ? 'dir' : (node.kind ?? '');
    label.textContent = directory ? `${node.name}/` : node.name;
    li.append(label);
    if (directory) li.append(list(node.children));
    ul.append(li);
  }
  return ul;
}
