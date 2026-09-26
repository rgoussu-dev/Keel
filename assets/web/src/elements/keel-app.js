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
 * rendered over a newer one — superseded by any change at all, not
 * only by the next request.
 *
 * **How a change moves the state is not decided here.** The target,
 * the answers, the dials and the request generation move together,
 * and which of them a change clears is `../target.js`'s answer —
 * pure, and tested without a browser. This element stores the result
 * and redraws.
 *
 * **Dials before preview**, and in that order for a reason. A rule
 * can name two dials at once (`Conflict` in the composition
 * contract), so which build systems a stack offers is not a property
 * of the stack — it is a property of the combination. `keel.dials`
 * answers that, and it answers even where the combination is already
 * illegal, which is what lets the page correct itself instead of
 * previewing into a refusal it cannot navigate out of. Its reply is
 * adopted whole: the target it hands back is the one the page renders
 * from, previews and finally posts. Adopting it is also where a move
 * onto a new preset says what it could not keep — a dial it had to
 * snap, an extra it had to drop, a language the new shape does not
 * have — in one line under the preset picker (`../target.js`'s
 * `settle`). The answers such a move keeps are placed by the preview
 * that follows it (`previewed`), and where that places one the reply
 * did not already show, the reply is not the plan of the run any more:
 * the page previews again rather than draw it.
 *
 * **One page for both phases; the directory decides the flow.** No
 * manifest there, and the flow is `keel new`'s: the preset steps narrow
 * to one, and Options sets its dials and its **Also scaffold** extras
 * (`<keel-new-form>`). A manifest there, and the preset steps collapse
 * into one **Project** step, what the project already is — read-only,
 * but for the entrypoint it can grow — while Options draws the same
 * **Also scaffold** group over it (`<keel-add-form>`): what it has,
 * ticked and locked, each vertical with a **Re-render**; every vertical
 * it has not installed, in the part the project status read it into —
 * ready, needing another first, after the entrypoint the project can
 * grow, not for this project (collapsed, with the reason), belonging in
 * a service — several at a time. Generate posts `keel add` of what the
 * ticks add, the delta; the commands stay two. What the project cannot
 * take is said before the click, in the refusal's own words, rather
 * than learned from it. At a product root, an **Open backend/** button
 * per service points the page one directory down. In a monorepo
 * service, a pipeline or a release — whose place is the repository root
 * — is one of those refusals, and what the product gives the service is
 * locked beside what it has installed.
 *
 * Where the page opens follows the flow: `keel ui` in a keel project
 * opens on its Options — the next thing to do there is add something —
 * and in an empty directory on the Directory step, where a new project
 * starts. Moving through the folder picker keeps the Directory step
 * open, whatever the directory turns out to be.
 *
 * **A refusal is shown where the plan would be.** The plan column
 * says why there is none — the engine's sentence, as an alert, headed
 * as a refusal, as a bug or as no answer at all (`../response.js`'s
 * `failureOf`) — rather than pointing at a banner above a step the
 * user may have scrolled away from.
 *
 * **Generate lands where the directory's flow starts.** The directory
 * re-read after an install is a keel project's page — Options, with
 * the report beside it, since the next thing to do is add something
 * more — except where the run left no project at the directory itself:
 * a polyrepo product is its services, each a repository with a
 * manifest of its own, and its root holds none. There the page opens
 * the directory's listing, each service one click away, rather than a
 * new project's Options with a stranger preset over the product just
 * made.
 *
 * **A move to another directory is the only one that counts.** Its two
 * reads are stamped (`#visit`): a later move supersedes them, and a
 * reply to a superseded visit — or an install that lands after the
 * user moved on — changes nothing on the page the user is now on. A
 * read that fails leaves nothing of the previous directory behind to
 * be posted to this one: its project, target and plan are dropped with
 * the failure.
 */

