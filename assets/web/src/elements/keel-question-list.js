/**
 * `<keel-question-list>` — the dynamic half of the form.
 *
 * Every control here is rendered from a `PendingQuestion` the preview
 * reported, and each answer is emitted back with the *binding* the
 * preview attached to it. The element therefore knows nothing about
 * which adapter asked what, or which command field an answer lands
 * in: it reads the binding to decide where a control belongs, renders
 * the value, and hands the binding straight back.
 *
 * **The binding is the layout, and that is the point of this
 * element's shape.** A preview answers with one flat list, and the
 * first version of this page rendered it as one flat list — so "which
 * verticals go in this project", a field of the command that redraws
 * the whole plan, sat between "initial branch name" and "base Java
 * package" under a heading reading *Questions*. They are not the same
 * kind of decision and they do not belong in one column of identical
 * boxes. `binding.kind` already says which is which:
 *
 * - **Not `answer`** — a field of the command itself
 *   (`extraVerticals` today). It gets its own section, headed by the
 *   question's own prompt, and a set of them is a list of rows you
 *   can read down rather than a grid of boxes you have to scan.
 * - **`answer`** — what a composition adapter asked. These are the
 *   details, they are grouped **by the adapter that asked**, and the
 *   adapter id is the group's heading rather than a mono tag repeated
 *   at the far end of every single label.
 *
 * **The caret survives a re-render.** Every preview re-renders this
 * list, and a form that moves the cursor out of the field being typed
 * in is unusable at speed. The focused control's id and selection are
 * captured before the swap and restored after it — cheaper and more
 * predictable than diffing, and the ids are already stable per
 * binding for exactly this reason.
 *
 * Questions in, `question-answered` out: `{ binding, value }`.
 */

import { el, field, help, prose, select } from '../dom.js';

export class KeelQuestionList extends HTMLElement {
  #questions = [];

  /** @param {object[]} value pending questions from the last preview */
  set questions(value) {
    this.#questions = value ?? [];
    this.#render();
  }

  get questions() {
    return this.#questions;
  }

  connectedCallback() {
    this.#render();
  }

