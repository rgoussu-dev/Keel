/**
 * The read half of the system's public surface: the queries a
 * primary adapter dispatches to *describe* keel rather than run it,
 * and the report DTOs their handlers return.
 *
 * Separate from `./commands.ts` because the audience is different.
 * A command is what the CLI already had a flag for; these three
 * exist because a graphical front end cannot work the way a terminal
 * does. The CLI discovers the composition one prompt at a time —
 * ask, answer, ask the next — and prints the plan once at the end.
 * A form has to show every field at once, before anything is
 * committed, and re-show it as answers change. That needs the
 * catalog up front ({@link CatalogQuery}), the menus a *combination*
 * of dials still leaves open ({@link DialsQuery}), the question set a
 * given set of choices would produce ({@link PreviewQuery}), and, for
 * the brownfield half, what a project on disk already has
 * ({@link ProjectStatusQuery}).
 *
 * All four are `Query` — they read the registries and the manifest
 * and write nothing, `keel.preview` included: it stages the install
 * against an in-memory Tree and reports the changes without
 * committing them.
 */

import type { Query } from '../kernel/action.js';
import type { DocsReport, InstallTarget, PresetAnswers, RefreshProposal } from './commands.js';
import type { QuestionChoice } from './composition.js';
import type { InstalledModule, ServiceRef } from './manifest.js';
import type { TreeChange } from './ports/tree.js';
import type { Refusal } from './refusal.js';
import type { Tag } from './tags.js';

/* ------------------------------------------------------------------ *
 * Catalog                                                             *
 * ------------------------------------------------------------------ */

/** Everything keel can install, with the dials each option offers. */
export interface Catalog {
  readonly stacks: readonly StackDescriptor[];
  readonly verticals: readonly VerticalDescriptor[];
  /** The guided stack finder, for a front end that offers one. */
  readonly finder: StackFinder;
}

/**
 * The `keel new` drill-down as data: **shape → language → framework
 * → user-side adapters**, narrowing to a preset.
 *
 * Reported rather than re-derived, and that is the whole point of it
 * being here. The tree is a reading of the stacks' capability tags —
 * which `arch.*` tags name an entrypoint rather than a shape and
 * which end each is driven from, which `lang.*` and `runtime.*` pair
 * makes a language node, how a subset that no preset covers is kept
 * off the menu, how a composite product places itself through its
 * services. A front end deriving that from
 * {@link StackDescriptor.tags} would be a second implementation of a
 * vocabulary that is not its to know, and it would drift from the
 * terminal's the first time a tag moved. So the engine walks its own
 * catalog and hands over the tree; a page renders four dependent
 * controls and knows nothing about tags.
 *
 * Composite products are in the tree, under the `fullstack` shape:
 * a product carries no `lang.*` tag of its own, but its services do,
 * and the shape axis is what gave them a branch to sit on. `stacks`
 * still lists every preset — a finder is an aid to picking, never
 * the only way to pick.
 */
export interface StackFinder {
  readonly shapes: readonly ShapeNode[];
  /**
   * Where a form should open: the preset an omitted `--stack`
   * resolves to, so a blank form and a bare `keel new` agree.
   *
   * Reported whole rather than as a default per facet, because
   * recomposing it is exactly the step that goes wrong: the facets
   * are alphabetical and the default framework is not the first of
   * them. One field, one answer, no arithmetic at the other end.
   */
  readonly defaultStack: string;
}

/**
 * One shape node of the {@link StackFinder} — what the preset builds,
 * which is the widest question there is and therefore the first one.
 */
export interface ShapeNode {
  /** `fullstack`, `backend` or `frontend`. */
  readonly id: string;
  readonly label: string;
  readonly doc: string;
  readonly languages: readonly LanguageNode[];
}

/**
 * One language node of a {@link ShapeNode}. For a fullstack product
 * this is the language of its **backend**: the front end of a
 * two-service product is what makes it fullstack, and the language
 * left to choose is the engine's.
 */
export interface LanguageNode {
  /** e.g. `java@jvm`, `go`, `typescript@browser`. Opaque to a front end. */
  readonly id: string;
  readonly label: string;
  readonly doc: string;
  /**
   * The runtime the language targets — `jvm`, `node`, `browser` — or
   * null for one compiled to a native binary (Go, Rust).
   *
   * Reported beside the id rather than left in it, so a front end
   * that has to tell kin from strangers — Kotlin moving to a shape
   * that offers only Java lands on Java, not on whatever sorts first —
   * never has to take the id apart to find out.
   */
  readonly runtime: string | null;
  /**
   * One entry per framework reachable here. More than one means the
   * framework facet has something to ask; exactly one means it
   * answers itself — and either way the node below it names the
   * presets it resolves to.
   */
  readonly frameworks: readonly FrameworkNode[];
}

