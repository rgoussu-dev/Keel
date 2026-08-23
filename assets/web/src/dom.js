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
 * Below the cards sit the smaller shapes the wizard's other halves
 * need — `el`, the builder everything else is written in; `icon`;
 * `prose`/`help` for the documentation strings keel writes for a
 * terminal; and `field`/`select` for the adapters' own questions,
 * which are free text and one-of-many rather than decisions about
 * what gets scaffolded, and so are the one place a `<select>` is
 * still the right control.
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

/* ================================================================ *
 * The smaller shapes                                                *
 * ================================================================ */

/**
 * Builds an element.
 *
 * `class`, `text`, `html` and `attrs` are handled specially;
 * everything else is assigned as a property, which is what makes
 * `checked`, `value` and `disabled` work without a table of which
 * ones are attributes.
 *
 * `html` is accepted only so a caption can carry emphasis; never pass
 * it a value that came off the wire.
 *
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node|string|null|undefined|false)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (name === 'class') node.className = String(value);
    else if (name === 'text') node.textContent = String(value);
    else if (name === 'html') node.innerHTML = String(value);
    else if (name === 'attrs') {
      for (const [key, raw] of Object.entries(/** @type {object} */ (value))) {
        if (raw !== undefined && raw !== null) node.setAttribute(key, String(raw));
      }
    } else if (name === 'on') {
      for (const [event, handler] of Object.entries(/** @type {object} */ (value))) {
        node.addEventListener(event, /** @type {EventListener} */ (handler));
      }
    } else node[name] = value;
  }
  node.append(
    ...children.filter((child) => child !== null && child !== undefined && child !== false),
  );
  return node;
}

/**
 * The page's icon set, inline so the page stays one HTTP request per
 * file and nothing 404s on a machine with no network.
 *
 * `currentColor` throughout, sized in `em`, so an icon is typography
 * rather than an image.
 */
const PATHS = {
  folder:
    'M2 4.5A1.5 1.5 0 0 1 3.5 3h3l1.5 2h5A1.5 1.5 0 0 1 14.5 6.5v5A1.5 1.5 0 0 1 13 13H3.5A1.5 1.5 0 0 1 2 11.5z',
  up: 'M8 3.5 3.5 8m4.5-4.5L12.5 8M8 3.5V13',
  chevron: 'm6 4 4 4-4 4',
  copy: 'M5.5 5.5V3.2c0-.4.3-.7.7-.7h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7h-2.3M3.2 5.5h6.6c.4 0 .7.3.7.7v6.6c0 .4-.3.7-.7.7H3.2a.7.7 0 0 1-.7-.7V6.2c0-.4.3-.7.7-.7Z',
  check: 'm3 8.5 3.5 3.5L13 5',
  warn: 'M8 5.5v3.5M8 11.2v.3M2.6 12.4 7 3.6a1.1 1.1 0 0 1 2 0l4.4 8.8a1.1 1.1 0 0 1-1 1.6H3.6a1.1 1.1 0 0 1-1-1.6Z',
  terminal: 'm3 4.5 3.5 3.5L3 11.5M8.5 11.5H13',
};

/**
 * An inline SVG glyph.
 *
 * @param {keyof typeof PATHS} name
 * @param {string} [className]
 * @returns {SVGElement}
 */
export function icon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '1em');
  svg.setAttribute('height', '1em');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.4');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className !== '') svg.setAttribute('class', className);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

/**
 * Text with the backtick spans it was written with rendered as code.
 *
 * keel's own documentation strings are written for a terminal, where
 * `` `git init -b` `` is the convention for "this is a literal". In a
 * browser those backticks are just punctuation in the way, and the
 * markup they were asking for costs one split.
 *
 * Built from text nodes, never `innerHTML`: the strings come off the
 * wire.
 *
 * @param {string} text
 * @returns {DocumentFragment}
 */
export function prose(text) {
  const fragment = document.createDocumentFragment();
  text.split('`').forEach((part, index) => {
    if (part === '') return;
    fragment.append(index % 2 === 1 ? el('code', { text: part }) : document.createTextNode(part));
  });
  return fragment;
}

/** A help paragraph, with its backtick spans rendered. */
export const help = (text, style = null) => el('p', { class: 'help', style }, prose(text));

/**
 * A labelled control with optional help text and an optional dim tag
 * on the label's trailing edge.
 *
 * The tag is where the adapter attribution goes — information a
 * scripting user needs (it is what `--set adapterId:questionId=`
 * names) and a clicking user does not, so it sits at the end of the
 * label line rather than as a third paragraph under the field.
 *
 * @param {{ id: string, label: string, control: HTMLElement,
 *           doc?: string, tag?: string|null }} spec
 * @returns {HTMLElement}
 */
export function field({ id, label, control, doc = '', tag = null }) {
  const caption = el('label', { text: label, attrs: { for: id } });
  const head = el(
    'div',
    { class: 'field-label' },
    caption,
    tag ? el('span', { class: 'tag-mono', text: tag, title: 'answer key for --set' }) : null,
  );
  return el(
    'div',
    { class: 'field' },
    head,
    control,
    doc !== '' ? help(doc, 'margin-block-start: var(--s-3)') : null,
  );
}

/**
 * A `<select>` with its options, chosen value and change handler.
 *
 * @param {{ id: string, value: string,
 *           choices: { value: string, label: string, doc?: string }[],
 *           onChange: (value: string) => void }} spec
 * @returns {HTMLSelectElement}
 */
export function select({ id, value, choices, onChange }) {
  const node = el('select', { id });
  for (const choice of choices) {
    node.append(el('option', { value: choice.value, text: choice.label, title: choice.doc ?? '' }));
  }
  node.value = value;
  node.addEventListener('change', () => onChange(node.value));
  return node;
}
