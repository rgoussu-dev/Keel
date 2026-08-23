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
import type { InstallTarget, PresetAnswers } from './commands.js';
import type { QuestionChoice } from './composition.js';
import type { InstalledModule, ServiceRef } from './manifest.js';
import type { TreeChange } from './ports/tree.js';
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

/** A vertical `keel add` can install. */
export interface VerticalDescriptor {
  readonly id: string;
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
   * `extraVerticals` is the exception — it is only ever pruned here,
   * never pinned, because nothing but the preview question offers it.
   */
  readonly target: InstallTarget;
  /** Build systems still legal; empty when the stack pins one. */
  readonly buildSystems: readonly ChoiceDescriptor[];
  /** Module layouts still legal under the settled build system. */
  readonly moduleLayouts: readonly ChoiceDescriptor[];
  /** Services of a composite, with their own build systems; empty otherwise. */
  readonly services: readonly ServiceDescriptor[];
  /**
   * Whether the peer context may be switched on as the dials stand —
   * the capability probe {@link StackDescriptor.peerContext} reports
   * *and* the rules, which is the half a catalog cannot answer.
   */
  readonly peerContext: boolean;
  /** Verticals that may still be layered on top; pruned as the dials move. */
  readonly extraVerticals: readonly ChoiceDescriptor[];
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
  readonly choices?: readonly QuestionChoice[];
  readonly default: string;
  /** What this preview resolved the question to. */
  readonly value: string;
  readonly memory: 'sticky' | 'repeat';
  readonly binding: AnswerBinding;
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
}

/**
 * What a directory holds, as far as keel is concerned: whether it is
 * a keel project at all and, if so, which of the brownfield commands
 * apply to it.
 */
export interface ProjectStatus {
  /** The scope root inspected, i.e. `<cwd>/.claude`. */
  readonly scopeRoot: string;
  /** False when no manifest is there — only `keel new` applies. */
  readonly initialised: boolean;
  readonly tags: readonly Tag[];
  readonly installed: readonly InstalledVerticalDescriptor[];
  /** Registered verticals not yet installed here. */
  readonly available: readonly VerticalDescriptor[];
  readonly modules: readonly InstalledModule[];
  /** Services, when this is a composite product root. */
  readonly services: readonly ServiceRef[];
  readonly moduleLayout: 'basic' | 'modulith';
  /**
   * Whether `keel add module` would be accepted here — the modulith
   * layout, not a product root, and a stack whose adapters really
   * emit a context. The same probe the handler's front door runs, so
   * a front end can grey the control out instead of offering an
   * action that is going to be refused.
   */
  readonly canAddModule: boolean;
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