/** One framework of a {@link LanguageNode}, and what it still leaves open. */
export interface FrameworkNode {
  /** Framework id; `''` for a preset declaring none. */
  readonly id: string;
  readonly label: string;
  /**
   * How to ask which entrypoints, or null when this combination
   * reaches exactly one set and the question answers itself.
   */
  readonly entrypointStep: EntrypointStepDescriptor | null;
  readonly combinations: readonly EntrypointCombination[];
}

/**
 * The entrypoint question's shape for one framework node.
 *
 * `multi-select` where every non-empty subset of `choices` is a
 * preset — the ordinary case, and a checkbox group. `select` over
 * spelled-out combinations where it is not, so a pairing no preset
 * covers is never on the menu. A front end that renders the first as
 * a single-choice control offers a combination it cannot resolve.
 */
export interface EntrypointStepDescriptor {
  readonly kind: 'select' | 'multi-select';
  readonly choices: readonly ChoiceDescriptor[];
  /** Encoded selection — comma-joined, as a `multi-select` answer is. */
  readonly default: string;
}

/** One reachable set of entrypoints, and the preset it names. */
export interface EntrypointCombination {
  /** Entrypoint ids in menu order; what the step's answer decodes to. */
  readonly entrypoints: readonly string[];
  /** The stack id this leaf resolves to — a `StackDescriptor.id`. */
  readonly stack: string;
}

/** One selectable value of a dial, as a front end would render it. */
export interface ChoiceDescriptor {
  readonly id: string;
  readonly label: string;
  readonly doc: string;
}

/** A stack preset and the choices `keel new` would offer for it. */
export interface StackDescriptor {
  readonly id: string;
  readonly description: string;
  /** Capability tags the stack seeds, minus the ones a dial folds in. */
  readonly tags: readonly Tag[];
  /** Build systems on offer; the first is the default. Empty when pinned. */
  readonly buildSystems: readonly ChoiceDescriptor[];
  /** Module layouts on offer; the first is the default. Empty when pinned. */
  readonly moduleLayouts: readonly ChoiceDescriptor[];
  /** Services of a composite stack; empty for a single-service one. */
  readonly services: readonly ServiceDescriptor[];
  /**
   * Whether `--with-peer-context` buys anything here — probed against
   * the adapter set on the modulith layout, not hard-coded, so a
   * family that gains its adapter lights this up by itself.
   */
  readonly peerContext: boolean;
}

/** One service of a composite stack, with its own build-system dial. */
export interface ServiceDescriptor {
  readonly path: string;
  readonly stack: string;
  readonly buildSystems: readonly ChoiceDescriptor[];
}

/**
 * One service of a composite product as `keel.dials` reads it: its
 * build-system dial, and its own extras menu.
 */
export interface ServiceDialOptions extends ServiceDescriptor {
  /**
   * The verticals of this service as its extras control shows them —
   * {@link DialOptions.verticals}' reading, over the service's scope
   * as the product scaffolds it on the settled dials: its preset's own
   * verticals and those the product installs in it (`included`, and
   * under the monorepo layout what the product root gives it too),
   * what installs there on its own (`ready`) or once others have
   * (`needs`), and what cannot go there (`unavailable`, with the
   * refusal `keel new --with <path>:<id>` gives it — a pipeline in a
   * monorepo service among them).
   */
  readonly verticals: readonly VerticalOption[];
}

/** A vertical `keel add` can install. */
export interface VerticalDescriptor {
  readonly id: string;
  /**
   * The concept it bears, as a person would name it — resolved, so
   * never absent even where the vertical declared none. A front end
   * offering verticals shows this and `description` together: the id
   * is what you type on the command line, the title is what you
   * recognise, and the description is what installing it buys.
   */
  readonly title: string;
  readonly description: string;
  readonly dimensions: readonly string[];
}

/** Lists every stack and vertical keel knows about. */
export interface CatalogQuery extends Query<Catalog> {
  readonly kind: 'keel.catalog';
}

/** Constructs a {@link CatalogQuery}. */
export function catalogQuery(): CatalogQuery {
  return { kind: 'keel.catalog', intent: 'query' };
}

/* ------------------------------------------------------------------ *
 * Dials                                                               *
 * ------------------------------------------------------------------ */

