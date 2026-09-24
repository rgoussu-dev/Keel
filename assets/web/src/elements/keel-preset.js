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
 * **Built once, updated in place.** The picker is a `<select>` a
 * keyboard moves through — ArrowDown is a change, and a change moves
 * the target, which comes straight back as a property: rebuilding the
 * control on it dropped the focus on the page body mid-keystroke. And
 * the notice is a live region (`role=status`), which is announced when
 * its text changes, not when a new one is inserted already holding it:
 * so it is there from the first render, empty until a move has
 * something to say, and its text is written only when it differs.
 *
 * Catalog, target and notice in as properties, `target-changed` out.
 */

export class KeelPreset extends HTMLElement {
  #catalog = null;
  #target = null;
  #notice = '';
  /** The parts built once: the picker, the preset's line, and the notice region. */
  #select = null;
  #doc = null;
  #region = null;
  /** The catalog the picker's options were built from. */
  #listed = null;

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
    if (this.#select === null) this.#build();
    if (this.#listed !== this.#catalog) {
      this.#select.replaceChildren(
        ...this.#catalog.stacks.map((stack) => {
          const option = document.createElement('option');
          option.value = stack.id;
          option.textContent = stack.id;
          option.title = stack.description;
          return option;
        }),
      );
      this.#listed = this.#catalog;
    }
    const chosen = this.#target.stack ?? '';
    if (this.#select.value !== chosen) this.#select.value = chosen;
    const stack = this.#catalog.stacks.find((candidate) => candidate.id === chosen);
    const description = stack?.description ?? '';
    this.#doc.textContent = description;
    this.#doc.hidden = description === '';
    if (this.#region.textContent !== this.#notice) this.#region.textContent = this.#notice;
  }

  #build() {
    const row = document.createElement('cluster-pk');
    row.className = 'preset';
    row.setAttribute('space', 'var(--s-2)');
    row.setAttribute('align', 'baseline');

    const caption = document.createElement('label');
    caption.setAttribute('for', 'stack');
    caption.textContent = 'Preset';

    this.#select = document.createElement('select');
    this.#select.id = 'stack';
    this.#select.className = 'compact';
    this.#select.addEventListener('change', () =>
      this.dispatchEvent(
        new CustomEvent('target-changed', {
          bubbles: true,
          detail: { stack: this.#select?.value ?? '' },
        }),
      ),
    );

    this.#doc = document.createElement('p');
    this.#doc.className = 'muted';
    row.append(caption, this.#select, this.#doc);

    this.#region = document.createElement('p');
    this.#region.className = 'preset-notice';
    this.#region.dataset.role = 'preset-notice';
    this.#region.setAttribute('role', 'status');
    this.replaceChildren(row, this.#region);
  }
}
