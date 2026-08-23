/**
 * The inputs `keel add module <name>` hands its adapters, and the tag
 * that selects them.
 *
 * **Why the answers channel rather than a new one.** An adapter reads
 * resolved values off the manifest snapshot through
 * `manifest.answers[<id>]`, and reading *another* unit's answers by a
 * well-known id is established practice here — `goBootstrapAnswers` is
 * how every downstream Go adapter learns the module path without
 * re-asking. `add module` needs exactly that shape: one set of values,
 * settled before resolution, read by whichever family's adapter fires.
 * Keying them under a single pseudo-adapter id means the handler seeds
 * one record instead of one per family, and a family added later reads
 * the same key without the handler learning its name.
 *
 * **Both the answers and the tag are transient, and the handler
 * strips them.** They are install-time selectors, not facts about the
 * project: `modules.context` says "an add-module run is happening",
 * which stops being true the moment it finishes, and the name belongs
 * in {@link ManifestV2.modules} where it is a fact rather than in
 * `answers` where it would read as a default for the *next* context.
 * A persisted `modules.context` would be worse than untidy — every
 * family's context adapter would fire again on the next unrelated
 * install, and try to re-emit a context that is already there.
 */

import type { ManifestV2 } from '../../contract/manifest.js';
import type { PresetAnswers } from '../../contract/commands.js';
import type { Conflict, Tag } from '../../contract/composition.js';
import { MODULITH_LAYOUT_TAG } from './module-layout.js';

/**
 * The well-known key the add-module inputs are recorded under.
 *
 * Deliberately the command's own name rather than any adapter's: no
 * adapter owns these answers, every family's adapter reads them.
 */
export const ADD_MODULE_INPUT_ID = 'keel.add-module';

/**
 * Selects the context-shell adapters. Set for the duration of one
 * `keel add module` run and never persisted.
 *
 * Its other job is to be the marker the front-door gate probes for:
 * a shell adapter requires it, so "is there an adapter for this
 * project's language?" is answerable before anything is written, by
 * the same {@link emitsFor} the `--with-peer-context` gate uses.
 */
export const CONTEXT_TAG: Tag = 'modules.context';

/**
 * The rule that a bounded context needs the layout that gives it a
 * seam to meet its peers at.
 *
 * The same sentence as `PEER_CONTEXT_NEEDS_MODULITH` about the other
 * door: `keel new --with-peer-context` seeds a second context at
 * scaffold time, `keel add module` seeds one later, and neither has
 * anywhere to put it under the flat layout. Two rules rather than one
 * because they are owned by different pieces — the walking skeleton
 * constrains its own peer-context capability, this vertical
 * constrains the context it emits — and a rule belongs to its
 * declarer, never to a central table.
 *
 * Declared rather than checked for the reason the peer rule was: it
 * is read twice. `keel add module` refuses an assembly that violates
 * it, and `ProjectStatusHandler`'s `canAddModule` — what a graphical
 * front end greys the control out by — filters on the same sentence.
 * Those were two hand-written copies of one rule sitting in two
 * handlers, which is the arrangement that lets a refusal and a menu
 * drift apart.
 */
export const CONTEXT_NEEDS_MODULITH: Conflict = {
  id: 'bounded-context/context-needs-modulith',
  when: [CONTEXT_TAG],
  unless: [MODULITH_LAYOUT_TAG],
  reason:
    'a bounded context needs the modulith layout: contexts meet only at the peer-facing seam the modulith puts between them, and the flat layout is one hexagon for the whole service with no seam for a second context to meet the first at. "keel add module" needs a project scaffolded with --module-layout=modulith',
};

/** The context an add-module run is emitting, as its adapters see it. */
export interface AddedContext {
  /** The new context's name, already validated at the front door. */
  readonly name: string;
  /** The context it reaches through a gateway, or null under no `--consumes`. */
  readonly consumes: string | null;
}

/** Builds the answers record the handler seeds before resolution. */
export function addModuleInputs(context: AddedContext): PresetAnswers {
  return {
    [ADD_MODULE_INPUT_ID]: {
      name: context.name,
      ...(context.consumes === null ? {} : { consumes: context.consumes }),
    },
  };
}

/**
 * Reads the add-module inputs from the running manifest snapshot.
 *
 * Throws rather than defaulting when the name is missing: every caller
 * is an adapter that only fires under {@link CONTEXT_TAG}, so an absent
 * name means the handler failed to seed it, which is a bug in keel and
 * not a state the user can reach. Same stance as `goBootstrapAnswers`.
 */
export function addedContext(manifest: ManifestV2, requesterId: string): AddedContext {
  const answers = manifest.answers[ADD_MODULE_INPUT_ID];
  const name = answers?.name;
  if (!name) {
    throw new Error(
      `${requesterId}: no module name under '${ADD_MODULE_INPUT_ID}' in the manifest — the add-module handler seeds it before resolution`,
    );
  }
  return { name, consumes: answers.consumes ?? null };
}

/** Strips the transient add-module state before the manifest is persisted. */
export function withoutAddModuleInputs(manifest: ManifestV2): ManifestV2 {
  const answers = Object.fromEntries(
    Object.entries(manifest.answers).filter(([id]) => id !== ADD_MODULE_INPUT_ID),
  );
  return {
    ...manifest,
    answers,
    tags: manifest.tags.filter((tag) => tag !== CONTEXT_TAG),
  };
}
