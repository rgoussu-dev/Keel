/**
 * `<keel-question-list>` — the dynamic half of the form.
 *
 * Every control here is rendered from a `PendingQuestion` the preview
 * reported, and each answer is emitted back with the *binding* the
 * preview attached to it. The element therefore knows nothing about
 * which adapter asked what, or which command field an answer lands
 * in: it renders `choices` as a `<select>` and everything else as a
 * text input, and hands the binding straight back.
 *
 * Questions in, `question-answered` out:
 * `{ binding, value }`.
 */

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

  #render() {
    if (!this.isConnected) return;
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');

    if (this.#questions.length === 0) {
      const none = document.createElement('p');
      none.className = 'muted';
      none.textContent = 'This combination asks nothing — every choice has a default.';
      stack.append(none);
    }

    for (const question of this.#questions) {
      stack.append(this.#field(question));
    }
    this.replaceChildren(stack);
  }

  #field(question) {
    const wrapper = document.createElement('stack-pk');
    wrapper.setAttribute('space', 'var(--s-3)');

    const id = `q-${key(question.binding)}`;
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = question.prompt;

    const control =
      question.choices && question.choices.length > 0
        ? selectFor(question, id)
        : inputFor(question, id);
    control.addEventListener('change', () => {
      this.dispatchEvent(
        new CustomEvent('question-answered', {
          bubbles: true,
          detail: { binding: question.binding, value: control.value },
        }),
      );
    });

    wrapper.append(label, control);
    if (question.doc !== '') {
      const doc = document.createElement('p');
      doc.className = 'muted';
      doc.textContent = question.doc;
      wrapper.append(doc);
    }
    const source = asked(question.binding);
    if (source !== null) {
      const attribution = document.createElement('p');
      attribution.className = 'muted mono';
      attribution.textContent = source;
      wrapper.append(attribution);
    }
    return wrapper;
  }
}

function selectFor(question, id) {
  const select = document.createElement('select');
  select.id = id;
  for (const choice of question.choices) {
    const option = document.createElement('option');
    option.value = choice.value;
    option.textContent = choice.label;
    option.title = choice.doc;
    select.append(option);
  }
  select.value = question.value;
  return select;
}

function inputFor(question, id) {
  const input = document.createElement('input');
  input.type = 'text';
  input.id = id;
  input.value = question.value;
  input.placeholder = question.default;
  // `change` rather than `input`: a preview per keystroke would
  // re-render the field under the caret. The blur is the commit.
  return input;
}

/**
 * Who asked, for the questions where that is not obvious.
 *
 * A composite install scaffolds two services, and both of them ask
 * for a project name — same words, different adapter, different
 * answer. Naming the adapter is the only thing that tells the two
 * fields apart, and it is what `--set adapterId:questionId=value`
 * would name on the command line.
 */
function asked(binding) {
  return binding.kind === 'answer' ? `${binding.adapter}:${binding.question}` : null;
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