/**
 * What each stack-level dial may still be set to, given the others —
 * and the target those settings settle at.
 *
 * The catalog describes a preset's dials; this describes a
 * *combination*. The difference is the whole reason this query
 * exists. `StackDescriptor.buildSystems` is the honest answer to
 * "what does `quarkus-rest` offer?", and no answer at all to "…with
 * the modulith already chosen?", because a {@link Conflict} can name
 * two dials at once. A terminal never had to ask: it settles one dial
 * before it offers the next, so each menu is filtered against the
 * tags the earlier ones left behind. A form shows every dial at once
 * and has nowhere to put that filtering — so it asks here.
 *
 * **Flat, not a cross-product.** One field per dial, each answering
 * "given the rest of this target". Reporting legality *inside* the
 * catalog would mean a shape that multiplies with every dial added,
 * and a catalog that stopped being a flat description of a preset;
 * this grows by one field instead, and it grows where the question is
 * asked rather than where the preset is described.
 *
 * **The page never sees a tag**, exactly as it never does in
 * {@link StackFinder}. It sends the target it holds and reads back
 * ids it can put straight on a control — the tag vocabulary that
 * decides the answer stays where it belongs.
 */
export interface DialOptions {
  /**
   * The caller's target, snapped to the menus below: every dial set
   * to the value it asked for where that is still legal, and to the
   * first legal one where it is not.
   *
   * Reported rather than left to the caller to recompute, for the
   * reason `keel.preview` and the install command share a body — a
   * front end that re-derived it would be a second implementation of
   * the resolution order the handler already runs, and the two would
   * disagree the first time a rule moved. A caller adopts this target
   * and posts it back verbatim.
   *
   * Dials are **set** rather than left absent, which is what stops
   * the install asking about them: a stack-level dial the install
   * asks about arrives as a preview question, and a form that already
   * renders it from here would show the same choice twice.
   * `extraVerticals` is no exception: pinned to `[]` when the caller
   * named none, and otherwise **snapped to its closure** — the
   * prerequisites of what it names added, what cannot go on this
   * preset dropped, in the order the install will run them. Every
   * such change is in {@link DialOptions.adjustments}. The list to
   * choose from is {@link DialOptions.verticals}. A product's extras
   * are its services': snapped per service in `services`, each list
   * to choose from on {@link DialOptions.services}, and never left
   * bare — one named without a service is moved into the one service
   * that takes it, or dropped. `agentHarness` is
   * the exception the other way: carried only as `false`, where
   * {@link DialOptions.agentHarness} lets the harness be left out —
   * on is what an absent field means, the install asks nothing about
   * it, and the command line spells no flag for it.
   */
  readonly target: InstallTarget;
  /** Build systems still legal; empty when the stack pins one. */
  readonly buildSystems: readonly ChoiceDescriptor[];
  /** Module layouts still legal under the settled build system. */
  readonly moduleLayouts: readonly ChoiceDescriptor[];
  /**
   * Services of a composite, each with its own build systems and extras
   * menu; empty otherwise.
   */
  readonly services: readonly ServiceDialOptions[];
  /**
   * Whether the peer context may be switched on as the dials stand —
   * the capability probe {@link StackDescriptor.peerContext} reports
   * *and* the rules, which is the half a catalog cannot answer.
   */
  readonly peerContext: boolean;
  /**
   * Whether the agent harness may be left out (`target.agentHarness:
   * false`, `keel new --no-agent-harness`): a single-service preset
   * that comes with it, whose own tags and remaining verticals do not
   * switch it back on. Never on a composite product, whose every
   * service carries it. Left out, an extra that would switch it back
   * on is `unavailable`, and dropped from the selection, in the words
   * `keel new` refuses the pair with.
   */
  readonly agentHarness: boolean;
  /**
   * Verticals that may still be layered on top, labelled by title:
   * those that install here on their own, and those that install once
   * others have (see {@link DialOptions.verticals} for which). Pruned
   * as the dials move. On a composite product, those `keel new --with`
   * takes without a service, each going to the one service that can
   * take it; each service's own menu is on {@link DialOptions.services}.
   */
  readonly extraVerticals: readonly ChoiceDescriptor[];
  /**
   * The verticals of this preset as an extras control shows them:
   * every one {@link DialOptions.extraVerticals} offers, the preset's
   * own (`included`), and every other registered vertical, which it
   * cannot carry (`unavailable`, with the refusal `keel new --with`
   * gives it) — each with its readiness and what it needs installed
   * first. On a composite product, as `keel new --with` reads an id
   * named without a service: the product's own `included` — naming one
   * sets it aside with a note, as on a single preset — one service
   * alone can take with that service's readiness, and the rest
   * `unavailable`, refused as belonging to a service (naming which can
   * take it) or as nowhere to go. Each service's own menu is on
   * {@link DialOptions.services}. Empty on a brownfield target.
   */
  readonly verticals: readonly VerticalOption[];
  /**
   * What snapping `target.extraVerticals` changed: a vertical this
   * preset cannot carry, or already carries, `dropped`, then each
   * prerequisite `added` (in install order) — each with the reason, so
   * nothing leaves or joins the caller's selection silently. Empty when
   * nothing moved. The extras are a set: the order they were named in
   * changes neither what is kept nor the order it comes back in. On a
   * composite product, the same for each service's extras
   * (`target.services`), each adjustment naming its service — and a
   * vertical named without a service `added` to the one service that
   * takes it, or `dropped` where none or several would.
   */
  readonly adjustments: readonly DialAdjustment[];
}

