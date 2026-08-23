/**
 * `<keel-app>` — the page's one stateful element.
 *
 * Everything below it is a view: data in as properties, intent out as
 * a `CustomEvent`. This is where the state lives and where the
 * preview loop runs.
 *
 * **The loop.** keel's question set is a function of the answers
 * already given — an adapter is only asked once its predicate
 * matched, and a predicate reads tags an earlier answer folded in —
 * so there is no static form to render. Instead: settle the dials,
 * preview, render what came back, fold a changed answer into the
 * state, do it again. It converges because each pass resolves exactly
 * the way the install would. Requests are debounced and sequenced,
 * and a late reply from a superseded request is dropped rather than
 * rendered over a newer one.
 *
 * **Dials before preview**, and in that order for a reason. A rule
 * can name two dials at once (`Conflict` in the composition
 * contract), so which build systems a stack offers is not a property
 * of the stack — it is a property of the combination. `keel.dials`
 * answers that, and it answers even where the combination is already
 * illegal, which is what lets the page correct itself instead of
 * previewing into a refusal it cannot navigate out of. Its reply is
 * adopted whole: the target it hands back is the one the page renders
 * from, previews and finally posts.
 *
 * **The mode.** Pointing at a directory decides everything. No
 * manifest there and only `keel new` applies; a manifest and the page
 * becomes the brownfield one, offering what that project can actually
 * take.
 *
 * **The shell, and why the children are kept rather than rebuilt.**
 * The layout is an application shell — masthead, location bar, then a
 * form column and a plan column that scroll independently — because
 * the plan is the whole reason this front end exists over a flag, and
 * a plan that scrolls away while you move the dials above it is not
 * doing that job. The children are created once and updated through
 * their properties for the same class of reason: replacing the form
 * subtree on every preview took the caret out of whatever field was
 * being typed in and reset the tree's scroll position, both of which
 * read as the page fighting the user.
 */

import * as api from '../api.js';
import { el, icon } from '../dom.js';
import { defaultStack } from '../finder.js';

/** How long to wait after a change before re-previewing. */
const DEBOUNCE_MS = 120;

export class KeelApp extends HTMLElement {
  #catalog = null;
  #dials = null;
  #listing = null;
  #status = null;
  #cwd = '';
  #target = null;
  #answers = {};
  #preview = null;
  #report = null;
  #error = null;
  #busy = false;
  #stale = false;
  #timer = null;
  /** The document-level shortcut listener, kept so it can be removed. */
  #onKeydown = null;
  /** Monotonic request id; a reply older than this one is discarded. */
  #generation = 0;

