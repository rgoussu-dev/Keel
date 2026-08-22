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
 * so there is no static form to render. Instead: preview, render what
 * came back, fold a changed answer into the state, preview again. It
 * converges because each pass resolves exactly the way the install
 * would. Requests are debounced and sequenced, and a late reply from
 * a superseded request is dropped rather than rendered over a newer
 * one.
 *
 * **The mode.** Pointing at a directory decides everything. No
 * manifest there and only `keel new` applies; a manifest and the page
 * becomes the brownfield one, offering what that project can actually
 * take.
 */

import * as api from '../api.js';

/** How long to wait after a change before re-previewing. */
const DEBOUNCE_MS = 120;

export class KeelApp extends HTMLElement {
  #catalog = null;
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
  /** Monotonic request id; a reply older than this one is discarded. */
  #generation = 0;

  connectedCallback() {
    this.#scaffold();
    this.addEventListener('target-chosen', (event) => void this.#goTo(event.detail.path));
    this.addEventListener('target-changed', (event) => this.#retarget(event.detail));
    this.addEventListener('question-answered', (event) => this.#answer(event.detail));
    this.addEventListener('install-requested', () => void this.#install());
    void this.#boot();
  }

  disconnectedCallback() {
    if (this.#timer !== null) clearTimeout(this.#timer);
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
    this.#preview = null;
    this.#render();
    this.#previewSoon();
  }

  #defaultNewTarget() {
    const stack = this.#catalog.stacks[0];
    return this.#withStackDefaults({ kind: 'new-project', stack: stack.id });
  }

  /**
   * Fills a new-project target's dials from the catalog.
   *
   * They are set rather than left absent on purpose: an absent dial is
   * one the install would *ask* about, and the answer would then have
   * nowhere to go but a control that had already disappeared. Pinning
   * the defaults up front keeps every stack-level choice on a catalog
   * control and every conditional one on a preview question.
   */
  #withStackDefaults(target) {
    const stack = this.#catalog.stacks.find((candidate) => candidate.id === target.stack);
    if (!stack) return target;
    if (stack.services.length > 0) {
      const pairs = stack.services
        .filter((service) => service.buildSystems.length > 0)
        .map((service) => `${service.path}=${service.buildSystems[0].id}`);
      return {
        kind: 'new-project',
        stack: stack.id,
        layout: target.layout ?? 'monorepo',
        ...(pairs.length > 0 ? { buildSystem: target.buildSystem ?? pairs.join(',') } : {}),
      };
    }
    const moduleLayout = target.moduleLayout ?? stack.moduleLayouts[0]?.id;
    return {
      kind: 'new-project',
      stack: stack.id,
      ...(stack.buildSystems.length > 0
        ? { buildSystem: target.buildSystem ?? stack.buildSystems[0].id }
        : {}),
      ...(moduleLayout === undefined ? {} : { moduleLayout }),
      ...(stack.peerContext && moduleLayout === 'modulith' && target.withPeerContext === true
        ? { withPeerContext: true }
        : {}),
    };
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
    } else if (this.#target.kind === 'new-project') {
      const changingStack = patch.stack !== undefined && patch.stack !== this.#target.stack;
      // A different stack means different adapters, so the answers
      // gathered for the old one are meaningless — and re-sending
      // them would pin a value the new stack never asked for.
      if (changingStack) this.#answers = {};
      this.#target = this.#withStackDefaults(
        changingStack ? { kind: 'new-project', stack: patch.stack } : { ...this.#target, ...patch },
      );
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
      this.#preview = null;
      this.#error = null;
      this.#stale = false;
      this.#render();
      return;
    }
    const generation = ++this.#generation;
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

  #scaffold() {
    this.innerHTML = `
      <stack-pk space="0">
        <header class="masthead">
          <center-pk maxwidth="72rem" gutters="var(--s0)">
            <cluster-pk space="var(--s0)" align="baseline">
              <h1 class="wordmark">keel</h1>
              <p class="muted" data-role="tagline">local scaffolder</p>
            </cluster-pk>
          </center-pk>
        </header>
        <center-pk maxwidth="72rem" gutters="var(--s0)">
          <stack-pk space="var(--s1)">
            <section class="panel">
              <stack-pk space="var(--s-1)">
                <h2>Project directory</h2>
                <keel-target-picker></keel-target-picker>
              </stack-pk>
            </section>
            <div data-role="error" hidden></div>
            <sidebar-pk side="right" sidewidth="26rem" contentwidth="55%" space="var(--s1)">
              <section data-role="form"></section>
              <keel-plan></keel-plan>
            </sidebar-pk>
          </stack-pk>
        </center-pk>
      </stack-pk>
    `;
  }

  #render() {
    const picker = this.querySelector('keel-target-picker');
    if (picker) picker.listing = this.#listing;

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
    }
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
    box.className = 'error';
    const code = document.createElement('span');
    code.className = 'code';
    code.textContent = this.#error.code;
    const message = document.createElement('span');
    message.textContent = this.#error.message;
    box.append(code, message);
  }

  #renderForm() {
    const host = this.querySelector('[data-role="form"]');
    if (!host || this.#target === null) return;

    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s1)');

    const heading = document.createElement('h2');
    heading.textContent = this.#status?.initialised ? 'Add to this project' : 'New project';
    stack.append(heading);

    if (this.#status?.initialised) {
      const form = document.createElement('keel-add-form');
      form.status = this.#status;
      form.target = this.#target;
      stack.append(form);
    } else {
      const form = document.createElement('keel-new-form');
      form.catalog = this.#catalog;
      form.target = this.#target;
      stack.append(form);
    }

    const questions = document.createElement('keel-question-list');
    questions.questions = this.#preview?.questions ?? [];
    const questionsHeading = document.createElement('h2');
    questionsHeading.textContent = 'Questions';
    stack.append(questionsHeading, questions);

    host.replaceChildren(stack);
  }
}
