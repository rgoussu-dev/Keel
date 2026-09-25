/**
 * A refusal, as data: why keel will not do what it was asked, in a
 * shape a front end can act on — which vertical, what is missing, who
 * carries it, where it goes instead, which file is in the way.
 *
 * Every refusal a front door raises about a vertical or a file travels
 * as a {@link RefusalError}: a `DomainError` with its stable code and
 * its sentence, plus the {@link Refusal} it was written from. The
 * sentence is for reading and is the same whichever phase met it —
 * `keel new --with` and `keel add` say one thing about one fact. The
 * structured half is for acting: `keel ui` receives it in the 422
 * body, and the CLI builds the remedy only a command line has from
 * it (`keel link <path>` first, the stack that carries both, moving a
 * file aside before `keel new`). Tags travel here and nowhere else —
 * a sentence names an entrypoint by its label and a vertical by its
 * title, never a tag no command can add.
 *
 * The sentences are built in one place, `domain/core/refusals.ts`,
 * from these fields. The two about files are spelled here instead
 * ({@link pathSentence}), beside the errors that carry them, because
 * a composition adapter raises them — a plugin's too — and an adapter
 * reaches keel through this contract, never through the engine.
 */

import { DomainError } from '../kernel/result.js';
import type { Tag } from './tags.js';

/**
 * Why keel refuses, by kind:
 *
 * - `needs` — the request needs prerequisites and two or more sets of
 *   them would each do, equally small: choosing between providers of
 *   one capability is the user's. (A prerequisite nothing ties is
 *   included instead, so this is the only `needs` that refuses.)
 * - `unavailable` — nothing keel can add makes the vertical install
 *   on this project, and `missing` says what would change that.
 * - `elsewhere` — the vertical belongs to a service, and this is the
 *   root of the product that holds them.
 * - `incompatible` — each vertical installs on its own, but no order
 *   installs them together.
 * - `path-conflict` — a file the run would write, or patch inside, is
 *   already there in a shape keel does not overwrite.
 * - `path-missing` — a file the run patches is gone, and keel never
 *   recreates what it only patches.
 *
 * A refusal of the scope a vertical was asked in, rather than of the
 * project — an `elsewhere`, or an `unavailable` whose
 * `repositoryOnly` is set — travels under `keel.wrong-scope`, so a
 * script can tell "not here" from "not in this project".
 */
export type Refusal =
  | NeedsRefusal
  | UnavailableRefusal
  | ElsewhereRefusal
  | IncompatibleRefusal
  | PathConflictRefusal
  | PathMissingRefusal;

/** {@link Refusal} for a request tied between sets of prerequisites. */
export interface NeedsRefusal {
  readonly kind: 'needs';
  /** Ids of the requested verticals the prerequisites are for. */
  readonly verticals: readonly string[];
  /**
   * The sets of vertical ids that would each do, equally small, every
   * one in install order — the choice the user makes by naming one.
   */
  readonly prerequisites: readonly (readonly string[])[];
}

