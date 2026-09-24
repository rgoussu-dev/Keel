/**
 * The sentences a coverage refusal is written in — the vocabulary a
 * user picked their project in, never the engine's.
 *
 * A coverage gap (`CoverageGap` in `./resolver.ts`) is a fact about
 * tags: which dimensions no adapter covers, and the unmet `requires`
 * of the adapter nearest to matching. Printed as it stands, that fact
 * reads as advice — `would need framework.quarkus` on a Spring
 * project, `lang.go` on a TypeScript front end, `arch.cli,
 * arch.hexagonal, lang.go` at a product root — and most of it names
 * something no command can add: a project's language, framework,
 * runtime, build system and layout are fixed by the preset at
 * `keel new`. So the sentence sorts the tags before it speaks:
 *
 *   - an **identity** tag (`lang.`, `framework.`, `runtime.`, `pkg.`,
 *     `layout.`, and any `arch.` tag that is not an entrypoint) means
 *     the project is the wrong kind for every adapter the vertical
 *     has, and the sentence says exactly that — no tag list, since a
 *     remedy nobody can apply is noise;
 *   - an **entrypoint** tag is printed through its
 *     {@link ENTRYPOINTS} label, the words the finder offered it in
 *     ("HTTP server — a REST endpoint");
 *   - anything else is a capability some other install adds, and is
 *     named as missing *yet*.
 *
 * The tags are not lost: `ResolutionError.detail.enablers` still
 * carries them, for a front end or an adapter author that wants the
 * engine's view. And the vertical is named by its title, because the
 * id is what a user types and the title is what they recognise.
 *
 * Shared by the resolver's throw, `keel new --with`'s front door and
 * `keel add`'s product-root redirect, so a refusal reads the same
 * whichever of them meets it first.
 *
 * The sentences a supplied answer no adapter reads is refused with
 * (`./supplied-answers.ts`) live here too, for the same reason: both
 * front doors speak them. So do the ones a plan that cannot be
 * installed is refused with (`./planner.ts`, spoken through
 * `./plan-refusal.ts`): a tie between two sets of prerequisites, a
 * vertical the scope cannot carry, verticals that cannot go together —
 * and the notes a run reports what it decided with: what it was asked
 * for and found already there, the prerequisites it added, the order
 * it installed in, the refreshes it proposes.
 */

import type { Tag, Vertical } from '../contract/composition.js';
import type { ReadinessGap } from '../contract/queries.js';
import { verticalTitle } from './registry.js';
import { ENTRYPOINTS } from './stack-wizard.js';

/**
 * The code a set is refused with, in both phases, when it needs
 * prerequisites and two sets of them would each do, equally small —
 * two plugins supplying one capability. A prerequisite nothing ties
 * is included instead (`./plan-refusal.ts`); a tie is the user's to
 * settle, by naming the one they want. Plural because the refusal
 * names every option whole, and it is the code the missing-image
 * refusal carried before prerequisites were included, so a script
 * matching it keeps working.
 */
export const MISSING_PREREQUISITES_CODE = 'keel.missing-prerequisites';

/**
 * Tag namespaces a preset fixes at `keel new`. An adapter that needs
 * one this project lacks is an adapter for another kind of project.
 * `arch.` is read after the entrypoints are picked out, so what it
 * catches is a shape such as `arch.hexagonal`. (A container image
 * records its flavour as a `runtime.` tag too, but no adapter requires
 * one, so it never turns up in a gap.)
 */
export const IDENTITY_NAMESPACES: readonly string[] = [
  'lang.',
  'framework.',
  'runtime.',
  'pkg.',
  'layout.',
  'arch.',
];

/**
 * The sentence a vertical is refused with when it cannot be covered:
 * `enablers` are the gap's tags (`CoverageGap.enablers`), and the
 * result names none of the identity ones.
 *
 * Mixed gaps read as identity gaps. If the nearest adapter also needs
 * a language or a framework this project does not have, the missing
 * entrypoint is not the reason it cannot be installed, and saying
 * "needs an HTTP server" would send the user after a change that does
 * not help.
 */
