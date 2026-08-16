/**
 * The inputs `keel add module <name>` hands its adapters, and the two
 * tags that select them.
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
 * **Both the answers and the tags are transient, and the handler
 * strips them.** They are install-time selectors, not facts about the
 * project: `modules.context` says "an add-module run is happening",
 * which stops being true the moment it finishes, and the name belongs
 * in {@link ManifestV2.modules} where it is a fact rather than in
 * `answers` where it would read as a default for the *next* context.
 * A persisted `modules.consumes` would be worse than untidy — the
 * gateway adapter would fire again on the next unrelated install.
 */

import type { ManifestV2 } from '../../contract/manifest.js';
import type { PresetAnswers } from '../../contract/commands.js';
import type { Tag } from '../../contract/composition.js';

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
 * Selects the gateway adapters — the consumer edge, emitted only under
 * `--consumes <other>`.
 *
 * A separate tag rather than a branch inside the shell adapter,
 * because it is a separate decision: the shell is what the user asked
 * for and the gateway is what they opted into. Splitting them at the
 * predicate keeps "no gateway unless asked" a structural property
 * rather than an `if` some family could forget.
 */
export const CONSUMES_TAG: Tag = 'modules.consumes';

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
    tags: manifest.tags.filter((tag) => tag !== CONTEXT_TAG && tag !== CONSUMES_TAG),
  };
}