/**
 * One vertical of a preset, as the extras control shows it — the
 * planner's readiness (`domain/core/planner.ts`) with the tags taken
 * out, since the page never speaks them.
 */
export interface VerticalOption {
  readonly id: string;
  /** What a person calls it. @see VerticalDescriptor.title */
  readonly title: string;
  readonly description: string;
  /**
   * `included` — the preset installs it anyway; `ready` — it installs
   * here on its own; `needs` — it installs once {@link requires} have;
   * `unavailable` — nothing keel can add makes it install on this
   * preset, and {@link refusal} says why. The agent harness stays
   * `included` when the target leaves it out: it is still the
   * preset's own, to put back, and {@link DialOptions.agentHarness}
   * says whether it may be.
   */
  readonly readiness: 'included' | 'ready' | 'needs' | 'unavailable';
  /**
   * Vertical ids to install first, in the order they install — what
   * ticking this one ticks too. Empty unless `needs`, and empty for a
   * `needs` that two sets of prerequisites would each satisfy: that
   * choice is the user's, made by ticking one of them.
   */
  readonly requires: readonly string[];
  /**
   * What `keel new --with <id>` would answer, word for word: on every
   * `unavailable` option, and on a `needs` whose prerequisites are
   * tied. The same reading a brownfield card carries
   * ({@link AvailableVerticalDescriptor.refusal}), so the two halves
   * say one thing about one vertical. Absent where it is accepted.
   */
  readonly refusal?: RefusalDescriptor;
}

/** One change {@link DialOptions} made to the caller's extras. */
export interface DialAdjustment {
  /** The vertical id added or dropped. */
  readonly id: string;
  readonly change: 'added' | 'dropped';
  /**
   * On a composite product, the path of the service whose extras
   * changed — the vertical `added` to it, which a vertical named
   * without a service is when that service alone can take it, or
   * `dropped` from it. Absent for a product's extras named without a
   * service that no service took, and on a single preset.
   */
  readonly service?: string;
  /** Why, as one sentence a page can show as it stands. */
  readonly because: string;
}

/**
 * Reports the dial menus legal for a target, and the target they
 * settle at.
 *
 * Total: an unknown stack, a half-filled target, or one already in an
 * illegal combination all get an answer rather than a refusal. A menu
 * that refuses to answer where the assembly is broken is a menu that
 * cannot be used to fix it — refusing is `keel.preview`'s job, and
 * the install command's.
 */
export interface DialsQuery extends Query<DialOptions> {
  readonly kind: 'keel.dials';
  readonly target: InstallTarget;
}

/** Constructs a {@link DialsQuery}. */
export function dialsQuery(input: Omit<DialsQuery, 'kind' | 'intent'>): DialsQuery {
  return { kind: 'keel.dials', intent: 'query', ...input };
}

/* ------------------------------------------------------------------ *
 * Readiness                                                           *
 * ------------------------------------------------------------------ */

/**
 * Whether a vertical can go on a scope as it stands, and what it
 * would take — the one answer a menu, a brownfield card and a front
 * door's refusal are meant to share, computed by the planner
 * (`domain/core/planner.ts`) from the registry's declarations.
 *
 * - `included` — the scope already has it: installed, or a preset's
 *   own vertical.
 * - `ready` — it installs here on its own.
 * - `needs` — it installs once other verticals are installed first.
 * - `unavailable` — nothing keel can add makes it install here, and
 *   the gap says why.
 */
export type Readiness =
  | { readonly kind: 'included' }
  | { readonly kind: 'ready' }
  | ReadinessNeeds
  | { readonly kind: 'unavailable'; readonly gap: ReadinessGap };

/** {@link Readiness} for a vertical that installs once others have. */
export interface ReadinessNeeds {
  readonly kind: 'needs';
  /**
   * Vertical ids to install first, in the order they install — the
   * smallest set that makes this one installable.
   */
  readonly prerequisites: readonly string[];
  /**
   * Other sets exactly as small, in registry order; absent when
   * `prerequisites` is the only one. Two providers of one capability
   * — two plugins, say — are a choice for the user: the planner
   * reports both here and refuses to plan the vertical alone rather
   * than guess between them.
   */
  readonly alternatives?: readonly (readonly string[])[];
}

