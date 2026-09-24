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
 * front doors speak them.
 */

import type { Tag, Vertical } from '../contract/composition.js';
import { verticalTitle } from './registry.js';
import { ENTRYPOINTS } from './stack-wizard.js';

/**
 * Tag namespaces a preset fixes at `keel new`. An adapter that needs
 * one this project lacks is an adapter for another kind of project.
 * `arch.` is read after the entrypoints are picked out, so what it
 * catches is a shape such as `arch.hexagonal`. (A container image
 * records its flavour as a `runtime.` tag too, but no adapter requires
 * one, so it never turns up in a gap.)
 */
const IDENTITY_NAMESPACES: readonly string[] = [
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
