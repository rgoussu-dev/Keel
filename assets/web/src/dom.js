/**
 * The page's shared control shapes.
 *
 * One module rather than a copy per element, because a card is a
 * *decision* the page has already made — that the questions which
 * decide what gets scaffolded are answered by reading the answers,
 * not by opening a `<select>` — and a second implementation of it is
 * a second place for that decision to erode. The narrowing steps and
 * the brownfield vertical picker are the same control with different
 * data behind it.
 *
 * DOM only. Everything that decides *which* choices exist lives in
 * `finder.js` and `steps.js`, which are pure and tested without a
 * browser.
 *
 * @typedef {{ value: string, label: string, doc?: string, meta?: string, badge?: string }} Choice
 */

/**
 * A radio group drawn as cards: title, optional id line, optional
 * badge, description, whole card clickable.
 *
 * A `<select>` would do the same job in a tenth of the markup, and it
 * is what these controls were. It also hides every option but one
 * behind a click, which is exactly wrong for the questions that
 * decide what gets scaffolded — "fullstack, backend or frontend?" and
 * "which capability do I want next?" are questions you answer by
 * reading the answers.
 *
 * @param {{ id: string, chosen: string, choices: Choice[], onChange: (value: string) => void }} spec
 */
export function cards({ id, chosen, choices, onChange }) {
  const group = document.createElement('div');
  group.className = 'cards';
  group.id = id;
  group.setAttribute('role', 'radiogroup');
  for (const choice of choices) {
    const card = document.createElement('label');
    card.className = choice.value === chosen ? 'card chosen' : 'card';
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = id;
    input.value = choice.value;
    input.checked = choice.value === chosen;
    input.addEventListener('change', () => onChange(input.value));
    card.append(input, body(choice));
    group.append(card);
  }
  return group;
}

/**
 * The same cards, checkable rather than exclusive — for a step where
 * every subset of what it shows is a legal answer.
 *
 * `onChange` gets the whole new set, in the order the choices are
 * listed rather than the order they were clicked, so the same
 * selection always encodes the same way.
 *
 * @param {{ id: string, chosen: string[], choices: Choice[], onChange: (values: string[]) => void }} spec
 */
export function checkboxCards({ id, chosen, choices, onChange }) {
  const group = document.createElement('div');
  group.className = 'cards';
  group.id = id;
  const picked = new Set(chosen);
  for (const choice of choices) {
    const card = document.createElement('label');
    card.className = picked.has(choice.value) ? 'card chosen' : 'card';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = choice.value;
    input.checked = picked.has(choice.value);
    input.addEventListener('change', () => {
      onChange(
        choices
          .map((candidate) => candidate.value)
          .filter((value) => (value === choice.value ? input.checked : picked.has(value))),
      );
    });
    card.append(input, body(choice));
    group.append(card);
  }
  return group;
}

/** A card's text column: title (with its badge), id line, description. */
function body(choice) {
  const column = document.createElement('span');
  column.className = 'card-body';

  const heading = document.createElement('span');
  heading.className = 'card-heading';
  const title = document.createElement('span');
  title.className = 'card-title';
  title.textContent = choice.label;
  heading.append(title);
  if (choice.badge) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = choice.badge;
    heading.append(badge);
  }
  column.append(heading);

  // The id, where the card stands for something the CLI also names.
  // It is what `keel add <id>` takes, so a page that showed only the
  // title would leave the two halves of keel spelling the same
  // capability differently.
  if (choice.meta) {
    const meta = document.createElement('span');
    meta.className = 'muted mono';
    meta.textContent = choice.meta;
    column.append(meta);
  }
  if (choice.doc) {
    const doc = document.createElement('span');
    doc.className = 'muted';
    doc.textContent = choice.doc;
    column.append(doc);
  }
  return column;
}

/** A muted line of prose, for a step with something to say and nothing to ask. */
export function note(text) {
  const paragraph = document.createElement('p');
  paragraph.className = 'muted';
  paragraph.textContent = text;
  return paragraph;
}
