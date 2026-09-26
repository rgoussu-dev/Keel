/**
 * `<keel-add-form>` — a keel project's middle steps, one at a time:
 * **Project**, what it already is, and **Options**, what goes on top of
 * it — or a bounded context, or the entrypoint it lacks.
 *
 * The page used to have a step of its own here, "What to add", beside
 * a new project's Options: two controls asking one question — what
 * else goes in? — one per phase. The directory now decides which flow
 * the rail is (`../steps.js`). On a keel project the preset steps
 * collapse into **Project**: its settled choices, read back from its
 * manifest in words (`../project.js`), and nothing to change but its
 * ways in — the Adapters line offers the back entrypoint the project
 * lacks where `keel add entrypoint` would add it. Then
 * **Options** draws the very "Also scaffold" group a new project's
 * Options step draws its extras in (`../dom.js`'s `alsoScaffold`), in
 * the parts `../additions.js` reads off the project status — each
 * answer there the one the command's own front door gives, read before
 * the click rather than met after it:
 *
 *   - **Ready**, **Needs another capability first** — checkboxes, and
 *     several at a time: one plan, one Generate, `keel add` of what the
 *     ticks add and nothing else. A "needs" card's badge names what it
 *     needs by title, and ticking it ticks them.
 *   - **Proposed re-renders** — an installed vertical the run changes
 *     and would leave as it was, as a toggle, once the preview has said
 *     so.
 *   - **After adding an entrypoint** — what only an entrypoint the
 *     project can grow stops, under that entrypoint's **Add** button,
 *     each saying whether it comes with it or is added after it: the
 *     refusal's action, taken where the refusal is read.
 *   - **Installed** — what the project has, ticked and locked, where a
 *     new project's group lists what its preset comes with: a
 *     **Re-render** beside each vertical `keel add --reapply` names, a
 *     run of its own, never a box in the add's set; a product's glue or
 *     a bounded context, which no `keel add` names, without one; what a
 *     monorepo service has from its product, saying where from.
 *   - **In its services** — at a product root, what its services have
 *     that the root does not carry, locked the same way and naming
 *     them: adding one is an Ok that adds nothing, not a refusal, so it
 *     is not under _Belongs in a service_.
 *   - **Not for this project** — collapsed, one sentence each, the
 *     refusal `keel add` would give. Not a control: there is nothing to
 *     pick.
 *   - **Belongs in a service** — at a product root, an **Open
 *     backend/** button per service, which points the page there
 *     (`service-opened`), then what goes one directory down and the
 *     sentence naming where.
 *
 * **A card per capability, not a line in a `<select>`.** Which
 * vertical to add next is the one real question this half of the page
 * asks, and an id in a dropdown is a poor way to ask it: `iac` and
 * `dev-env` mean nothing until you have read what they buy you. Each
 * card names the concept it bears, the id `keel add <id>` takes, and
 * one line on what installing it gets you — all three from the
 * catalog, so a plugin's vertical reads the same way keel's own do.
 *
 * `keel add module`'s tab is always there, and disabled with its
 * reason where the project status says the command would refuse —
 * the flat layout, a product root — rather than missing, which said
 * nothing about why. `keel add entrypoint`'s is there wherever the
 * project lacks a back entrypoint, disabled with its reason where the
 * command would refuse — a front end, a product, contexts wired into
 * the one entrypoint — and previewed and reviewed as a context is.
 * Every **Add HTTP server** on the page is that tab's target.
 *
 * A project written by another harness generation says so once, at
 * the top of Options (`../project.js`), rather than on every card it
 * refuses.
 *
 * Status, target, preview and step in as properties. Out:
 * `target-changed` with a **whole** target for the tabs and the context
 * form — a patch merged into the old target is how a re-render flag
 * used to outlive the card that set it — and, for the gestures, which
 * vertical moved and how: `vertical-toggled`, `rerender-requested`,
 * `refresh-toggled`; and `service-opened` with the directory of the
 * service to open. What else a gesture moves is `../target.js`'s
 * answer.
 */

