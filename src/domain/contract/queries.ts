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
 * catalog up front ({@link CatalogQuery}), the question set a given
 * set of choices would produce ({@link PreviewQuery}), and, for the
 * brownfield half, what a project on disk already has
 * ({@link ProjectStatusQuery}).
 *
 * All three are `Query` — they read the registries and the manifest
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
