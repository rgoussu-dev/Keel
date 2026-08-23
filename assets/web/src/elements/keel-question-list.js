/**
 * `<keel-question-list>` — the questions step.
 *
 * Every control here is rendered from a `PendingQuestion` the preview
 * reported, and each answer is emitted back with the *binding* the
 * preview attached to it. The element therefore knows nothing about
 * which adapter asked what, or which command field an answer lands
 * in: it reads the binding to decide where a control belongs, renders
 * the value, and hands the binding straight back.
 *
 * **The binding is the layout.** A preview answers with one flat
 * list, and rendering it as one flat list put "which verticals go in
 * this project" — a field of the command that redraws the whole plan
 * — between "initial branch name" and "base Java package".
 * `binding.kind` already says which is which:
 *
 * - **Not `answer`** — a field of the command itself
 *   (`extraVerticals` today). It gets its own heading, and a set of
 *   choices is drawn as cards, the same control the narrowing steps
 *   use: these are decisions about what gets scaffolded, and you
 *   answer them by reading the answers.
 * - **`answer`** — what a composition adapter asked. Free text and
 *   one-of-many, which is the one place a `<select>` is still right.
 *   They are grouped **by the adapter that asked**, and the adapter
 *   id heads the group rather than tagging every label — which is
 *   also what tells two services' identically-worded questions apart.
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

import { cards, checkboxCards, el, field, help, select } from '../dom.js';

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
        help('This combination asks nothing — every choice it makes has a default.'),
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

  #commandSection(question) {
    const id = `q-${key(question.binding)}`;
    const many = question.kind === 'multi-select' && question.choices?.length > 0;
    const chosen = splitSelection(question.value);
    const choices = (question.choices ?? []).map((choice) => ({
      value: choice.value,
      label: choice.label,
      doc: choice.doc,
    }));

    let control;
    if (many) {
      control = checkboxCards({
        id,
        chosen,
        choices,
        onChange: (values) => this.#emit(question.binding, values.join(',')),
      });
    } else if (choices.length > 0) {
      control = cards({
        id,
        chosen: question.value,
        choices,
        onChange: (value) => this.#emit(question.binding, value),
      });
    } else {
      control = this.#textControl(question, id);
    }

    return el(
      'section',
      {},
      el(
        'div',
        { class: 'section-head' },
        el('h3', { text: question.prompt }),
        many
          ? el('span', {
              class: chosen.length > 0 ? 'chip accent' : 'chip',
              text: `${chosen.length} of ${choices.length} chosen`,
            })
          : null,
      ),
      question.doc !== '' ? help(question.doc, 'margin-block-end: var(--s-2)') : null,
      control,
    );
  }

  /* ---- what the adapters asked --------------------------------- */

  #detailSection(answers) {
    const groups = new Map();
    for (const question of answers) {
      const adapter = question.binding.adapter;
      if (!groups.has(adapter)) groups.set(adapter, []);
      groups.get(adapter).push(question);
    }

    const parts = [];
    for (const [adapter, questions] of groups) {
      parts.push(
        el(
          'div',
          {},
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

    return el(
      'section',
      {},
      el(
        'div',
        { class: 'section-head' },
        el('h3', { text: 'Details' }),
        el('span', {
          class: 'muted',
          text: `${answers.length} field${answers.length === 1 ? '' : 's'} · every one has a default`,
        }),
      ),
      el('stack-pk', { attrs: { space: 'var(--s1)' } }, ...parts),
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
    return this.#textControl(question, id);
  }

  #textControl(question, id) {
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