/**
 * Why a vertical is `unavailable` on a scope, split by what would
 * change the answer.
 *
 * Tags, not sentences: this is the structured half of a refusal, and
 * the words a user reads are built from it elsewhere — an entrypoint
 * by its label, an identity gap as "no adapter for this project's
 * stack" — so a front end never has to speak tags.
 */
export interface ReadinessGap {
  /**
   * Entrypoints the scope lacks — `arch.*` tags the stack finder
   * offers as a way in (`arch.server-http`). Fixed at `keel new`.
   */
  readonly entrypoint: readonly Tag[];
  /**
   * `peer.*` tags: what a linked project would project here
   * (`keel link`), which is how a gateway becomes installable.
   */
  readonly peer: readonly Tag[];
  /**
   * Everything else the scope lacks and no install can add here: the
   * preset's language, framework, runtime, build system or layout,
   * and any capability no registered vertical can supply on this
   * scope. Empty with the other two when the vertical's adapters are
   * ruled out by what the scope does have.
   */
  readonly identity: readonly Tag[];
  /**
   * Ids of the rules (`Conflict`s) it breaks: its own, against the
   * scope's tags, and those the scope's pieces declare, against what
   * installing it would add.
   */
  readonly rules: readonly string[];
  /**
   * The single-service stacks nearest this scope that carry the
   * vertical on their default dials — it is theirs, it installs
   * alone, or it installs once keel adds what it needs. Nearest means
   * the same language and framework over any other, then the fewest
   * identity tags apart; every stack tied for nearest is listed, by
   * id, and no other. Empty when no stack carries it — a vertical
   * selected by peer tags, which only a linked project projects.
   */
  readonly nearestStacks: readonly string[];
  /**
   * Ids of the verticals whose place is a repository root
   * (`Vertical.placement`), which this scope — a service of a
   * monorepo product — is not: the vertical itself, or the
   * prerequisites it would be planned with anywhere else. Present
   * only where they are what stops it, and then the rest of the gap is
   * empty: a stack, an entrypoint or a link would change nothing.
   */
  readonly repositoryOnly?: readonly string[];
  /**
   * Installed verticals which, re-rendered in the same run (`keel add
   * --refresh`), would let it install: each was rendered through an
   * adapter that does not add what it needs, and would render through
   * one that does once the run's other verticals are in —
   * Distribution, shipped as native binaries before the project had a
   * container image, builds no image for Infrastructure as code to
   * deploy. Present only where that is what stops it, and then the
   * rest of the gap is empty: a re-render is the user's to ask for,
   * never one a plan makes of its own accord.
   */
  readonly refresh?: RefreshGap;
}

/** What {@link ReadinessGap.refresh} names: what to re-render, and what installs with it. */
export interface RefreshGap {
  /** The installed verticals to re-render, in the order the project installed them. */
  readonly verticals: readonly string[];
  /**
   * What the run would install with it besides, first — as a `needs`
   * names them; empty when the project has all of it, or the run
   * names it already.
   */
  readonly prerequisites: readonly string[];
}

/* ------------------------------------------------------------------ *
 * Preview                                                             *
 * ------------------------------------------------------------------ */

/**
 * Where a preview's answer goes when the caller sends it back.
 *
 * A question id is unique within its asker and nowhere else, and the
 * two askers record answers in completely different places: an
 * adapter's answer is sticky memory under the adapter's id, while a
 * stack-level dial is a field of the command. Reporting the
 * destination alongside the question is what lets a front end collect
 * answers generically — it fills the form, then folds each answer
 * into the target by its binding, with no table of question ids of
 * its own to keep in step with the adapters.
 */
export type AnswerBinding =
  | { readonly kind: 'answer'; readonly adapter: string; readonly question: string }
  | { readonly kind: 'stack' }
  | { readonly kind: 'layout' }
  | { readonly kind: 'moduleLayout' }
  | { readonly kind: 'buildSystem'; readonly service?: string }
  /** Answered `yes` / `no`; the field it fills is a boolean. */
  | { readonly kind: 'withPeerContext' }
  /**
   * A `multi-select` answer: the field it fills is a list of vertical
   * ids, so a caller splits the answer on commas on the way back.
   */
  | { readonly kind: 'extraVerticals' };

/**
 * A question the previewed install asked, with the value the preview
 * resolved it to.
 *
 * "Would ask" is the honest reading: a preview runs the whole
 * resolution with a prompt that answers from the caller's map (or the
 * question's default) and records as it goes, so the list is exactly
 * what an interactive run would put to the user, in the order it
 * would ask.
 */