/** {@link Refusal} for a vertical this project cannot carry. */
export interface UnavailableRefusal {
  readonly kind: 'unavailable';
  readonly vertical: string;
  /**
   * What the project lacks that would change the answer, as tags —
   * the planner's gap. Each key is absent when nothing of its kind is
   * missing, and all three are when the vertical's adapters are ruled
   * out by what the project does have.
   */
  readonly missing: {
    /** Entrypoints (`arch.server-http`): fixed at `keel new`. */
    readonly entrypoint?: readonly Tag[];
    /** What a linked project would project here (`peer.api.rest`): `keel link`. */
    readonly peer?: readonly Tag[];
    /**
     * Everything else: the preset's language, framework, runtime,
     * build system or layout, which no install changes, and any
     * capability the project lacks. Ahead of time the planner reports
     * a capability some vertical supplies by what stops that vertical
     * instead, so one lands here from the resolver's last-line throw,
     * which does not look further; the sentence names it by the
     * vertical that adds it.
     */
    readonly identity?: readonly Tag[];
  };
  /**
   * The single-service stacks nearest this project that carry the
   * vertical, by id — empty when none does, or when nothing here could
   * tell.
   */
  readonly carriedBy: readonly string[];
  /**
   * Among {@link carriedBy}, the stacks that come with the vertical —
   * their preset installs it as one of its own — in the same order;
   * absent when none does. Scaffolding one of those is how to have it,
   * with nothing to name: `--with` of it there is set aside as already
   * there. Absent too wherever {@link carriedBy} is empty.
   */
  readonly comesWith?: readonly string[];
  /**
   * Where this project is one service of a product, the product's
   * other services, in its order, each with how ready the vertical is
   * there — present only when one of them could take it or has it
   * already, which is what the sentence names; absent anywhere else,
   * and then the sentence is the one a single project gets. Filled
   * where a front door can read the product's services from the
   * service it was asked in: `keel new` of a product's service extras,
   * and `keel add` in a monorepo product's service, whose root lists
   * them.
   */
  readonly elsewhere?: readonly ElsewhereService[];
  /**
   * The reason a rule gives — one of the vertical's own this project
   * breaks, or one a piece already installed here declares that the
   * vertical's tags would break — standing in for the gap when there
   * is one.
   */
  readonly because?: string;
  /** Ids of those rules (`Conflict`s), when any. */
  readonly rules?: readonly string[];
  /**
   * Ids of the verticals whose place is a repository root, which this
   * project — a service of a monorepo product — is not: the vertical
   * itself, or prerequisites it could have anywhere else. Standing in
   * for the gap when present; the sentence gives the first one's own
   * reason (`Vertical.placement`).
   */
  readonly repositoryOnly?: readonly string[];
  /**
   * Installed verticals whose re-render in the same run would let it
   * install (`keel add --refresh`), with what that run would install
   * besides, first. Standing in for the gap when present.
   */
  readonly refresh?: {
    readonly verticals: readonly string[];
    readonly prerequisites: readonly string[];
  };
}

/** {@link Refusal} for a vertical asked of a product root rather than a service. */
export interface ElsewhereRefusal {
  readonly kind: 'elsewhere';
  readonly vertical: string;
  /** The product's services, in its order, each with how ready the vertical is there. */
  readonly services: readonly ElsewhereService[];
}

/**
 * One service of an {@link ElsewhereRefusal} — or of an
 * {@link UnavailableRefusal}'s `elsewhere`, the product's other
 * services.
 */
export interface ElsewhereService {
  /** Directory of the service, relative to the product root. */
  readonly path: string;
  /** Stack preset the service is scaffolded from. */
  readonly stack: string;
  /**
   * How ready the vertical is in that service — a `Readiness` kind
   * (`./queries.ts`), spelled out here because the status that
   * reports a {@link Refusal} is itself declared there.
   */
  readonly readiness: 'included' | 'ready' | 'needs' | 'unavailable';
  /**
   * Where the vertical is `included` in the service because the
   * product root gives it the service — the image the root builds for
   * it — rather than because the service installed it: `true`, since
   * the service then has nothing of it to re-render. Absent otherwise.
   */
  readonly fromProduct?: true;
  /**
   * Where the vertical is `unavailable` in the service because the
   * service is part of a monorepo and the vertical — or one it needs —
   * has its place at a repository root: those verticals' ids
   * (`Vertical.placement`), which is what gives the sentence its way
   * forward. Absent otherwise.
   */
  readonly repositoryOnly?: readonly string[];
}

/** {@link Refusal} for verticals no order installs together. */
export interface IncompatibleRefusal {
  readonly kind: 'incompatible';
  readonly verticals: readonly string[];
}

/** {@link Refusal} for a file in the way. */
export interface PathConflictRefusal {
  readonly kind: 'path-conflict';
  /** The file, relative to where the command ran. */
  readonly path: string;
  /** The composition adapter that would have written it. */
  readonly adapterId: string;
  /**
   * What the file lacks for keel to patch inside it — `a 'plugins {'
   * block` — when the conflict is its content rather than its being
   * there at all.
   */
  readonly anchor?: string;
}