  connectedCallback() {
    this.#scaffold();
    this.addEventListener('target-chosen', (event) => void this.#goTo(event.detail.path));
    this.addEventListener('target-changed', (event) => this.#retarget(event.detail));
    this.addEventListener('question-answered', (event) => this.#answer(event.detail));
    this.addEventListener('install-requested', () => void this.#install());
    this.#onKeydown = (event) => {
      // The form has no submit button of its own — every control
      // commits on change — so the shortcut is the keyboard path to
      // the one irreversible action on the page.
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        if (this.#ready() && !this.#busy && this.#preview !== null) void this.#install();
      }
    };
    document.addEventListener('keydown', this.#onKeydown);
    void this.#boot();
  }

  disconnectedCallback() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    if (this.#onKeydown) document.removeEventListener('keydown', this.#onKeydown);
  }

  /* ---- data ---------------------------------------------------- */

  async #boot() {
    const [catalog, listing] = await Promise.all([api.catalog(), api.browse()]);
    if (!catalog.ok) return this.#fail(catalog.error);
    if (!listing.ok) return this.#fail(listing.error);
    this.#catalog = catalog.value;
    await this.#goTo(listing.value.path);
  }

  /** Points the whole page at a directory and rebuilds the target. */
  async #goTo(path) {
    this.#cwd = path;
    this.#error = null;
    this.#report = null;
    const [listing, status] = await Promise.all([api.browse(path), api.project(path)]);
    if (!listing.ok) return this.#fail(listing.error);
    if (!status.ok) return this.#fail(status.error);
    this.#listing = listing.value;
    this.#status = status.value;
    this.#answers = {};
    this.#target = this.#status.initialised ? this.#defaultAddTarget() : this.#defaultNewTarget();
    this.#dials = null;
    this.#preview = null;
    this.#render();
    this.#previewSoon();
  }

  /**
   * Where the greenfield form opens: the preset the finder's defaults
   * compose to, which is the one an omitted `--stack` resolves to in
   * a terminal. Falling back to the first of `stacks` would open on a
   * fullstack product — alphabetically first, and a two-service
   * product is the last thing a blank form should presume.
   *
   * The dials are left off it. They still have to be *set* before the
   * body is posted — an absent dial is one the install would ask
   * about, and the answer would have nowhere to go but a control that
   * had already disappeared — but which values are legal depends on
   * the combination, so filling them here from the catalog is exactly
   * the guess that produced a body `POST /api/install` refuses.
   * `keel.dials` fills them instead, on the way to every preview.
   */
  #defaultNewTarget() {
    const stack = defaultStack(this.#catalog.finder) ?? this.#catalog.stacks[0]?.id;
    return { kind: 'new-project', stack };
  }

  #defaultAddTarget() {
    const first = this.#status.available[0] ?? this.#status.installed[0];
    return {
      kind: 'add-vertical',
      vertical: first?.id ?? '',
      ...(first && this.#status.available.length === 0 ? { reapply: true } : {}),
    };
  }

  /* ---- intent -------------------------------------------------- */

  #retarget(patch) {
    if (patch.kind !== undefined && patch.kind !== this.#target.kind) {
      this.#target = patch;
      this.#answers = {};
      this.#dials = null;
    } else if (this.#target.kind === 'new-project') {
      const changingStack = patch.stack !== undefined && patch.stack !== this.#target.stack;
      // A different stack means different adapters, so the answers
      // gathered for the old one are meaningless — and re-sending
      // them would pin a value the new stack never asked for.
      if (changingStack) this.#answers = {};
      this.#target = changingStack
        ? { kind: 'new-project', stack: patch.stack }
        : { ...this.#target, ...patch };
      // The old stack's menus describe nothing about the new one, and
      // a control rendered from them would offer a build system this
      // preset has never heard of.
      if (changingStack) this.#dials = null;
    } else {
      this.#target = { ...this.#target, ...patch };
    }
    this.#report = null;
    this.#render();
    this.#previewSoon();
  }

  #answer({ binding, value }) {
    if (binding.kind === 'answer') {
      this.#answers = {
        ...this.#answers,
        [binding.adapter]: { ...(this.#answers[binding.adapter] ?? {}), [binding.question]: value },
      };
    } else if (binding.kind === 'buildSystem' && binding.service !== undefined) {
      this.#retarget({ buildSystem: `${binding.service}=${value}` });
      return;
    } else if (binding.kind === 'withPeerContext') {
      this.#retarget({ withPeerContext: value === 'yes' });
      return;
    } else if (binding.kind === 'extraVerticals') {
      // A set answer: comma-joined on the wire, a list in the target.
      this.#retarget({
        extraVerticals: value
          .split(',')
          .map((id) => id.trim())
          .filter((id) => id.length > 0),
      });
      return;
    } else {
      this.#retarget({ [binding.kind]: value });
      return;
    }
    this.#report = null;
    this.#render();
    this.#previewSoon();
  }

  /* ---- the preview loop ---------------------------------------- */

  #previewSoon() {
    if (this.#timer !== null) clearTimeout(this.#timer);
    this.#stale = this.#preview !== null;
    this.#timer = setTimeout(() => void this.#refresh(), DEBOUNCE_MS);
  }