export interface PendingQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly doc: string;
  /**
   * `multi-select` when the question picks a *set* of `choices` — the
   * answer being those values comma-joined, exactly as
   * `Question.kind` defines it. Absent means one choice. A form that
   * ignores this renders a set question as a single-choice control
   * and sends back an answer the install cannot honour, so it is
   * reported rather than left to be inferred.
   */
  readonly kind?: 'select' | 'multi-select';
  /**
   * The choices the question offers this project — only those whose
   * `QuestionChoice.predicate` its tags match, the same list an
   * answer sent back is held to. Each arrives without its predicate,
   * already applied here.
   */
  readonly choices?: readonly QuestionChoice[];
  readonly default: string;
  /** What this preview resolved the question to. */
  readonly value: string;
  readonly memory: 'sticky' | 'repeat';
  /**
   * `project` when the question is about the project's identity
   * (`Question.shared`) — its name, its package, its module path —
   * rather than about the adapter asking it: a front end moving from
   * one preset to another carries such an answer onto the question
   * the new preset's bootstrap asks, under the binding the next
   * preview reports. Absent on every other question.
   */
  readonly shared?: 'project';
  /**
   * Where the answer goes. For an adapter's question, the id the value
   * was read under — its own, or a sibling's it borrows from
   * (`Adapter.sharesAnswersWith`) when the answer arrived under that
   * one — so an answer sent back under its binding is the one read
   * again, and never a second answer to the same question.
   */
  readonly binding: AnswerBinding;
}

/**
 * An answer sent to `keel.preview` that the install would not read —
 * and so refuses — with the refusal it would give: the answers an
 * install body must drop to be taken as previewed.
 */
export interface UnusedAnswer {
  /** The id the answer was keyed to. */
  readonly adapter: string;
  readonly question: string;
  /** `keel.unknown-answer`, `keel.frozen-answer` or `keel.reapply-frozen-answers`. */
  readonly code: string;
  /** The sentence the install refuses it in. */
  readonly message: string;
}

/** What an install would ask, and what it would write. */
export interface InstallPreview {
  /** The stack id, vertical id, or context name being previewed. */
  readonly subject: string;
  /** Every question the run reached, in the order it asked them. */
  readonly questions: readonly PendingQuestion[];
  /** Every file the install would stage, in deterministic path order. */
  readonly changes: readonly TreeChange[];
  /** Human-readable descriptions of the deferred actions, in run order. */
  readonly actions: readonly string[];
  /** Harness elements omitted because the project has no agent-harness; absent when none. */
  readonly skippedHarnessElements?: number;
  /**
   * What the run decided that the request did not spell out, one
   * sentence each — the install report's own notes
   * (`InstallReport.notes`): the prerequisites it adds and what needs
   * them, the order it installs in when the one named could not be
   * kept, a vertical already there, each re-render it proposes. Absent
   * when there is nothing to say.
   */
  readonly notes?: readonly string[];
  /**
   * The installed verticals this run would leave as they were
   * rendered, although what it installs changes what they would render
   * now — the install report's own (`InstallReport.refreshProposals`).
   * A front end offers each as a re-render to take up in the same run
   * (`AddVerticalTarget.refresh`). Absent when there are none.
   */
  readonly refreshProposals?: readonly RefreshProposal[];
  /**
   * The answers sent that this run does not read, each with the
   * refusal an install of the same body gives it — an install refuses
   * the first, before anything is written. Read by the same function,
   * over the same plan (`InstallReport.resolvedAdapters`), as the
   * install's own check; the plan and the questions above are what
   * the body without them installs. Absent when every answer is read.
   */
  readonly unusedAnswers?: readonly UnusedAnswer[];
}

/**
 * Runs an install as a dry run and reports both halves of it: the
 * questions it asked and the plan it produced.
 *
 * The engine resolves questions lazily — an adapter is only asked
 * once its predicate matched, and a predicate can turn on a tag an
 * earlier answer folded in — so the question set is a function of the
 * answers, and there is no static form to render. The loop a caller
 * runs instead: preview, show what came back, fold a changed answer
 * into `answers`, preview again. It converges because each pass
 * resolves the same way an install would.
 */
export interface PreviewQuery extends Query<InstallPreview> {
  readonly kind: 'keel.preview';
  readonly cwd: string;
  readonly target: InstallTarget;
  /** Answers gathered so far, keyed as the manifest keys them. */
  readonly answers: PresetAnswers;
}

/** Constructs a {@link PreviewQuery}. */
export function previewQuery(input: Omit<PreviewQuery, 'kind' | 'intent'>): PreviewQuery {
  return { kind: 'keel.preview', intent: 'query', ...input };
}

/* ------------------------------------------------------------------ *
 * Project status                                                      *
 * ------------------------------------------------------------------ */

