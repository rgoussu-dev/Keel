/**
 * `<keel-stepper>` — the rail across the top: which steps this run
 * has, which one is open, and how far along it is.
 *
 * Every step is clickable, not just the ones already passed. The form
 * is never in an invalid state — every dial has a default and the
 * engine snaps an illegal combination back — so there is nothing for
 * a locked rail to protect, and locking it would make "just show me
 * the plan" a walk through four screens. What the rail marks instead
 * is *position*: done, current, ahead.
 *
 * Which steps exist is not this element's business: it comes in as a
 * property from `steps.js`, which derives it the way the terminal
 * wizard decides to skip a question.
 *
 * Steps + current in as properties, `step-selected` out: `{ id }`.
 */

export class KeelStepper extends HTMLElement {
  #steps = [];
  #current = '';

  /** @param {object[]} value the steps this run has, in order */
  set steps(value) {
    this.#steps = value ?? [];
    this.#render();
  }

  /** @param {string} value id of the step currently open */
  set current(value) {
    this.#current = value ?? '';
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    if (!this.isConnected) return;
    const list = document.createElement('ol');
    list.className = 'stepper';
    const at = this.#steps.findIndex((step) => step.id === this.#current);
    this.#steps.forEach((step, index) => {
      const item = document.createElement('li');
      item.className = index === at ? 'step current' : index < at ? 'step done' : 'step ahead';
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.step = step.id;
      if (index === at) button.setAttribute('aria-current', 'step');
      const ordinal = document.createElement('span');
      ordinal.className = 'ordinal';
      ordinal.textContent = String(index + 1);
      const label = document.createElement('span');
      label.className = 'label';
      label.textContent = step.label;
      button.append(ordinal, label);
      button.addEventListener('click', () =>
        this.dispatchEvent(
          new CustomEvent('step-selected', { bubbles: true, detail: { id: step.id } }),
        ),
      );
      item.append(button);
      list.append(item);
    });
    this.replaceChildren(list);
  }
}
