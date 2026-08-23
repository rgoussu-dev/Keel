/**
 * `<keel-app>` — the page's one stateful element.
 *
 * Everything below it is a view: data in as properties, intent out as
 * a `CustomEvent`. This is where the state lives, where the preview
 * loop runs, and where the stepper's position is kept.
 *
 * **The stepper.** The page asks one question at a time now, widest
 * first — what you are building, then the language, the framework,
 * the way in, the dials, the adapters' own questions, and finally the
 * review that commits it. Which of those steps exist is derived, not
 * fixed (`../steps.js`): a language reaching one framework has no
 * framework step, exactly as the terminal wizard skips that question.
 * Every step stays clickable, so the rail is a map rather than a
 * gate — nothing here can be in an invalid state, since every dial
 * has a default and `keel.dials` snaps an illegal combination back.
 *
 * **The plan stays visible throughout**, which is the one thing a
 * stepper must not take away. `keel new` can only show you the tree
 * after the fact; the whole reason this page exists is that flipping
 * Gradle to Maven redraws it in place.
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
 */

import * as api from '../api.js';
import { defaultStack } from '../finder.js';
import {
  DIRECTORY,
  ENTRYPOINTS,
  FRAMEWORK,
  LANGUAGE,
  OPTIONS,
  QUESTIONS,
  REVIEW,
  SHAPE,
  TARGET,
  chosenStack,
  located,
  nextStep,
  previousStep,
  settleStep,
  stepsFor,
} from '../steps.js';

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
  #step = DIRECTORY;
  /** Monotonic request id; a reply older than this one is discarded. */
  #generation = 0;

  connectedCallback() {
    this.#scaffold();
    this.addEventListener('target-chosen', (event) => void this.#goTo(event.detail.path));
    this.addEventListener('target-changed', (event) => this.#retarget(event.detail));
    this.addEventListener('question-answered', (event) => this.#answer(event.detail));
    this.addEventListener('step-selected', (event) => this.#goToStep(event.detail.id));
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
    this.#dials = null;
    this.#preview = null;
    this.#step = DIRECTORY;
    this.#render();
    this.#previewSoon();
  }

  /**
   * Where the greenfield wizard opens: the preset the finder's
   * defaults compose to, which is the one an omitted `--stack`
   * resolves to in a terminal. Falling back to the first of `stacks`
   * would open on a fullstack product — alphabetically first, and a
   * two-service product is the last thing a blank form should presume.
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

  #goToStep(id) {
    this.#step = settleStep(this.#steps(), id);
    this.#render();
  }

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

  /* ---- the steps ----------------------------------------------- */

  #state() {
    return {
      status: this.#status,
      catalog: this.#catalog,
      dials: this.#dials,
      target: this.#target,
      preview: this.#preview,
    };
  }

  #steps() {
    return stepsFor(this.#state());
  }

  /**
   * Every choice this run will make, in the order the wizard asked
   * them — the review step's rows, each naming the step to jump back
   * to.
   *
   * Read off the same state the steps are derived from, so a choice
   * that has no step here has no row either: nothing in this list can
   * name a control the user cannot reach.
   */
  #summary() {
    const rows = [{ step: DIRECTORY, label: 'Directory', value: this.#cwd || '—' }];
    if (this.#status?.initialised) {
      rows.push({
        step: TARGET,
        label: this.#target?.kind === 'add-module' ? 'Bounded context' : 'Vertical',
        value:
          (this.#target?.kind === 'add-module' ? this.#target.module : this.#target?.vertical) ||
          '—',
      });
      if (this.#target?.kind === 'add-module' && this.#target.consumes) {
        rows.push({ step: TARGET, label: 'Consumes', value: this.#target.consumes });
      }
      if (this.#target?.reapply === true) {
        rows.push({ step: TARGET, label: 'Mode', value: 're-render (already installed)' });
      }
      return rows;
    }
    const here = located(this.#state());
    const shown = new Set(this.#steps().map((step) => step.id));
    if (here) {
      rows.push({ step: SHAPE, label: 'Building', value: headline(here.shape.label) });
      if (shown.has(LANGUAGE)) {
        rows.push({ step: LANGUAGE, label: 'Language', value: here.language.label });
      }
      if (shown.has(FRAMEWORK)) {
        rows.push({ step: FRAMEWORK, label: 'Framework', value: headline(here.framework.label) });
      }
      if (shown.has(ENTRYPOINTS)) {
        rows.push({
          step: ENTRYPOINTS,
          label: 'Adapters',
          value: spellEntrypoints(here),
        });
      }
    }
    // No jump: the preset picker is above the rail at every step, so a
    // link back to a control already on screen would be noise.
    rows.push({ label: 'Preset', value: this.#target?.stack ?? '—' });
    const stack = chosenStack(this.#state());
    if (stack && shown.has(OPTIONS)) {
      if (stack.services.length > 0) {
        rows.push({ step: OPTIONS, label: 'Repository', value: this.#target.layout ?? 'monorepo' });
      }
      if (this.#target.buildSystem) {
        rows.push({ step: OPTIONS, label: 'Build system', value: this.#target.buildSystem });
      }
      if (this.#target.moduleLayout) {
        rows.push({ step: OPTIONS, label: 'Module layout', value: this.#target.moduleLayout });
      }
      if (this.#target.withPeerContext === true) {
        rows.push({ step: OPTIONS, label: 'Peer context', value: 'yes' });
      }
    }
    const answered = this.#preview?.questions ?? [];
    if (answered.length > 0) {
      rows.push({
        step: QUESTIONS,
        label: 'Questions',
        value: `${answered.length} answered`,
      });
    }
    return rows;
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
            <keel-stepper></keel-stepper>
            <keel-preset hidden></keel-preset>
            <div data-role="error" hidden></div>
            <sidebar-pk side="right" sidewidth="26rem" contentwidth="55%" space="var(--s1)">
              <section class="panel" data-role="step"></section>
              <keel-plan></keel-plan>
            </sidebar-pk>
          </stack-pk>
        </center-pk>
      </stack-pk>
    `;
  }

  #render() {
    const steps = this.#steps();
    this.#step = settleStep(steps, this.#step);

    const stepper = this.querySelector('keel-stepper');
    if (stepper) {
      stepper.steps = steps;
      stepper.current = this.#step;
    }

    const preset = this.querySelector('keel-preset');
    if (preset) {
      const greenfield = this.#catalog !== null && this.#status?.initialised === false;
      preset.hidden = !greenfield;
      if (greenfield) {
        preset.catalog = this.#catalog;
        preset.target = this.#target;
      }
    }

    this.#renderError();
    this.#renderStep(steps);

    const plan = this.querySelector('keel-plan');
    if (plan) {
      plan.preview = this.#preview;
      plan.report = this.#report;
      plan.stale = this.#stale;
      plan.hint = this.#hint();
    }
  }

  #ready() {
    return this.#complete() && this.#error === null && this.#preview !== null;
  }

  /** Whether the target carries every field its command requires. */
  #complete() {
    if (this.#target === null) return false;
    if (this.#target.kind === 'add-module') return (this.#target.module ?? '') !== '';
    if (this.#target.kind === 'add-vertical') return (this.#target.vertical ?? '') !== '';
    return (this.#target.stack ?? '') !== '';
  }

  /**
   * What the plan shows instead of a tree when it has no tree to
   * show — a run still being filled in, or one the engine refused.
   *
   * An empty panel is the one thing it must not be. A refused run
   * previews nothing, so the tree would render as a blank box beside
   * a banner the eye has already skipped past; saying the plan is
   * missing *because* the run was refused is what connects the two.
   */
  #hint() {
    if (this.#error !== null) return 'No plan — this run was refused. The reason is above.';
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

  /** Draws the open step: its heading, its controls, and the two arrows. */
  #renderStep(steps) {
    const host = this.querySelector('[data-role="step"]');
    if (!host || this.#target === null || this.#catalog === null) return;
    const current = steps.find((step) => step.id === this.#step);

    const stack = document.createElement('stack-pk');
    stack.setAttribute('space', 'var(--s0)');

    const heading = document.createElement('h2');
    heading.dataset.role = 'step-title';
    heading.textContent = current?.label ?? '';
    stack.append(heading);
    if (current?.doc) {
      const doc = document.createElement('p');
      doc.className = 'muted';
      doc.textContent = current.doc;
      stack.append(doc);
    }
    stack.append(this.#stepBody());
    stack.append(this.#navigation(steps));
    host.replaceChildren(stack);
  }

  #stepBody() {
    if (this.#step === DIRECTORY) {
      const picker = document.createElement('keel-target-picker');
      picker.listing = this.#listing;
      return picker;
    }
    if (this.#step === TARGET) {
      const form = document.createElement('keel-add-form');
      form.status = this.#status;
      form.target = this.#target;
      return form;
    }
    if (this.#step === QUESTIONS) {
      const questions = document.createElement('keel-question-list');
      questions.questions = this.#preview?.questions ?? [];
      return questions;
    }
    if (this.#step === REVIEW) {
      const review = document.createElement('keel-review');
      review.rows = this.#summary();
      review.busy = this.#busy;
      review.ready = this.#ready();
      review.hint = this.#reviewHint();
      return review;
    }
    const form = document.createElement('keel-new-form');
    form.catalog = this.#catalog;
    form.dials = this.#dials;
    form.target = this.#target;
    form.step = this.#step;
    return form;
  }

  /**
   * Why Generate is disabled, when it is — the refusal itself rather
   * than a pointer to it, because the review step is the one place a
   * user arrives at *intending* to commit.
   */
  #reviewHint() {
    if (this.#error !== null) return `Refused: ${this.#error.message}`;
    if (!this.#complete()) return this.#hint() || 'The run is not complete yet.';
    if (this.#preview === null) return 'Waiting for the plan…';
    return '';
  }

  #navigation(steps) {
    const row = document.createElement('cluster-pk');
    row.className = 'nav';
    row.setAttribute('space', 'var(--s-2)');
    const at = steps.findIndex((step) => step.id === this.#step);

    const back = document.createElement('button');
    back.type = 'button';
    back.dataset.role = 'back';
    back.textContent = '← Back';
    back.disabled = at <= 0;
    back.addEventListener('click', () => this.#goToStep(previousStep(steps, this.#step)));

    const next = document.createElement('button');
    next.type = 'button';
    next.dataset.role = 'next';
    next.className = 'primary';
    next.textContent = 'Next →';
    next.disabled = at < 0 || at >= steps.length - 1;
    next.addEventListener('click', () => this.#goToStep(nextStep(steps, this.#step)));

    row.append(back, next);
    return row;
  }
}

/**
 * The first clause of a label written as `name — what it is`. The
 * menus spell a choice out because that is a menu's job; a summary
 * row has a column of its own for the name and no room for the gloss.
 */
function headline(label) {
  return (label ?? '').split(' — ')[0];
}

/** An entrypoint set, spelled the way its own menu spells it. */
function spellEntrypoints(here) {
  const named = new Map(
    (here.framework.entrypointStep?.choices ?? []).map((choice) => [
      choice.id,
      headline(choice.label),
    ]),
  );
  return here.combination.entrypoints.map((id) => named.get(id) ?? id).join(' + ');
}