/** A vertical already installed in the project. */
export interface InstalledVerticalDescriptor extends VerticalDescriptor {
  readonly installedAt: string;
  /**
   * Whether `keel add <id> --reapply` can re-render it: false for an
   * id the manifest records that no brownfield command installs by id
   * — `fullstack`, the glue a product root is scaffolded with, and
   * `bounded-context`, which `keel add module` drives — and for one
   * this keel no longer registers at all. A front end shows such an
   * entry as a fact about the project, not as a control.
   */
  readonly reapplicable: boolean;
}

/**
 * A vertical `keel add` could install here and has not yet — with how
 * ready it is, read before anything is clicked.
 *
 * `readiness` is the planner's (`domain/core/planner.ts`), over this
 * project's effective tags, what it has installed and the rules those
 * pieces declare: the reading `keel.dials` offers extras by, and the
 * one the add front door plans by, through the same function
 * (`domain/core/add-readiness.ts`). So a card, a menu and a refusal
 * cannot disagree:
 *
 * - `ready` — `keel add <id>` installs it on its own;
 * - `needs` — `keel add <id>` installs it, and {@link requires} first;
 * - `unavailable` — `keel add <id>` refuses it, and {@link refusal} is
 *   what it says.
 *
 * The composition grid holds every card to `keel.preview` of its add:
 * `ready` previews Ok, `needs` previews Ok with its prerequisites in
 * the plan, and a card carrying a refusal previews as that refusal,
 * code and sentence.
 */
export interface AvailableVerticalDescriptor extends VerticalDescriptor {
  readonly readiness: 'ready' | 'needs' | 'unavailable';
  /**
   * Vertical ids `keel add <id>` installs first, in the order they
   * install. Empty unless `needs`, and empty for a `needs` that two
   * sets of prerequisites would each satisfy: choosing between them is
   * the user's, and {@link refusal} says so.
   */
  readonly requires: readonly string[];
  /**
   * What `keel add <id>` would answer, word for word: on every
   * `unavailable` card, and on a `needs` whose prerequisites are tied
   * — the one `needs` the front door refuses. Absent where the add is
   * accepted.
   */
  readonly refusal?: RefusalDescriptor;
}

/**
 * A vertical a directory has from the product it is part of rather
 * than from an install of its own. @see ProjectStatus.provided
 */
export interface ProvidedVerticalDescriptor extends VerticalDescriptor {
  /**
   * What `keel add <id>` answers here, word for word: the note of an Ok
   * that installs nothing, saying where the vertical comes from.
   */
  readonly note: string;
}

/** One service of a product root, as its status reports it. */
export interface ServiceStatus extends ServiceRef {
  /**
   * The service's directory: the product root's, joined with
   * {@link ServiceRef.path}. Reported whole, so a front end re-points
   * itself there without building a path of its own.
   */
  readonly directory: string;
  /**
   * What the service is, in a few words a button can carry: its
   * preset, and the build system it was scaffolded on where the
   * product recorded one — `quarkus-rest · Gradle`.
   */
  readonly label: string;
}

/**
 * One line of what a project is, worded the way the `keel new` wizard
 * asked it: `Language` — `Java`. @see ProjectProfile
 */
export interface ProfileFact {
  /**
   * What the line answers — `Building`, `Language`, `Framework`,
   * `Adapters`, `Build system`, `Module layout`: the drill-down's
   * questions and the dials', by the names the page's review gives
   * them.
   */
  readonly label: string;
  /** The answer, in words — never a tag. */
  readonly value: string;
}

/**
 * What a keel project is, read back off its manifest in the words it
 * was asked in — so a front end can show a scaffolded project's
 * settled choices without reading a tag.
 *
 * A single project's manifest records the tags its preset seeded, not
 * the preset's id, and the drill-down is a reading of exactly those
 * tags: read back, they give the four answers `keel new` was given and
 * the preset those lead to. A product root's manifest records its services'
 * presets, which name the product.
 */
export interface ProjectProfile {
  /**
   * The preset the project reads as — the one the drill-down's answers
   * lead to, or at a product root the product whose services these
   * are. Null where none does: a plugin's stack the drill-down cannot
   * place, or a product no registered one matches.
   */
  readonly preset: string | null;
  /**
   * The drill-down's answers — what it builds, its language, its
   * framework where it has one, its ways in — then, on a single
   * project, the build system and module layout it was scaffolded on.
   * Empty where the tags answer none of it, and for a directory that
   * is not a keel project.
   */
  readonly facts: readonly ProfileFact[];
}

/**
 * A refusal reported ahead of the command it would stop: the error
 * that command returns, as data — its stable code, its sentence, and,
 * for a refusal the engine raises as data, the {@link Refusal} the
 * sentence was written from (the fields a 422 body carries as
 * `error.refusal`).
 */