/** {@link Refusal} for a patch target the project no longer holds. */
export interface PathMissingRefusal {
  readonly kind: 'path-missing';
  /** The file, relative to where the command ran. */
  readonly path: string;
  /** The composition adapter that patches it. */
  readonly adapterId: string;
}

/**
 * A refusal a user can act on: a `DomainError` — so the mediator puts
 * it on the `Err` rail wherever it is thrown — carrying its
 * {@link Refusal} beside the sentence written from it.
 *
 * The code is its own field rather than a function of the kind: one
 * kind of fact can travel under more than one code — an `unavailable`
 * is `keel.uncoverable-vertical`, `keel.incompatible` where a rule
 * stops it, or `keel.wrong-scope` where `repositoryOnly` says the
 * scope does — and the code, not the kind, is what a script matches
 * on.
 */
export class RefusalError extends DomainError {
  constructor(
    message: string,
    code: string,
    readonly refusal: Refusal,
  ) {
    super(message, code);
    this.name = 'RefusalError';
  }
}

/** The code a {@link PathConflictError} carries. */
export const PATH_CONFLICT_CODE = 'keel.path-conflict';

/** The code a {@link PathMissingError} carries. */
export const PATH_MISSING_CODE = 'keel.path-missing';

/**
 * Refuses a run over a file the project already holds, which keel
 * would have to overwrite or cannot patch: a hosted repository's
 * `README.md` before `keel new`, a hand-written `Dockerfile` before
 * `keel add containerization`, a build script with no block for keel's
 * plugin line (`anchor`).
 *
 * A composition adapter throws it — one of keel's or a plugin's — and
 * it reaches the user as a coded refusal rather than a crash: the
 * file is a fact about the user's directory, not a bug.
 */
export class PathConflictError extends RefusalError {
  declare readonly refusal: PathConflictRefusal;

  /**
   * @param path the file, relative to the directory the Tree is rooted at
   * @param adapterId the adapter that would have written it
   * @param anchor what the file lacks for keel to patch inside it, if that is the conflict
   */
  constructor(
    readonly path: string,
    readonly adapterId: string,
    anchor?: string,
  ) {
    const refusal: PathConflictRefusal = {
      kind: 'path-conflict',
      path,
      adapterId,
      ...(anchor === undefined ? {} : { anchor }),
    };
    super(pathSentence(refusal), PATH_CONFLICT_CODE, refusal);
    this.name = 'PathConflictError';
  }
}

/**
 * Refuses a run whose patch target is gone from the project. keel
 * patches such a file in place and never recreates it, since all it
 * could recreate is its own part of it.
 */
export class PathMissingError extends RefusalError {
  declare readonly refusal: PathMissingRefusal;

  /**
   * @param path the file, relative to the directory the Tree is rooted at
   * @param adapterId the adapter that patches it
   */
  constructor(
    readonly path: string,
    readonly adapterId: string,
  ) {
    const refusal: PathMissingRefusal = { kind: 'path-missing', path, adapterId };
    super(pathSentence(refusal), PATH_MISSING_CODE, refusal);
    this.name = 'PathMissingError';
  }
}

/**
 * The sentence a file refusal is written in. Phase-neutral: what to do
 * about a file in the way depends on the command — before `keel new`
 * it is the user's to move aside; under `keel add` it may be keel's
 * own, written by a product root — so that advice is the front end's
 * to give, and the sentence states only the fact. Names no adapter:
 * the adapter travels in the refusal.
 */
export function pathSentence(refusal: PathConflictRefusal | PathMissingRefusal): string {
  if (refusal.kind === 'path-missing') {
    return `'${refusal.path}' is missing — keel patches it and does not recreate it; restore it`;
  }
  if (refusal.anchor !== undefined) {
    return `'${refusal.path}' has no ${refusal.anchor} — keel adds its lines inside it and does not rewrite the file; add one, then re-run`;
  }
  return `'${refusal.path}' already exists, and keel does not overwrite a file this run did not write`;
}