export function coverageSentence(vertical: Vertical, enablers: readonly Tag[]): string {
  const title = verticalTitle(vertical);
  const entrypoints = ENTRYPOINTS.filter((entry) => enablers.includes(entry.tag));
  const rest = enablers.filter((tag) => !entrypoints.some((entry) => entry.tag === tag));
  const acquirable = rest.filter((tag) => !IDENTITY_NAMESPACES.some((ns) => tag.startsWith(ns)));
  if (enablers.length === 0 || acquirable.length < rest.length) {
    return `${title} has no adapter for this project's stack`;
  }
  const needs: string[] = [];
  if (entrypoints.length > 0) {
    const noun = entrypoints.length === 1 ? 'an entrypoint' : 'entrypoints';
    needs.push(
      `${noun} this project does not have: ${entrypoints.map((entry) => entry.label).join(', ')}`,
    );
  }
  if (acquirable.length > 0) {
    needs.push(`a capability this project does not have yet: ${acquirable.join(', ')}`);
  }
  return `${title} needs ${needs.join('; and ')}`;
}

/**
 * The sentence a vertical is refused with at a composite product's
 * root, where it has nothing to be installed on: a product root holds
 * services, and capabilities belong to one of them.
 *
 * Names the service directories rather than the tags the root lacks.
 * A root carries almost none, so its nearest adapter is whichever
 * family happens to sit closest to an empty set, and the gap it
 * reports is advice for a different product.
 */
export function productRootSentence(
  vertical: Vertical,
  services: readonly { readonly path: string }[],
): string {
  return `${verticalTitle(vertical)} belongs to a service, and this is a product root — run 'keel add ${vertical.id}' inside ${serviceDirectories(services)}`;
}

/** `backend/`, `backend/ or frontend/`, `a/, b/ or c/`. */
function serviceDirectories(services: readonly { readonly path: string }[]): string {
  const dirs = services.map((service) => `${service.path}/`);
  if (dirs.length <= 1) return dirs.join('');
  return `${dirs.slice(0, -1).join(', ')} or ${dirs[dirs.length - 1] ?? ''}`;
}

/**
 * The sentence an answer supplied for an installed vertical's adapter
 * is refused with: `key` is the `adapterId:questionId` it was supplied
 * as. Moving a recorded answer is out of scope, and taking it quietly
 * would leave the manifest disagreeing with the files it rendered.
 */
export function frozenAnswerSentence(owner: Vertical, key: string): string {
  return `${verticalTitle(owner)} is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for ${key})`;
}

/**
 * The sentence an answer is refused with when no adapter of the plan
 * reads its key: `key` is the `adapterId:questionId` it was supplied
 * as, and `askers` the plan's adapters that do take answers — the
 * keys it could have meant.
 */
export function unknownAnswerSentence(key: string, askers: readonly string[]): string {
  const where =
    askers.length === 0
      ? 'nothing in this plan asks a question'
      : `the adapters that take answers here: ${askers.join(', ')}`;
  return `no adapter in this plan reads an answer for ${key}; ${where}`;
}

/**
 * The sentence an answer is refused with when its adapter is in the
 * plan but asks no such question — a typo, most likely, which would
 * otherwise be recorded and never read.
 */
export function unknownQuestionSentence(
  adapterId: string,
  questionId: string,
  asked: readonly string[],
): string {
  return `${adapterId} asks no question '${questionId}'; it asks: ${asked.join(', ')}`;
}

/**
 * The note `keel new --with` gives for a vertical the preset installs
 * of its own: "Development environment already comes with
 * quarkus-rest". Asking for what is already in the plan has one
 * sensible reading, so the id is dropped from the request rather than
 * refused. `keel.dials` drops it from a page's extras in the same
 * words.
 */
export function alreadyIncludedNote(vertical: Vertical, stackId: string): string {
  return `${verticalTitle(vertical)} already comes with ${stackId}`;
}

/**
 * The note `keel add` gives for a vertical the project has installed
 * already: there is nothing to install, and the run says which command
 * does re-render it. Asking for what is there has one sensible
 * reading, so it is Ok, not a refusal — a script that adds what it
 * needs can run twice.
 */