export interface RefusalDescriptor {
  readonly code: string;
  readonly message: string;
  readonly refusal?: Refusal;
}

/**
 * The harness generation a project was written at, beside the one
 * this keel writes. @see ProjectStatus.harnessGeneration
 */
export interface HarnessGenerationStatus {
  /** The manifest's marker; null when it carries none (a manifest older than the marker). */
  readonly found: number | null;
  /** The generation this keel writes. */
  readonly expected: number;
}

/**
 * What a directory holds, as far as keel is concerned: whether it is
 * a keel project at all and, if so, which of the brownfield commands
 * apply to it — each answer computed by the function the command's
 * own front door refuses by, so a front end can say what a command
 * would do before it is run.
 */
export interface ProjectStatus {
  /** The scope root inspected, i.e. `<cwd>/.claude`. */
  readonly scopeRoot: string;
  /** False when no manifest is there — only `keel new` applies. */
  readonly initialised: boolean;
  readonly tags: readonly Tag[];
  /**
   * What the project is, in words rather than {@link tags}: the preset
   * it reads as and the choices that made it, for a front end that
   * shows them without knowing the tag vocabulary.
   */
  readonly profile: ProjectProfile;
  readonly installed: readonly InstalledVerticalDescriptor[];
  /**
   * Every registered vertical not installed here, each with how ready
   * it is and, where `keel add` would refuse it, the refusal — one
   * this project cannot carry included, so what it cannot carry is
   * said before the click rather than after it. The harness-generation
   * gate is left out: it refuses every card alike, so it is reported
   * once, in {@link harnessGeneration}.
   */
  readonly available: readonly AvailableVerticalDescriptor[];
  /**
   * The verticals this directory has without having installed them:
   * a monorepo service's, from the product that holds it — what the
   * repository root installed (`vcs`), and what the product root builds
   * for it (its image, which the root's `compose.yaml` builds). Neither
   * `installed` nor `available`: nothing here re-renders one, and
   * `keel add <id>` of one is an Ok that installs nothing and says
   * {@link ProvidedVerticalDescriptor.note}. Empty anywhere else.
   */
  readonly provided: readonly ProvidedVerticalDescriptor[];
  readonly modules: readonly InstalledModule[];
  /**
   * Services, when this is a composite product root — each with the
   * directory a front end opens it at.
   */
  readonly services: readonly ServiceStatus[];
  readonly moduleLayout: 'basic' | 'modulith';
  /**
   * Whether `keel add module` would be accepted here — the modulith
   * layout, not a product root, and a stack whose adapters really
   * emit a context. The same probe the handler's front door runs, so
   * a front end can grey the control out instead of offering an
   * action that is going to be refused.
   */
  readonly canAddModule: boolean;
  /**
   * Why `keel add module` would be refused before it reads a name: the
   * refusal its front door gives for the first of those gates this
   * project fails (not a keel project, a product root, the flat
   * layout, no context adapter for this stack). Present exactly when
   * {@link canAddModule} is false, so a front end can say why the
   * control is off rather than only that it is.
   */
  readonly moduleRefusal?: RefusalDescriptor;
  /**
   * The harness generation the manifest was stamped at, and the one
   * this keel writes. Where they differ, `keel add` refuses every
   * vertical but `agent-harness` — and `keel add module` — until the
   * harness is brought forward: one fact, reported once here rather
   * than as the same refusal on every card. Absent when the directory
   * is not a keel project.
   */
  readonly harnessGeneration?: HarnessGenerationStatus;
}

/** Reports what keel knows about the project rooted at `cwd`. */
export interface ProjectStatusQuery extends Query<ProjectStatus> {
  readonly kind: 'keel.project-status';
  readonly cwd: string;
}

/** Constructs a {@link ProjectStatusQuery}. */
export function projectStatusQuery(
  input: Omit<ProjectStatusQuery, 'kind' | 'intent'>,
): ProjectStatusQuery {
  return { kind: 'keel.project-status', intent: 'query', ...input };
}

/* ------------------------------------------------------------------ *
 * Docs check                                                          *
 * ------------------------------------------------------------------ */

/**
 * Recomputes the navigation index and reports how the project's
 * documents differ from it. The read half of `keel docs`: the same
 * computation `keel.docs-sync` writes, with nothing written — so a
 * pipeline can gate on drift without a working tree it may dirty.
 */
export interface DocsCheckQuery extends Query<DocsReport> {
  readonly kind: 'keel.docs-check';
  readonly cwd: string;
}

/** Constructs a {@link DocsCheckQuery}. */
export function docsCheckQuery(input: Omit<DocsCheckQuery, 'kind' | 'intent'>): DocsCheckQuery {
  return { kind: 'keel.docs-check', intent: 'query', ...input };
}
