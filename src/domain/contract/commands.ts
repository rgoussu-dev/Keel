/**
 * The system's public surface: the concrete commands naming each
 * operation keel supports, and the report DTO their handlers return.
 * Primary adapters construct these via the factory functions and
 * dispatch them through the Mediator; they never call handlers
 * directly.
 */

import type { Command } from '../kernel/action.js';
import type { TreeChange } from './ports/tree.js';

/** Result DTO of an install-shaped command (`new` / `add`). */
export interface InstallReport {
  /** What was installed: the stack id for `new`, the vertical id for `add`. */
  readonly subject: string;
  /** Every file the install staged, in deterministic path order. */
  readonly changes: readonly TreeChange[];
  /** Human-readable descriptions of the deferred actions, in run order. */
  readonly actions: readonly string[];
  /** False under dry-run: nothing was written and no action ran. */
  readonly committed: boolean;
}

/** Sticky answers supplied up front: adapterId → questionId → value. */
export type PresetAnswers = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * Repository layout of a composite (multi-service) install: one
 * repository with the services as subdirectories, or one repository
 * per service. Ignored by single-service stacks.
 */
export type RepoLayout = 'monorepo' | 'polyrepo';

/** Bootstrap a greenfield project from a stack preset. */
export interface NewProjectCommand extends Command<InstallReport> {
  readonly kind: 'keel.new-project';
  readonly cwd: string;
  /** Stack preset id, e.g. `quarkus-cli`. */
  readonly stack: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
  /**
   * Layout for composite stacks. When absent, interactive installs
   * prompt for it and non-interactive installs default to `monorepo`.
   */
  readonly layout?: RepoLayout;
  /**
   * Build-system id (`gradle`, `maven`, `npm`, `pnpm`) for stacks
   * that declare a choice. When absent, interactive installs prompt
   * for it and non-interactive installs use the stack's default.
   * Rejected for stacks with a fixed build system and for composite
   * stacks (their services scaffold on each service's default).
   */
  readonly buildSystem?: string;
  /**
   * Module-layout id (`basic`, `modulith`) for stacks that declare a
   * choice. When absent, interactive installs prompt for it and
   * non-interactive installs use the stack's default. Rejected for
   * stacks with a single layout and for composite stacks (their
   * services scaffold on each service's default).
   *
   * Distinct from {@link NewProjectCommand.layout}, which is the
   * *repository* layout of a composite install.
   */
  readonly moduleLayout?: string;
  /**
   * Also scaffold a second bounded context alongside the skeleton's
   * own, reaching it only through its `user-side/service` seam — the
   * inter-context edge made demonstrable rather than merely
   * described.
   *
   * Only meaningful under the modulith layout, which is what creates
   * the seam; rejected otherwise, since there would be nothing for
   * the second context to meet the first at.
   */
  readonly withPeerContext?: boolean;
}

/** Layer an additional vertical onto an initialised project. */
export interface AddVerticalCommand extends Command<InstallReport> {
  readonly kind: 'keel.add-vertical';
  readonly cwd: string;
  /** Vertical id, e.g. `distribution`. */
  readonly vertical: string;
  readonly answers: PresetAnswers;
  readonly interactive: boolean;
  readonly dryRun: boolean;
}

/** Result DTO of `keel link`. */
export interface LinkReport {
  /** The peer's directory as recorded in this project's manifest. */
  readonly ref: string;
  /** Peer tags the sibling now projects into this project. */
  readonly projectedHere: readonly string[];
  /** Peer tags this project now projects into the sibling. */
  readonly projectedThere: readonly string[];
}

/**
 * Record a sibling keel project as a peer — both ways — so
 * peer-conditional adapters resolve on later `keel add` runs. The
 * polyrepo counterpart of what a composite `keel new` records
 * automatically, and the brownfield path for attaching a new service
 * to an existing one.
 */
export interface LinkPeerCommand extends Command<LinkReport> {
  readonly kind: 'keel.link-peer';
  readonly cwd: string;
  /** Path of the peer project, relative to cwd (or absolute). */
  readonly ref: string;
}

/** Constructs a {@link LinkPeerCommand}. */
export function linkPeerCommand(input: Omit<LinkPeerCommand, 'kind' | 'intent'>): LinkPeerCommand {
  return { kind: 'keel.link-peer', intent: 'command', ...input };
}

/** Constructs a {@link NewProjectCommand}. */
export function newProjectCommand(
  input: Omit<NewProjectCommand, 'kind' | 'intent'>,
): NewProjectCommand {
  return { kind: 'keel.new-project', intent: 'command', ...input };
}

/** Constructs an {@link AddVerticalCommand}. */
export function addVerticalCommand(
  input: Omit<AddVerticalCommand, 'kind' | 'intent'>,
): AddVerticalCommand {
  return { kind: 'keel.add-vertical', intent: 'command', ...input };
}
