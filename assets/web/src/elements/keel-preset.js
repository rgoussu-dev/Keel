/**
 * `<keel-preset>` — the line under the rail saying which preset the
 * answers so far have landed on, and the escape hatch out of the
 * narrowing.
 *
 * It is deliberately always on screen. The stepper asks four
 * questions to arrive at a preset id, and a wizard that hides its own
 * answer until the end is a wizard you cannot check. It doubles as
 * the flat list — the browser half of the terminal's "Other — pick a
 * preset by id" — which is what keeps a preset the finder could not
 * place reachable, a plugin's among them.
 *
 * Under it, when there is one, the line saying what the last move
 * onto a new preset could not keep — the dial it had to snap, the
 * language a new shape does not have. Here because this is where the
 * id changed, and the one place on the page that is on screen at
 * every step the move could have been made from.
 *
 * Catalog, target and notice in as properties, `target-changed` out.
 */

export class KeelPreset extends HTMLElement {
  #catalog = null;
  #target = null;
  #notice = '';

  /** @param {object} value the `/api/catalog` payload */
  set catalog(value) {
    this.#catalog = value;
    this.#render();
  }

  /** @param {object} value the current new-project target */
  set target(value) {
    this.#target = value;
    this.#render();
  }

  /** @param {string} value what the last preset move could not keep; '' for nothing */
  set notice(value) {
    this.#notice = value ?? '';
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    if (!this.isConnected || !this.#catalog || !this.#target) return;
    const row = document.createElement('cluster-pk');
    row.className = 'preset';
    row.setAttribute('space', 'var(--s-2)');
    row.setAttribute('align', 'baseline');

    const caption = document.createElement('label');
    caption.setAttribute('for', 'stack');
    caption.textContent = 'Preset';

    const select = document.createElement('select');
    select.id = 'stack';
    select.className = 'compact';
    for (const stack of this.#catalog.stacks) {
      const option = document.createElement('option');
      option.value = stack.id;
      option.textContent = stack.id;
      option.title = stack.description;
      select.append(option);
    }
    select.value = this.#target.stack ?? '';
    select.addEventListener('change', () =>
      this.dispatchEvent(
        new CustomEvent('target-changed', { bubbles: true, detail: { stack: select.value } }),
      ),
    );

    row.append(caption, select);
    const stack = this.#catalog.stacks.find((candidate) => candidate.id === this.#target.stack);
    if (stack && stack.description !== '') {
      const doc = document.createElement('p');
      doc.className = 'muted';
      doc.textContent = stack.description;
      row.append(doc);
    }
    if (this.#notice === '') {
      this.replaceChildren(row);
      return;
    }
    const notice = document.createElement('p');
    notice.className = 'preset-notice';
    notice.dataset.role = 'preset-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = this.#notice;
    this.replaceChildren(row, notice);
  }
}