import {
  alsoScaffold,
  cards,
  el,
  focusIn,
  lockedPart,
  note,
  refocus,
  refusedList,
  sentence,
  tickPart,
} from '../dom.js';
import { additionsGroup, entrypointNotes, refreshChoices } from '../additions.js';
import { entrypointOffers, harnessNotice, projectSummary } from '../project.js';
import { OPTIONS, PROJECT } from '../steps.js';

export class KeelAddForm extends HTMLElement {
  #status = null;
  #target = null;
  #preview = null;
  #step = OPTIONS;
  /** Whether "Not for this project" is open — the reader's, kept across redraws. */
  #refusedOpen = false;

  /** @param {object} value the `/api/project` payload */
  set status(value) {
    if (value === this.#status) return;
    this.#status = value;
    this.#render();
  }

  /** @param {object} value the current add-vertical / add-module / add-entrypoint target */
  set target(value) {
    if (value === this.#target) return;
    this.#target = value;
    this.#render();
  }

  /** @param {object|null} value the last preview, for the re-renders it proposes */
  set preview(value) {
    if (value === this.#preview) return;
    this.#preview = value;
    this.#render();
  }

  /** @param {string} value which step to render — `project` or `options`; see `../steps.js` */
  set step(value) {
    if (value === this.#step) return;
    this.#step = value;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { bubbles: true, detail }));
  }

  #render() {
    if (!this.isConnected || !this.#status || !this.#target) return;
    const focused = focusIn(this);
    const form = el('stack-pk', { attrs: { space: 'var(--s0)' } });
    form.append(...(this.#step === PROJECT ? this.#projectFields() : this.#optionFields()));
    this.replaceChildren(form);
    refocus(this, focused);
  }

  /**
   * What the project already is — where a new project's preset steps
   * ask it — as a summary with nothing to change but its ways in: the
   * preset it reads as and the choices that made it, the back
   * entrypoint it can grow offered on its Adapters line, its services
   * and contexts, then what it has installed.
   */
  #projectFields() {
    const summary = projectSummary(this.#status);
    return [
      el(
        'dl',
        { id: 'project-profile', class: 'summary' },
        ...summary.rows.flatMap((row) => [
          el('dt', { text: row.label }),
          el(
            'dd',
            {},
            el('span', { class: 'mono', text: row.value }),
            ...(row.offers ?? []).map((offer) =>
              this.#entrypointButton(`offer-entrypoint-${offer.word}`, offer),
            ),
          ),
        ]),
      ),
      el(
        'div',
        { class: 'project-installed' },
        el('h4', { id: 'project-installed-title', text: 'Installed' }),
        el(
          'ul',
          {
            id: 'project-installed',
            class: 'plain chips',
            attrs: { 'aria-labelledby': 'project-installed-title' },
          },
          ...summary.installed.map((vertical) =>
            el('li', { class: 'chip', text: vertical.title, attrs: { 'data-id': vertical.id } }),
          ),
        ),
      ),
    ];
  }

  /** What goes on top, or a bounded context: the tabs, then the one the target is on. */
  #optionFields() {
    const fields = [];
    // Once, above everything it stops: a project from another harness
    // generation refuses every card but the harness's own — and, at a
    // product root, that one too. A note, not
    // a live region: it does not change while the page is on this
    // project, and the form is rebuilt on every pick — a region
    // inserted anew each time would be announced on none of them, or
    // on every one, repeating a fact that has not moved.
    const stale = harnessNotice(this.#status);
    if (stale !== null) {
      fields.push(
        el('p', {
          class: 'error',
          text: stale,
          attrs: { role: 'note', 'data-role': 'harness-generation' },
        }),
      );
    }
    fields.push(...this.#kindField());
    fields.push(
      this.#target.kind === 'add-module'
        ? this.#moduleFields()
        : this.#target.kind === 'add-entrypoint'
          ? this.#entrypointFields()
          : this.#verticalFields(),
    );
    return fields;
  }

  /**
   * The button that grows the project by `offer`'s entrypoint — `keel
   * add entrypoint <word>` as the page's target — pressed while it is
   * the run. The Project step's Adapters line and each "After adding"
   * part carry one.
   */
  #entrypointButton(id, offer) {
    const pressed =
      this.#target.kind === 'add-entrypoint' && this.#target.entrypoint === offer.word;
    return el('button', {
      id,
      type: 'button',
      class: pressed ? 'primary' : '',
      text: `Add ${offer.name}`,
      attrs: { 'aria-pressed': String(pressed), title: offer.meta, 'data-word': offer.word },
      on: {
        click: () =>
          this.#emit('target-changed', { kind: 'add-entrypoint', entrypoint: offer.word }),
      },
    });
  }

  /**
   * The two tabs, and — where `keel add module` would be refused before
   * it reads a name — the reason, under a tab drawn disabled. A tab
   * already open does nothing: re-opening it would start its form over.
   */
  #kindField() {
    const kind = this.#target.kind;
    const refusal = this.#status.canAddModule ? null : this.#status.moduleRefusal;
    // The entrypoint tab opens on the first the project can grow, and is
    // off with the first one's reason where it can grow none.
    const offers = entrypointOffers(this.#status);
    const growable = offers.find((offer) => offer.refusal === null) ?? null;
    const row = el(
      'cluster-pk',
      { attrs: { space: 'var(--s-2)', role: 'group', 'aria-label': 'What to add' } },
      this.#tab('tab-vertical', 'Add verticals', kind === 'add-vertical', () =>
        this.#emit('target-changed', { kind: 'add-vertical', verticals: [] }),
      ),
      this.#tab('tab-module', 'Add a bounded context', kind === 'add-module', () =>
        this.#emit('target-changed', { kind: 'add-module', module: '' }),
      ),
      offers.length === 0
        ? null
        : this.#tab('tab-entrypoint', 'Add an entrypoint', kind === 'add-entrypoint', () =>
            this.#emit('target-changed', {
              kind: 'add-entrypoint',
              entrypoint: growable?.word ?? '',
            }),
          ),
    );
    const reasons = [];
    const module = row.querySelector('#tab-module');
    if (refusal && module instanceof HTMLButtonElement) {
      module.disabled = true;
      module.setAttribute('aria-describedby', 'module-refusal');
      reasons.push(
        el(
          'p',
          { id: 'module-refusal', class: 'muted', attrs: { 'data-role': 'module-refusal' } },
          sentence(refusal.message),
        ),
      );
    }
    const entrypoint = row.querySelector('#tab-entrypoint');
    const [first] = offers;
    if (growable === null && first?.refusal && entrypoint instanceof HTMLButtonElement) {
      entrypoint.disabled = true;
      entrypoint.setAttribute('aria-describedby', 'entrypoint-refusal');
      reasons.push(
        el(
          'p',
          {
            id: 'entrypoint-refusal',
            class: 'muted',
            attrs: { 'data-role': 'entrypoint-refusal' },
          },
          sentence(first.refusal),
        ),
      );
    }
    return [row, ...reasons];
  }

  #tab(id, label, active, onClick) {
    return el('button', {
      id,
      type: 'button',
      text: label,
      class: active ? 'primary' : '',
      attrs: { 'aria-pressed': String(active) },
      on: {
        click: () => {
          if (!active) onClick();
        },
      },
    });
  }