  async #refresh() {
    this.#timer = null;
    if (!this.#target || this.#cwd === '') return;
    // A half-filled target is not an error to report, it is a form
    // still being filled: previewing it would ask the API to validate
    // an empty context name and answer 400 for something the user is
    // in the middle of typing.
    if (!this.#complete()) {
      this.#generation += 1;
      this.#dials = null;
      this.#preview = null;
      this.#error = null;
      this.#stale = false;
      this.#render();
      return;
    }
    const generation = ++this.#generation;
    // Settle the dials first, and preview the target that came back.
    // Previewing the unsettled one would ask the engine to resolve a
    // combination the menus are about to rule out — a 422 rendered
    // over a form whose controls have already moved on.
    if (this.#target.kind === 'new-project') {
      const dials = await api.dials(this.#body());
      if (generation !== this.#generation) return;
      if (!dials.ok) return this.#fail(dials.error);
      this.#dials = dials.value;
      this.#target = dials.value.target;
      this.#render();
    }
    const result = await api.preview(this.#body());
    if (generation !== this.#generation) return;
    if (result.ok) {
      this.#preview = result.value;
      this.#error = null;
    } else {
      this.#preview = null;
      this.#error = result.error;
    }
    this.#stale = false;
    this.#render();
  }

  async #install() {
    this.#busy = true;
    this.#error = null;
    this.#render();
    const result = await api.install(this.#body());
    this.#busy = false;
    if (!result.ok) {
      this.#error = result.error;
      this.#render();
      return;
    }
    this.#report = result.value;
    // The project just changed underneath us: re-read it so the page
    // becomes the brownfield one, offering what is left to add.
    await this.#goTo(this.#cwd);
    this.#report = result.value;
    this.#render();
  }

  #body() {
    return { cwd: this.#cwd, target: this.#target, answers: this.#answers };
  }

  #fail(error) {
    this.#error = error;
    this.#render();
  }

  /* ---- rendering ----------------------------------------------- */

  /**
   * The shell, built once.
   *
   * Every region below is addressed by `data-role` and updated in
   * place. Nothing here is re-created on a render, which is what
   * keeps a caret in the field being typed in and the plan's scroll
   * position where the reader left it.
   */
  #scaffold() {
    this.replaceChildren(
      el(
        'header',
        { class: 'masthead' },
        el(
          'div',
          { class: 'wordmark' },
          el('span', { class: 'mark', text: 'keel' }),
          el('span', { class: 'tagline', text: 'local scaffolder' }),
        ),
        el('div', { class: 'masthead-meta', attrs: { 'data-role': 'meta' } }),
      ),
      el(
        'div',
        { class: 'locationbar' },
        el('keel-target-picker', { attrs: { 'data-role': 'picker' } }),
      ),
      el(
        'div',
        { class: 'workspace' },
        el(
          'div',
          { class: 'column' },
          el(
            'stack-pk',
            { attrs: { space: 'var(--s1)' } },
            el('div', { attrs: { 'data-role': 'error' }, hidden: true }),
            el(
              'section',
              { attrs: { 'data-role': 'form' } },
              el(
                'div',
                { class: 'section-head' },
                el('h2', { attrs: { 'data-role': 'form-heading' } }),
                el('span', { class: 'muted', attrs: { 'data-role': 'form-note' } }),
              ),
              el('div', { attrs: { 'data-role': 'form-host' } }),
            ),
            el('keel-question-list'),
          ),
        ),
        el('div', { class: 'column aside' }, el('keel-plan')),
      ),
    );
  }

  #render() {
    const picker = this.querySelector('keel-target-picker');
    if (picker) picker.listing = this.#listing;

    this.#renderMeta();
    this.#renderError();
    this.#renderForm();

    const plan = this.querySelector('keel-plan');
    if (plan) {
      plan.preview = this.#preview;
      plan.report = this.#report;
      plan.busy = this.#busy;
      plan.stale = this.#stale;
      plan.ready = this.#ready();
      plan.hint = this.#hint();
      plan.body = this.#body();
    }
  }

  /**
   * The masthead's right-hand side: what mode the page is in, and
   * what the current directory already holds.
   *
   * Both are answers the page had already computed and was showing
   * nowhere — the mode only implicitly, through which form appeared
   * halfway down the column.
   */
  #renderMeta() {
    const host = this.querySelector('[data-role="meta"]');
    if (!host) return;
    const chips = [];
    if (this.#status !== null) {
      chips.push(
        el(
          'span',
          { class: 'chip accent' },
          el('span', { class: 'dot' }),
          el('span', {
            text: this.#status.initialised ? 'keel project' : 'new project',
          }),
        ),
      );
    }
    if (this.#status?.initialised) {
      const installed = this.#status.installed.length;
      chips.push(
        el('span', {
          class: 'chip',
          text: `${installed} vertical${installed === 1 ? '' : 's'} installed`,
        }),
      );
      if (this.#status.modules.length > 0) {
        chips.push(
          el('span', {
            class: 'chip',
            text: `${this.#status.modules.length} context${
              this.#status.modules.length === 1 ? '' : 's'
            }`,
          }),
        );
      }
    }
    host.replaceChildren(...chips);
  }

