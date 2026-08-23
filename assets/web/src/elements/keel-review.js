/**
 * `<keel-review>` — the last step: every choice this run will make,
 * and the button that commits it.
 *
 * The terminal wizard ends the same way, and for the same reason —
 * `keel new` shows the staged plan and offers "proceed, cancel, or
 * jump back to any answered question" before writing a byte. Each row
 * here is that jump: it names the step the choice was made on and
 * goes back to it.
 *
 * What it does **not** re-derive is the plan. The file tree is next
 * to it in the right-hand column, live, and has been since the first
 * step — a summary that restated it would be a second reading of the
 * same preview.
 *
 * Rows + state in as properties, `install-requested` and
 * `step-selected` out.
 */

export class KeelReview extends HTMLElement {
  #rows = [];
  #busy = false;
  #ready = false;
  #hint = '';

  /** @param {object[]} value `{ step, label, value }`, in step order */
  set rows(value) {
    this.#rows = value ?? [];
    this.#render();
  }

  /** @param {boolean} value whether a request is in flight */
  set busy(value) {
    this.#busy = value;
    this.#render();
  }

  /** @param {boolean} value whether the run is complete enough to commit */
  set ready(value) {
    this.#ready = value;
    this.#render();
  }

  /** @param {string} value why it is not ready, if it is not */
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

    const list = document.createElement('dl');
    list.className = 'summary';
    for (const row of this.#rows) {
      const term = document.createElement('dt');
      term.textContent = row.label;
      const value = document.createElement('dd');
      const shown = document.createElement('span');
      shown.className = 'mono';
      shown.textContent = row.value;
      value.append(shown);
      if (row.step) {
        const jump = document.createElement('button');
        jump.type = 'button';
        jump.className = 'link';
        jump.textContent = 'change';
        jump.addEventListener('click', () =>
          this.dispatchEvent(
            new CustomEvent('step-selected', { bubbles: true, detail: { id: row.step } }),
          ),
        );
        value.append(jump);
      }
      list.append(term, value);
    }
    stack.append(list);

    if (this.#hint !== '') {
      const hint = document.createElement('p');
      hint.className = 'muted';
      hint.textContent = this.#hint;
      stack.append(hint);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'generate';
    button.className = 'primary';
    button.disabled = this.#busy || !this.#ready;
    button.textContent = this.#busy ? 'Working…' : 'Generate';
    button.addEventListener('click', () =>
      this.dispatchEvent(new CustomEvent('install-requested', { bubbles: true })),
    );
    stack.append(button);
    this.replaceChildren(stack);
  }
}