export function alreadyInstalledNote(vertical: Vertical): string {
  return `${verticalTitle(vertical)} is already installed; 'keel add ${vertical.id} --reapply' re-renders it`;
}

/**
 * The note a run opens with when it installs verticals it was not
 * asked for, because the ones it was need them: `added Container
 * image, Distribution — needed by Infrastructure as code`. Titles, in
 * the order they install. Phase-neutral, like the refusal it
 * replaced — `keel new --with` and `keel add` say the same thing.
 */
export function addedPrerequisitesNote(
  added: readonly Vertical[],
  neededBy: readonly Vertical[],
): string {
  return `added ${added.map(verticalTitle).join(', ')} — needed by ${listed(neededBy.map(verticalTitle))}`;
}

/**
 * The note a run gives when the order its verticals were named in put
 * one ahead of what it needs or reads: the ids in the order they
 * install instead.
 */
export function dependencyOrderNote(order: readonly Vertical[]): string {
  return `installed in dependency order: ${order.map((vertical) => vertical.id).join(', ')}`;
}

/**
 * The note a `keel add` gives for an installed vertical it proposes
 * re-rendering: `vertical` reads `reads` (verticals the run installed)
 * and was rendered without them, or — `adapters` — would render
 * through other adapters on what the run adds; then how to take the
 * proposal up. A run that only planned (`committed` false) can be run
 * again with `--refresh`; one that wrote its files points at the plain
 * re-render, `--reapply`, since what it installed is there now and
 * naming it again would only be noted as already there.
 */
export function refreshProposalNote(
  vertical: Vertical,
  reads: readonly Vertical[],
  adapters: boolean,
  committed: boolean,
): string {
  const why = [
    ...(reads.length > 0
      ? [`reads ${listed(reads.map(verticalTitle))}, which it was rendered without`]
      : []),
    ...(adapters ? ['renders differently with what this adds'] : []),
  ].join(', and ');
  const reapply = `'keel add ${vertical.id} --reapply'`;
  const how = committed
    ? `re-render it with ${reapply}`
    : `re-render it in this run with --refresh ${vertical.id}, or afterwards with ${reapply}`;
  return `refresh proposed: ${verticalTitle(vertical)} ${why} — ${how}`;
}

/**
 * The sentence a set is refused with when two or more sets of
 * prerequisites would each let `needing` install, equally small:
 * choosing between two providers of one capability is the user's, so
 * each option is named, in install order.
 */
export function tiedPrerequisitesSentence(
  needing: readonly Vertical[],
  options: readonly (readonly Vertical[])[],
): string {
  const who = needing.map(verticalTitle);
  const verb = who.length === 1 ? 'needs' : 'need';
  const choices = options.map((set) => set.map((vertical) => vertical.id).join(', '));
  return `${listed(who)} ${verb} one of these installed first, and choosing is yours: ${choices
    .map((ids) => `(${ids})`)
    .join(' or ')} — add the one you want as well`;
}

/**
 * The sentence a vertical is refused with when nothing keel can add
 * makes it install on this scope: from the planner's
 * {@link ReadinessGap}, never its tags. A gap that is only a linked
 * project (a vertical selected by peer tags, like the gateway) points
 * at `keel link`; any other reads as {@link coverageSentence} does.
 */
export function unavailableSentence(vertical: Vertical, gap: ReadinessGap): string {
  if (gap.peer.length > 0 && gap.entrypoint.length === 0 && gap.identity.length === 0) {
    return `${verticalTitle(vertical)} wires linked projects — run 'keel link <path>' first`;
  }
  return coverageSentence(vertical, [...gap.entrypoint, ...gap.identity]);
}

/**
 * The sentence verticals are refused with when each installs here on
 * its own but no order installs them together: whichever goes first,
 * a later one's tags rule out what it resolved to, or break one of
 * its rules.
 */
export function incompatibleSentence(verticals: readonly Vertical[]): string {
  return `${listed(verticals.map(verticalTitle))} cannot be installed together here — each installs on its own, but no order installs them all; drop one`;
}

/** `A`, `A and B`, `A, B and C`. */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}