import * as api from '../api.js';
import { defaultStack } from '../finder.js';
import { additionsSummary } from '../additions.js';
import { extrasSummary, servicesExtrasSummary } from '../extras.js';
import { entrypointName, projectHeadline, stampsHarnessGeneration } from '../project.js';
import { failureOf } from '../response.js';
import { plansNothing } from '../tree.js';
import {
  answer,
  previewed,
  rerender,
  rerendering,
  restart,
  retarget,
  settle,
  toggleExtra,
  toggleRefresh,
  toggleVertical,
  verticalsOf,
} from '../target.js';
import {
  DIRECTORY,
  ENTRYPOINTS,
  FRAMEWORK,
  LANGUAGE,
  OPTIONS,
  QUESTIONS,
  REVIEW,
  SHAPE,
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
  #carried = null;
  #notice = '';
  #held = [];
  #identity = [];
  #preview = null;
  #report = null;
  #error = null;
  #busy = false;
  #stale = false;
  #timer = null;
  #step = DIRECTORY;
  /** The step the panel currently holds, and the element holding it. */
  #drawn = null;
  #body_ = null;
  /**
   * Monotonic, and moved on by every request and every change: a reply
   * to a request made under an older one is discarded.
   */
  #generation = 0;
  /**
   * Monotonic, and moved on by every move to a directory: the reads of
   * a move superseded by a later one are discarded.
   */
  #visit = 0;

  connectedCallback() {
    this.#scaffold();
    this.addEventListener('target-chosen', (event) => void this.#goTo(event.detail.path));
    // A product root's way into a service: another directory, opened
    // where a keel project's page opens — on what to add there.
    this.addEventListener('service-opened', (event) => void this.#goTo(event.detail.path, OPTIONS));
    this.addEventListener('target-changed', (event) => this.#retarget(event.detail));
    this.addEventListener('extra-toggled', (event) =>
      this.#move(
        toggleExtra(
          this.#run(),
          event.detail.id,
          event.detail.ticked,
          event.detail.service ?? null,
        ),
      ),
    );
    this.addEventListener('vertical-toggled', (event) =>
      this.#move(toggleVertical(this.#run(), this.#status, event.detail.id, event.detail.ticked)),
    );
    this.addEventListener('rerender-requested', (event) =>
      this.#move(rerender(this.#run(), event.detail.id)),
    );
    this.addEventListener('refresh-toggled', (event) =>
      this.#move(toggleRefresh(this.#run(), event.detail.id, event.detail.ticked)),
    );
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
    await this.#goTo(listing.value.path, null);
  }

  /**
   * Points the whole page at a directory and rebuilds the target,
   * opening on `landing` where the rail has it — the directory step
   * when the user moved, Options for a product's service — or, for
   * null, where that directory's flow starts: Options on a keel
   * project, the directory step on a new one.
   *
   * Resolves to whether the page landed there: false when a later move
   * superseded this one while its reads were out, which then leave the
   * page to that move.
   */
  async #goTo(path, landing = DIRECTORY) {
    const visit = ++this.#visit;
    const [listing, status] = await Promise.all([api.browse(path), api.project(path)]);
    if (visit !== this.#visit) return false;
    this.#cwd = path;
    this.#error = null;
    this.#report = null;
    if (!listing.ok || !status.ok) {
      // Nothing of the directory the page was on may be posted to this
      // one: its project, its target and its plan go with the failure,
      // and the page stays on the directory step, where another can be
      // picked.
      this.#listing = listing.ok ? listing.value : null;
      this.#status = null;
      this.#adopt(restart(this.#run(), null));
      this.#preview = null;
      this.#step = DIRECTORY;
      this.#drawn = null;
      this.#fail(listing.ok ? status.error : listing.error);
      return true;
    }
    this.#listing = listing.value;
    this.#status = status.value;
    this.#adopt(
      restart(
        this.#run(),
        this.#status.initialised ? this.#defaultAddTarget() : this.#defaultNewTarget(),
      ),
    );
    this.#preview = null;
    this.#step = landing ?? (this.#status.initialised ? OPTIONS : DIRECTORY);
    this.#drawn = null;
    this.#render();
    this.#previewSoon();
    return true;
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

  /**
   * Where the brownfield wizard opens: on **no** vertical ticked.
   *
   * Ticking one for the user was defensible when the control was a
   * `<select>`, which has to show something. A set of checkboxes does
   * not, and the pre-pick was never free: it opened the page on a plan
   * nobody had asked for. An unanswered question is the honest state,
   * and the plan says so.
   */
  #defaultAddTarget() {
    return { kind: 'add-vertical', verticals: [] };
  }

  /* ---- intent -------------------------------------------------- */

  #goToStep(id) {
    this.#step = settleStep(this.#steps(), id);
    this.#render();
  }

  #retarget(patch) {
    this.#move(retarget(this.#run(), patch));
  }

  #answer(answered) {
    this.#move(answer(this.#run(), answered));
  }

  #move(run) {
    this.#adopt(run);
    this.#report = null;
    // Marked stale before the redraw, so Generate is off from the
    // moment the run moves until the preview of the move lands.
    this.#previewSoon();
    this.#render();
  }

  /** The part of the state `../target.js` moves, as one value. */
  #run() {
    return {
      target: this.#target,
      answers: this.#answers,
      dials: this.#dials,
      generation: this.#generation,
      carried: this.#carried,
      notice: this.#notice,
      held: this.#held,
      identity: this.#identity,
    };
  }

  #adopt(run) {
    this.#target = run.target;
    this.#answers = run.answers;
    this.#dials = run.dials;
    this.#generation = run.generation;
    this.#carried = run.carried;
    this.#notice = run.notice;
    this.#held = run.held;
    this.#identity = run.identity;
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
      this.#adopt(settle(this.#run(), dials.value, this.#catalog?.finder ?? null));
      this.#render();
    }
    const result = await api.preview(this.#body());
    if (generation !== this.#generation) return;
    if (result.ok) {
      this.#adopt(previewed(this.#run(), result.value));
      this.#error = null;
      // The reply placed an answer a preset move held, which it had
      // not read: its plan is not this run's. The last one stays up,
      // marked stale, until the preview of the answers as they are.
      if (this.#generation !== generation) {
        this.#previewSoon();
        this.#render();
        return;
      }
      this.#preview = result.value;
    } else {
      this.#preview = null;
      this.#error = result.error;
    }
    this.#stale = false;
    this.#render();
  }

  async #install() {
    const cwd = this.#cwd;
    const visit = this.#visit;
    this.#busy = true;
    this.#error = null;
    this.#render();
    const result = await api.install(this.#body());
    this.#busy = false;
    // The user moved to another directory while it ran: that page is
    // theirs now, and this report is not about it.
    if (visit !== this.#visit) {
      this.#render();
      return;
    }
    if (!result.ok) {
      this.#error = result.error;
      this.#render();
      return;
    }
    // The project just changed underneath us: re-read it, and open it
    // where its flow starts — a keel project's Options, the report
    // beside it; a polyrepo product's listing of its services — rather
    // than back at the directory step it was generated from.
    if (!(await this.#goTo(cwd, null))) return;
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
    const questions = this.#questionsRow();
    if (this.#status?.initialised) {
      // No jump: the project is what the run adds to, not a choice it
      // makes — its step changes nothing, and the entrypoint it offers
      // is a run of its own, with a row of its own below.
      rows.push({ label: 'Project', value: projectHeadline(this.#status) });
      if (this.#target?.kind === 'add-module') {
        rows.push({ step: OPTIONS, label: 'Bounded context', value: this.#target.module || '—' });
        if (this.#target.consumes) {
          rows.push({ step: OPTIONS, label: 'Consumes', value: this.#target.consumes });
        }
        if (questions !== null) rows.push(questions);
        return rows;
      }
      if (this.#target?.kind === 'add-entrypoint') {
        rows.push({
          step: OPTIONS,
          label: 'Entrypoint',
          value: entrypointName(this.#status, this.#target.entrypoint ?? '') || '—',
        });
        if (questions !== null) rows.push(questions);
        return rows;
      }
      const { adds, refreshes } = additionsSummary(this.#status, this.#target);
      if (rerendering(this.#target) !== null) {
        rows.push({ step: OPTIONS, label: 'Re-render', value: adds });
        if (questions !== null) rows.push(questions);
        return rows;
      }
      rows.push({ step: OPTIONS, label: 'Also scaffold', value: adds || '—' });
      if (refreshes !== '') {
        rows.push({ step: OPTIONS, label: 'Re-rendered too', value: refreshes });
      }
      if (questions !== null) rows.push(questions);
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
      if (this.#target.agentHarness === false) {
        rows.push({ step: OPTIONS, label: 'Agent harness', value: 'left out' });
      }
      rows.push({
        step: OPTIONS,
        label: 'Also scaffold',
        value:
          stack.services.length === 0
            ? extrasSummary(this.#dials, this.#target)
            : servicesExtrasSummary(this.#dials, this.#target),
      });
    }
    if (questions !== null) rows.push(questions);
    return rows;
  }

  /**
   * The review's Questions row, in both flows — an add asks questions
   * too, several verticals' at once — or null where the plan asks none.
   *
   * What the user set, not what the preview asked: every question has
   * a default, and a row calling the defaults "answered" said a run
   * nobody had touched was fully configured. `#answers` holds only
   * what was moved, pruned to what the plan still asks.
   */
  #questionsRow() {
    const asked = this.#preview?.questions.length ?? 0;
    if (asked === 0) return null;
    const set = Object.values(this.#answers).reduce(
      (count, byQuestion) => count + Object.keys(byQuestion).length,
      0,
    );
    return { step: QUESTIONS, label: 'Questions', value: answeredLine(set, asked) };
  }

  /* ---- rendering ----------------------------------------------- */

  /**
   * The shell, built once.
   *
   * Masthead, then the rail in a band of its own, then two columns
   * that scroll independently. The rail spans the page because it is
   * a map of the whole run rather than part of the panel you happen
   * to have open; the plan gets a column that cannot scroll away,
   * which is what a stepper owes it.
   */
  #scaffold() {
    this.innerHTML = `
      <header class="masthead">
        <h1 class="wordmark">keel<span class="tagline" data-role="tagline">local scaffolder</span></h1>
        <div class="masthead-meta" data-role="meta"></div>
      </header>
      <div class="railbar">
        <keel-stepper></keel-stepper>
        <keel-preset hidden></keel-preset>
      </div>
      <div class="workspace">
        <div class="column">
          <stack-pk space="var(--s1)">
            <section class="panel" data-role="step"></section>
          </stack-pk>
        </div>
        <div class="column aside">
          <keel-plan></keel-plan>
        </div>
      </div>
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
        preset.notice = this.#notice;
      }
    }

    this.#renderMeta();
    this.#renderStep(steps);

    const plan = this.querySelector('keel-plan');
    if (plan) {
      plan.preview = this.#preview;
      plan.report = this.#report;
      plan.stale = this.#stale;
      plan.hint = this.#hint();
      plan.error = this.#error;
      plan.body = this.#body();
    }
  }

  /**
   * The masthead's right-hand side: which mode the page is in, and
   * what the directory already holds.
   *
   * Both are answers the page had already computed and was showing
   * nowhere — the mode only implicitly, through which controls the
   * steps happened to offer.
   */
  #renderMeta() {
    const host = this.querySelector('[data-role="meta"]');
    if (!host) return;
    const chips = [];
    if (this.#status !== null) {
      const chip = document.createElement('span');
      chip.className = 'chip accent';
      const dot = document.createElement('span');
      dot.className = 'dot';
      const text = document.createElement('span');
      text.textContent = this.#status.initialised ? 'keel project' : 'new project';
      chip.append(dot, text);
      chips.push(chip);
    }
    if (this.#status?.initialised) {
      const installed = this.#status.installed.length;
      chips.push(chipOf(`${installed} vertical${installed === 1 ? '' : 's'} installed`));
      if (this.#status.modules.length > 0) {
        const count = this.#status.modules.length;
        chips.push(chipOf(`${count} context${count === 1 ? '' : 's'}`));
      }
    }
    host.replaceChildren(...chips);
  }

  /**
   * Whether Generate may post the body: a complete run, previewed as
   * it now stands, with something to do. Not merely previewed once —
   * the preview is what prunes the answers to the ones its plan asks
   * (`previewed`), so a body posted between a move and its preview
   * would carry an answer the install refuses, an unticked extra's
   * among them. And not a plan that writes nothing and runs nothing:
   * committing one would record a vertical as installed that had put
   * nothing on disk.
   */
  #ready() {
    return (
      this.#complete() &&
      this.#error === null &&
      this.#preview !== null &&
      !this.#stale &&
      !this.#changesNothing()
    );
  }

  /**
   * Whether the previewed run would change nothing at all. A plan with
   * nothing to write or run still changes the project where it re-renders
   * the agent harness of one from another harness generation: the run
   * stamps the generation marker into the manifest, and that is what
   * lets every other card through.
   */
  #changesNothing() {
    if (this.#preview === null || !plansNothing(this.#preview)) return false;
    return !stampsHarnessGeneration(this.#status, rerendering(this.#target));
  }

  /** Whether the target carries every field its command requires. */
  #complete() {
    if (this.#target === null) return false;
    if (this.#target.kind === 'add-module') return (this.#target.module ?? '') !== '';
    if (this.#target.kind === 'add-entrypoint') return (this.#target.entrypoint ?? '') !== '';
    if (this.#target.kind === 'add-vertical') return verticalsOf(this.#target).length > 0;
    return (this.#target.stack ?? '') !== '';
  }

  /**
   * What the plan shows instead of a tree when a run is still being
   * filled in. A refused one shows the refusal itself (`plan.error`),
   * where the tree would have been.
   */
  #hint() {
    if (this.#error !== null || this.#complete()) return '';
    if (this.#target?.kind === 'add-module') return 'Name the context to see its plan.';
    if (this.#target?.kind === 'add-entrypoint') return 'Choose the entrypoint to see its plan.';
    if (this.#target?.kind === 'add-vertical') return 'Tick a vertical to see its plan.';
    return '';
  }

  /**
   * Draws the open step: its heading, its controls, and the two
   * arrows.
   *
   * **The body survives a re-render while the step holds.** Every
   * preview re-renders, and rebuilding the panel took the caret out
   * of whatever field was being typed in — a text answer is committed
   * on blur, so the field you are editing is live for as long as you
   * are editing it. The controls are therefore created when the step
   * changes and updated through their properties otherwise.
   */
  #renderStep(steps) {
    const host = this.querySelector('[data-role="step"]');
    if (!host || this.#catalog === null) return;
    // No run — a directory that could not be read: the directory step
    // alone has something to show, and no other step keeps the last
    // directory's controls on screen.
    if (this.#target === null && this.#step !== DIRECTORY) {
      host.replaceChildren();
      this.#drawn = null;
      this.#body_ = null;
      return;
    }
    const current = steps.find((step) => step.id === this.#step);

    if (this.#step === this.#drawn && this.#body_ !== null && this.#body_.isConnected) {
      this.#fillStepBody(this.#body_);
      this.#fillNavigation(steps);
      return;
    }

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
    this.#body_ = this.#stepBody();
    this.#drawn = this.#step;
    stack.append(this.#body_);
    stack.append(this.#navigation(steps));
    host.replaceChildren(stack);
  }

  /**
   * The element a step's controls live in, freshly made. The middle of
   * the rail is the flow's: a new project's preset steps and Options,
   * or a keel project's Project and Options.
   */
  #stepBody() {
    const tag =
      this.#step === DIRECTORY
        ? 'keel-target-picker'
        : this.#step === QUESTIONS
          ? 'keel-question-list'
          : this.#step === REVIEW
            ? 'keel-review'
            : this.#status?.initialised
              ? 'keel-add-form'
              : 'keel-new-form';
    const node = document.createElement(tag);
    this.#fillStepBody(node);
    return node;
  }

  /** The data that element takes, on every render including its first. */
  #fillStepBody(node) {
    if (this.#step === DIRECTORY) {
      node.listing = this.#listing;
      return;
    }
    if (this.#step === QUESTIONS) {
      node.questions = this.#preview?.questions ?? [];
      return;
    }
    if (this.#step === REVIEW) {
      node.rows = this.#summary();
      node.busy = this.#busy;
      node.ready = this.#ready();
      node.hint = this.#reviewHint();
      return;
    }
    if (this.#status?.initialised) {
      node.status = this.#status;
      node.target = this.#target;
      node.preview = this.#preview;
      node.step = this.#step;
      return;
    }
    node.catalog = this.#catalog;
    node.dials = this.#dials;
    node.target = this.#target;
    node.step = this.#step;
  }

  /**
   * Why Generate is disabled, when it is — the refusal itself rather
   * than a pointer to it, because the review step is the one place a
   * user arrives at *intending* to commit.
   */
  #reviewHint() {
    if (this.#error !== null) return `${failureOf(this.#error).lead} ${this.#error.message}`;
    if (!this.#complete()) return this.#hint() || 'The run is not complete yet.';
    if (this.#preview === null || this.#stale) return 'Waiting for the plan…';
    if (this.#changesNothing()) {
      return 'Nothing to write and nothing to run — this run would change nothing, so there is nothing to generate.';
    }
    return '';
  }

  /**
   * The arrows' disabled state, on a render that kept the panel.
   *
   * Which steps exist is derived, so the position of the open one can
   * move without the panel changing — a preview that adds the options
   * step is not a reason to rebuild the controls under the caret, but
   * it is a reason for Next to become live.
   */
  #fillNavigation(steps) {
    const at = steps.findIndex((step) => step.id === this.#step);
    const back = this.querySelector('[data-role="back"]');
    const next = this.querySelector('[data-role="next"]');
    if (back) back.disabled = at <= 0;
    if (next) next.disabled = at < 0 || at >= steps.length - 1;
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

/** `2 answered, 3 on their defaults` — what the user set, and how much was left alone. */
function answeredLine(set, asked) {
  const left = Math.max(0, asked - set);
  if (left === 0) return `${set} answered`;
  return `${set} answered, ${left} on ${left === 1 ? 'its default' : 'their defaults'}`;
}

/** One masthead chip. */
function chipOf(text) {
  const chip = document.createElement('span');
  chip.className = 'chip';
  chip.textContent = text;
  return chip;
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