  /**
   * The "Also scaffold" group, on what this project has: the boxes that
   * tick, the re-renders the preview proposes, what is installed —
   * ticked and locked, each vertical with its **Re-render** — what the
   * project cannot take, and at a product root what belongs in a
   * service.
   */
  #verticalFields() {
    const group = additionsGroup(this.#status, this.#target);
    const nothing =
      group.ready.length +
        group.needs.length +
        group.grows.length +
        group.refused.length +
        group.elsewhere.length +
        group.services.length +
        group.installed.length +
        group.inServices.length ===
      0;
    if (nothing) return note('Nothing left to install here.');

    const tick = (id, ticked) => this.#emit('vertical-toggled', { id, ticked });
    const refresh = refreshChoices(this.#preview, this.#target, this.#status);
    return alsoScaffold({
      id: 'extras',
      title: 'Also scaffold',
      count: group.chosen.length,
      help: 'Installed in one run, on top of what this project has — `keel add` with each id ticked, and nothing else. A box that needs others ticks them too; what the project has is ticked for good, and a vertical of it is re-rendered from its own button.',
      parts: [
        group.ready.length === 0
          ? null
          : tickPart({
              id: 'extras-ready',
              title: 'Ready',
              choices: group.ready,
              chosen: group.chosen,
              onTick: tick,
            }),
        group.needs.length === 0
          ? null
          : tickPart({
              id: 'extras-needs',
              title: 'Needs another capability first',
              choices: group.needs,
              chosen: group.chosen,
              onTick: tick,
            }),
        refresh.length === 0
          ? null
          : tickPart({
              id: 'extras-refresh',
              title: 'Proposed re-renders',
              choices: refresh,
              chosen: this.#target.refresh ?? [],
              onTick: (id, ticked) => this.#emit('refresh-toggled', { id, ticked }),
              role: 'refresh',
            }),
        ...group.grows.map((grow) => this.#growPart(grow)),
        group.installed.length === 0
          ? null
          : lockedPart({
              id: 'extras-installed',
              title: 'Installed',
              items: group.installed.map((vertical) => ({
                ...vertical,
                chosen: vertical.pressed,
                action: vertical.rerender ? this.#rerenderButton(vertical) : null,
              })),
            }),
        group.inServices.length === 0
          ? null
          : lockedPart({
              id: 'extras-in-services',
              title: 'In its services',
              items: group.inServices,
            }),
        group.refused.length === 0
          ? null
          : refusedList({
              id: 'extras-refused',
              title: 'Not for this project',
              items: group.refused,
              open: this.#refusedOpen,
              onToggle: (open) => (this.#refusedOpen = open),
            }),
        this.#elsewhereField(group.services, group.elsewhere),
        group.rerendering === null
          ? null
          : note(
              'Already installed, so this is a re-render from the answers the manifest recorded. Template-owned files are rewritten; a patch that would touch an already-patched file refuses the whole run.',
            ),
      ],
    });
  }

  /**
   * What only an entrypoint the project can grow stops, under the
   * action its refusal names: **Add HTTP server**, the command, then
   * each vertical and what the entrypoint makes of it. Open, not
   * collapsed: unlike "not for this project" it is for this project,
   * one command away.
   */
  #growPart(grow) {
    const id = `extras-grow-${grow.word}`;
    return el(
      'stack-pk',
      { id, attrs: { space: 'var(--s-2)', 'data-role': 'grow', 'data-word': grow.word } },
      el('h4', { id: `${id}-title`, text: `After adding ${grow.name}` }),
      el(
        'cluster-pk',
        { attrs: { space: 'var(--s-2)', align: 'center' } },
        this.#entrypointButton(`grow-${grow.word}`, grow),
        el('code', { class: 'mono muted', text: grow.meta }),
      ),
      el(
        'ul',
        { class: 'plain refused-list', attrs: { 'aria-labelledby': `${id}-title` } },
        ...grow.items.map((item) =>
          el(
            'li',
            { attrs: { 'data-id': item.id } },
            el('span', { class: 'refused-title', text: item.title }),
            el('span', { class: 'muted', text: item.note }),
          ),
        ),
      ),
    );
  }

  /**
   * The entrypoint the run adds, as cards to choose among — one on
   * every project keel ships, which lacks one back entrypoint — then
   * what it does to the project, what it installs and what it lets in
   * after, by title (`../additions.js`' `entrypointNotes`). Nothing
   * else to answer: its questions are the plan's, on the Questions step.
   */
  #entrypointFields() {
    const offers = entrypointOffers(this.#status).filter((offer) => offer.refusal === null);
    const { summary, notes } = entrypointNotes(this.#status, this.#target.entrypoint ?? '');
    return el(
      'stack-pk',
      { attrs: { space: 'var(--s0)' } },
      cards({
        id: 'entrypoint',
        chosen: this.#target.entrypoint ?? '',
        choices: offers.map((offer) => ({
          value: offer.word,
          label: offer.name,
          meta: offer.meta,
          doc: offer.gloss,
        })),
        onChange: (word) =>
          this.#emit('target-changed', { kind: 'add-entrypoint', entrypoint: word }),
      }),
      el('p', { class: 'muted', text: summary }),
      ...notes.map((line) => note(line)),
    );
  }

  /**
   * An installed vertical's **Re-render**: `keel add <id> --reapply`,
   * a run of its own, pressed while it is the run.
   */
  #rerenderButton(vertical) {
    return el('button', {
      id: `rerender-${vertical.value}`,
      type: 'button',
      class: vertical.pressed ? 'primary' : 'ghost',
      text: 'Re-render',
      attrs: {
        'aria-pressed': String(vertical.pressed),
        'aria-label': `Re-render ${vertical.label}`,
      },
      on: { click: () => this.#emit('rerender-requested', { id: vertical.value }) },
    });
  }

  /**
   * At a product root, a way into each service, then what belongs in
   * one of them — each with the sentence naming which. Open, not
   * collapsed: unlike "not for this project" it is a direction, one
   * directory down, and the buttons take it.
   */
  #elsewhereField(services, elsewhere) {
    if (services.length + elsewhere.length === 0) return null;
    return el(
      'div',
      { id: 'extras-elsewhere' },
      el('h4', { id: 'extras-elsewhere-title', text: 'Belongs in a service' }),
      services.length === 0
        ? null
        : el(
            'cluster-pk',
            {
              id: 'extras-services',
              attrs: { space: 'var(--s-2)', role: 'group', 'aria-label': 'Open a service' },
            },
            ...services.map((service) =>
              el('button', {
                type: 'button',
                class: 'ghost',
                text: service.label,
                attrs: { 'data-path': service.path },
                on: { click: () => this.#emit('service-opened', { path: service.path }) },
              }),
            ),
          ),
      elsewhere.length === 0
        ? null
        : el(
            'ul',
            {
              class: 'plain refused-list',
              attrs: { 'aria-labelledby': 'extras-elsewhere-title' },
            },
            ...elsewhere.map((item) =>
              el(
                'li',
                { attrs: { 'data-id': item.id } },
                el('span', { class: 'refused-title', text: item.title }),
                el('span', { class: 'muted' }, sentence(item.sentence)),
              ),
            ),
          ),
    );
  }

  #moduleFields() {
    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');

    const name = document.createElement('input');
    name.type = 'text';
    name.id = 'module';
    name.value = this.#target.module ?? '';
    name.placeholder = 'billing';
    name.addEventListener('change', () =>
      this.#emit('target-changed', { ...this.#target, module: name.value.trim() }),
    );

    const label = document.createElement('label');
    label.setAttribute('for', 'module');
    label.textContent = 'Context name';
    const doc = document.createElement('p');
    doc.className = 'muted';
    doc.textContent = `One word — it becomes a directory and an identifier in every language the stack spells. Taken: ${
      this.#status.modules.map((module) => module.name).join(', ') || 'none'
    }.`;
    stack.append(label, name, doc);

    const consumable = this.#status.modules.filter((module) => module.seam);
    if (consumable.length > 0) {
      const select = document.createElement('select');
      select.id = 'consumes';
      select.append(option('', 'nothing — a standalone context'));
      for (const module of consumable) select.append(option(module.name, module.name));
      select.value = this.#target.consumes ?? '';
      select.addEventListener('change', () =>
        this.#emit('target-changed', {
          kind: 'add-module',
          module: this.#target.module ?? '',
          ...(select.value === '' ? {} : { consumes: select.value }),
        }),
      );
      const consumesLabel = document.createElement('label');
      consumesLabel.setAttribute('for', 'consumes');
      consumesLabel.textContent = 'Consumes';
      const consumesDoc = document.createElement('p');
      consumesDoc.className = 'muted';
      consumesDoc.textContent =
        'Emits a gateway reaching that context through its user-side/service seam. Only contexts publishing one are listed.';
      stack.append(consumesLabel, select, consumesDoc);
    }
    return stack;
  }
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}