  #emit(binding, value) {
    this.dispatchEvent(
      new CustomEvent('question-answered', { bubbles: true, detail: { binding, value } }),
    );
  }

  #render() {
    if (!this.isConnected) return;
    const focused = this.#captureFocus();

    const commandLevel = this.#questions.filter((question) => question.binding.kind !== 'answer');
    const answers = this.#questions.filter((question) => question.binding.kind === 'answer');

    if (commandLevel.length === 0 && answers.length === 0) {
      this.replaceChildren(
        el(
          'div',
          { class: 'banner' },
          el(
            'span',
            {},
            el('span', { class: 'banner-title', text: 'Nothing left to answer' }),
            el('p', {
              class: 'help',
              text: 'This combination has a default for every question it asks.',
            }),
          ),
        ),
      );
      return;
    }

    this.replaceChildren(
      el(
        'stack-pk',
        { attrs: { space: 'var(--s1)' } },
        ...commandLevel.map((question) => this.#commandSection(question)),
        answers.length > 0 ? this.#detailSection(answers) : null,
      ),
    );

    this.#restoreFocus(focused);
  }

  /* ---- a field of the command ---------------------------------- */

  /**
   * A command-level question, as its own section under its own
   * prompt. A set of choices becomes a list of rows — one line each,
   * name and description side by side — because that is a thing you
   * read down, where a grid of equal boxes is a thing you have to
   * scan and a `<select multiple>` is a thing you lose to a stray
   * click.
   */
  #commandSection(question) {
    const id = `q-${key(question.binding)}`;
    const many = question.kind === 'multi-select' && question.choices?.length > 0;
    const chosen = new Set(splitSelection(question.value));

    const body = many
      ? el(
          'ul',
          { class: 'option-list', id },
          ...question.choices.map((choice) => this.#optionRow(question, choice, chosen)),
        )
      : el('div', { class: 'card-body' }, this.#control(question, id));

    return el(
      'section',
      {},
      el(
        'div',
        { class: 'section-head' },
        el('h2', { text: question.prompt }),
        many
          ? el('span', {
              class: chosen.size > 0 ? 'chip accent' : 'chip',
              text: `${chosen.size} of ${question.choices.length} chosen`,
            })
          : null,
      ),
      question.doc !== '' ? help(question.doc, 'margin-block-end: var(--s-2)') : null,
      el('div', { class: 'card' }, body),
    );
  }

  #optionRow(question, choice, chosen) {
    const box = el('input', {
      type: 'checkbox',
      value: choice.value,
      checked: chosen.has(choice.value),
      on: {
        change: (event) => {
          const next = question.choices
            .map((candidate) => candidate.value)
            .filter((value) => (value === choice.value ? event.target.checked : chosen.has(value)));
          this.#emit(question.binding, next.join(','));
        },
      },
    });
    return el(
      'li',
      {},
      el(
        'label',
        { class: 'option' },
        box,
        el('span', { class: 'option-name', text: choice.label }),
        el('span', { class: 'option-doc' }, prose(choice.doc ?? '')),
      ),
    );
  }

  /* ---- what the adapters asked --------------------------------- */

  /**
   * The adapter answers, grouped by their adapter.
   *
   * Naming the adapter once per group says what a tag on every label
   * said, and says it where it is actually useful: two services of a
   * composite both ask for a project name, and the group is what
   * tells those two fields apart.
   */
  #detailSection(answers) {
    const groups = new Map();
    for (const question of answers) {
      const adapter = question.binding.adapter;
      if (!groups.has(adapter)) groups.set(adapter, []);
      groups.get(adapter).push(question);
    }

    const body = el('div', { class: 'card-body' });
    const parts = [];
    for (const [adapter, questions] of groups) {
      parts.push(
        el(
          'div',
          { class: 'group' },
          el('p', { class: 'group-head', text: adapter }),
          el(
            'stack-pk',
            { attrs: { space: 'var(--s0)' } },
            ...questions.map((question) => {
              const id = `q-${key(question.binding)}`;
              return field({
                id,
                label: question.prompt,
                doc: question.doc,
                control: this.#control(question, id),
              });
            }),
          ),
        ),
      );
    }
    body.append(el('stack-pk', { attrs: { space: 'var(--s1)' } }, ...parts));

    return el(
      'section',
      {},
      el(
        'div',
        { class: 'section-head' },
        el('h2', { text: 'Details' }),
        el('span', {
          class: 'muted',
          text: `${answers.length} field${answers.length === 1 ? '' : 's'} · every one has a default`,
        }),
      ),
      el('div', { class: 'card' }, body),
    );
  }

  /* ---- one control --------------------------------------------- */

  #control(question, id) {
    if (question.choices && question.choices.length > 0) {
      return select({
        id,
        value: question.value,
        choices: question.choices.map((choice) => ({
          value: choice.value,
          label: choice.label,
          doc: choice.doc,
        })),
        onChange: (value) => this.#emit(question.binding, value),
      });
    }
    // `change` rather than `input`: a preview per keystroke would
    // re-render the field under the caret. The blur is the commit.
    return el('input', {
      type: 'text',
      id,
      value: question.value,
      placeholder: question.default,
      attrs: { spellcheck: 'false', autocomplete: 'off' },
      on: { change: (event) => this.#emit(question.binding, event.target.value) },
    });
  }

  /* ---- focus --------------------------------------------------- */

  /** The focused control's identity and caret, if it is one of ours. */
  #captureFocus() {
    const active = document.activeElement;
    if (!active || !this.contains(active) || active.id === '') return null;
    const text = active instanceof HTMLInputElement && active.type === 'text';
    return {
      id: active.id,
      start: text ? active.selectionStart : null,
      end: text ? active.selectionEnd : null,
    };
  }

  #restoreFocus(focused) {
    if (focused === null) return;
    const control = this.querySelector(`#${CSS.escape(focused.id)}`);
    if (!(control instanceof HTMLElement)) return;
    control.focus({ preventScroll: true });
    if (focused.start !== null && control instanceof HTMLInputElement) {
      try {
        control.setSelectionRange(focused.start, focused.end);
      } catch {
        // A control whose type does not carry a selection; the focus
        // is the part that mattered.
      }
    }
  }
}

/** Splits an encoded `multi-select` answer, dropping blanks. */
function splitSelection(answer) {
  return (answer ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/** A stable DOM id per binding, so focus survives a re-render. */
function key(binding) {
  switch (binding.kind) {
    case 'answer':
      return `${binding.adapter}--${binding.question}`.replace(/[^a-zA-Z0-9_-]/g, '-');
    case 'buildSystem':
      return binding.service === undefined ? 'buildSystem' : `buildSystem-${binding.service}`;
    default:
      return binding.kind;
  }
}