  #ready() {
    return this.#complete() && this.#error === null;
  }

  /** Whether the target carries every field its command requires. */
  #complete() {
    if (this.#target === null) return false;
    if (this.#target.kind === 'add-module') return (this.#target.module ?? '') !== '';
    if (this.#target.kind === 'add-vertical') return (this.#target.vertical ?? '') !== '';
    return (this.#target.stack ?? '') !== '';
  }

  /** What the plan shows instead of a tree while the form is incomplete. */
  #hint() {
    if (this.#complete()) return '';
    if (this.#target?.kind === 'add-module') return 'Name the context to see its plan.';
    if (this.#target?.kind === 'add-vertical') return 'Pick a vertical to see its plan.';
    return '';
  }

  #renderError() {
    const box = this.querySelector('[data-role="error"]');
    if (!box) return;
    box.hidden = this.#error === null;
    box.replaceChildren();
    if (this.#error === null) return;
    box.className = 'banner error';
    box.append(
      el('span', { class: 'banner-icon' }, icon('warn')),
      el(
        'span',
        {},
        el('span', { class: 'banner-title', text: this.#error.message }),
        el('span', { class: 'code', text: this.#error.code }),
      ),
    );
  }

  /**
   * The form column, updated rather than rebuilt.
   *
   * The greenfield and brownfield forms are different elements, so
   * one of them is created when the mode changes and kept for as long
   * as the mode holds.
   */
  #renderForm() {
    const host = this.querySelector('[data-role="form-host"]');
    if (!host || this.#target === null) return;
    const brownfield = this.#status?.initialised === true;

    const heading = this.querySelector('[data-role="form-heading"]');
    if (heading) heading.textContent = brownfield ? 'Add to this project' : 'New project';
    const note = this.querySelector('[data-role="form-note"]');
    if (note) {
      note.textContent = brownfield
        ? 'Layered onto what the manifest already records'
        : 'Everything below is a dial on one command';
    }

    const wanted = brownfield ? 'keel-add-form' : 'keel-new-form';
    let form = host.firstElementChild;
    if (!form || form.tagName.toLowerCase() !== wanted) {
      form = document.createElement(wanted);
      host.replaceChildren(form);
    }
    if (brownfield) {
      form.status = this.#status;
      form.target = this.#target;
    } else {
      form.catalog = this.#catalog;
      form.dials = this.#dials;
      form.target = this.#target;
    }

    const questions = this.querySelector('keel-question-list');
    // The element heads its own sections: a preview answers with one
    // flat list, and which of them is a field of the command and
    // which is an adapter's detail is a reading of the bindings that
    // only it does.
    if (questions) questions.questions = this.#preview?.questions ?? [];
  }
}
