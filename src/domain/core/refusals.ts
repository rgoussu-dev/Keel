/**
 * The one place a refusal is put into words — the vocabulary a user
 * picked their project in, never the engine's.
 *
 * A refusal is data first (`Refusal`, in
 * `../contract/refusal.ts`): which vertical, what the project lacks
 * as tags, which stacks carry it, where it goes instead, which file is
 * in the way. {@link refusalSentence} is the one reading of that data
 * as a sentence, and every refusal a front door raises about a
 * vertical is built here, as a `RefusalError` carrying both — the
 * resolver's last-line throw, the planner's refusals (`./plan-refusal.ts`),
 * `keel.dials`' reasons for dropping an extra, `keel add`'s product-root
 * redirect and `keel new`'s composite `--with`. So a fact reads the
 * same whichever of them meets it first, and in either phase.
 *
 * **Phase-neutral.** A sentence here never says `--with` or `keel
 * add`: `keel new --with persistence` on a CLI preset and `keel add
 * persistence` on the project it scaffolds are refused in one sentence,
 * word for word (the composition grid's I5 holds them to it). The
 * remedy only one command has — drop it from `--with`, `keel link`
 * first, move a file aside before `keel new` — is the front end's, and
 * the CLI builds it from the refusal's fields.
 *
 * **No tag is ever printed.** A gap is a fact about tags, and printed
 * as it stands it reads as advice — `would need framework.quarkus` on
 * a Spring project — while naming something no command can add: a
 * project's language, framework, runtime, build system and layout are
 * fixed by the preset at `keel new`. So the sentence sorts the gap
 * before it speaks:
 *
 *   - an **identity** tag (`lang.`, `framework.`, `runtime.`, `pkg.`,
 *     `layout.`, and any `arch.` tag that is not an entrypoint) means
 *     the project is the wrong kind for every adapter the vertical has,
 *     and the sentence says so, naming the nearest stacks that carry
 *     the vertical instead — or, when all that differs is the build
 *     system, the build systems by their labels;
 *   - an **entrypoint** tag is named by its {@link ENTRYPOINTS} label,
 *     the words the finder offered it in ("HTTP server — a REST
 *     endpoint");
 *   - a **peer** tag is what a linked project projects, and reads as
 *     linking one that serves it;
 *   - any other tag is a capability some vertical adds, and is named
 *     by that vertical's title.
 *
 * The tags are not lost: they travel in the refusal's `missing` field,
 * for a front end or an adapter author that wants the engine's view.
 * A vertical is named by its title, because the id is what a user
 * types and the title is what they recognise.
 *
 * The two sentences about files are the exception to "built here":
 * an adapter raises those, and an adapter reaches keel only through
 * the contract, so they are spelled beside their errors
 * (`pathSentence`) and read through here like every other.
 *
 * The sentences a supplied answer no adapter reads is refused with
 * (`./supplied-answers.ts`) live here too, for the same reason: both
 * front doors speak them. So do the notes a run reports what it
 * decided with: what it was asked for and found already there, the
 * prerequisites it added, the order it installed in, the refreshes it
 * proposes.
 */

import type { Conflict, Tag, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { ReadinessGap } from '../contract/queries.js';
import {
  pathSentence,
  RefusalError,
  type ElsewhereService,
  type Refusal,
  type UnavailableRefusal,
} from '../contract/refusal.js';
import { conflictsOf, violatedBy } from './compatibility.js';
import { matchesPattern } from './predicate.js';
import { verticalTitle } from './registry.js';
import { ENTRYPOINTS } from './stack-wizard.js';
import { BUILD_SYSTEMS } from './stacks.js';

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
 * The code a vertical is refused with, in both phases, when nothing
 * keel can add makes it install here — asked ahead of time by the
 * planner, or met by the resolver as an uncovered dimension, because
 * it is the same condition either way.
 */
export const UNCOVERED_CODE = 'keel.uncoverable-vertical';

/**
 * The code a vertical is refused with when one of its own rules
 * forbids this project, and a set when no order installs it together.
 */
export const INCOMPATIBLE_CODE = 'keel.incompatible';

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
 * Where a sentence looks names up: a vertical's title by its id, and
 * which verticals add a capability. A {@link Registry} is one; the
 * resolver, which is handed a vertical rather than a registry, may
 * have only that vertical to go on.
 */
export type RefusalNames = Pick<Registry, 'vertical' | 'verticals'>;

/**
 * The sentence `refusal` is written in — the whole of what a user
 * reads, and the same in both phases. See the module header for how
 * each kind speaks.
 */
export function refusalSentence(refusal: Refusal, names: RefusalNames): string {
  switch (refusal.kind) {
    case 'needs': {
      const who = refusal.verticals.map((id) => titleOf(names, id));
      const verb = who.length === 1 ? 'needs' : 'need';
      const choices = refusal.prerequisites.map((set) => `(${set.join(', ')})`);
      return `${listed(who)} ${verb} one of these installed first, and choosing is yours: ${choices.join(' or ')} — name the one you want as well`;
    }
    case 'unavailable':
      return unavailableSentence(refusal, names);
    case 'elsewhere':
      return `${titleOf(names, refusal.vertical)} belongs to a service, not to the product root — ${whereItGoes(refusal.services)}`;
    case 'incompatible':
      return `${listed(refusal.verticals.map((id) => titleOf(names, id)))} cannot be installed together here — each installs on its own, but no order installs them all; drop one`;
    case 'path-conflict':
    case 'path-missing':
      return pathSentence(refusal);
  }
}

/** A `RefusalError` for `refusal`, under `code`, in its {@link refusalSentence}. */
export function refusalError(refusal: Refusal, code: string, names: RefusalNames): RefusalError {
  return new RefusalError(refusalSentence(refusal, names), code, refusal);
}

/**
 * The refusal of a vertical the planner reads as unavailable here,
 * from its {@link ReadinessGap}. A gap that is a rule is refused as
 * that rule (`keel.incompatible`), in its own sentence and under its
 * id — one of the vertical's own, or one of `rules`, those the pieces
 * already on the project declare (`PlanScope.rules`), which its tags
 * would break; any other gap as {@link UNCOVERED_CODE}.
 */
export function unavailableRefusal(
  names: RefusalNames,
  vertical: Vertical,
  gap: ReadinessGap,
  rules: readonly Conflict[] = [],
): RefusalError {
  const broken = conflictsOf([vertical, { conflicts: rules }]).filter((conflict) =>
    gap.rules.includes(conflict.id),
  );
  const refusal: UnavailableRefusal = {
    kind: 'unavailable',
    vertical: vertical.id,
    missing: missingOf(gap.entrypoint, gap.peer, gap.identity),
    carriedBy: gap.nearestStacks,
    ...(broken.length > 0
      ? { because: rulesSentence(broken), rules: broken.map((conflict) => conflict.id) }
      : {}),
  };
  return refusalError(refusal, broken.length > 0 ? INCOMPATIBLE_CODE : UNCOVERED_CODE, names);
}

/**
 * The refusal of a vertical one of whose own rules `tags` breaks, or
 * null when none does — the rule's sentence and id, never the tags
 * that tripped it (they are in the rule, for whoever looks it up).
 */
export function ruleRefusal(
  names: RefusalNames,
  vertical: Vertical,
  tags: readonly Tag[],
): RefusalError | null {
  const broken = violatedBy(conflictsOf([vertical]), tags);
  return broken.length === 0 ? null : brokenRulesRefusal(names, vertical, broken);
}

/**
 * The refusal of `vertical` for `broken`, the rules installing it
 * breaks — its own, or one a piece already there declares that the
 * tags it adds trip — each in its own sentence and under its id, as
 * `keel.incompatible`.
 */
export function brokenRulesRefusal(
  names: RefusalNames,
  vertical: Vertical,
  broken: readonly Conflict[],
): RefusalError {
  return refusalError(
    {
      kind: 'unavailable',
      vertical: vertical.id,
      missing: {},
      carriedBy: [],
      because: rulesSentence(broken),
      rules: broken.map((conflict) => conflict.id),
    },
    INCOMPATIBLE_CODE,
    names,
  );
}

/**
 * The refusal the resolver throws for a vertical with a dimension no
 * adapter here covers: `enablers` are the unmet tags of the adapter
 * nearest to matching (`CoverageGap.enablers`), sorted into the gap's
 * three kinds. `names` is what the resolver has to name a capability's
 * vertical with — the registry, when the install was handed one.
 */
export function uncoveredRefusal(
  vertical: Vertical,
  enablers: readonly Tag[],
  names: RefusalNames = onlyNames(vertical),
): RefusalError {
  const entrypoint = enablers.filter((tag) => ENTRYPOINTS.some((entry) => entry.tag === tag));
  const peer = enablers.filter((tag) => tag.startsWith(PEER_NAMESPACE));
  const identity = enablers.filter((tag) => !entrypoint.includes(tag) && !peer.includes(tag));
  return refusalError(
    {
      kind: 'unavailable',
      vertical: vertical.id,
      missing: missingOf(entrypoint, peer, identity),
      carriedBy: [],
    },
    UNCOVERED_CODE,
    withVertical(names, vertical),
  );
}

/**
 * The refusal of a request tied between two or more sets of
 * prerequisites, equally small: `needing` are the requested verticals,
 * `options` each set, in install order.
 */
export function tiedRefusal(
  names: RefusalNames,
  needing: readonly Vertical[],
  options: readonly (readonly Vertical[])[],
): RefusalError {
  return refusalError(
    {
      kind: 'needs',
      verticals: needing.map((vertical) => vertical.id),
      prerequisites: options.map((set) => set.map((vertical) => vertical.id)),
    },
    MISSING_PREREQUISITES_CODE,
    names,
  );
}

/**
 * The refusal of verticals each of which installs here on its own but
 * that no order installs together: whichever goes first, a later
 * one's tags rule out what it resolved to, or break one of its rules.
 */
export function incompatibleRefusal(
  names: RefusalNames,
  verticals: readonly Vertical[],
): RefusalError {
  return refusalError(
    { kind: 'incompatible', verticals: verticals.map((vertical) => vertical.id) },
    INCOMPATIBLE_CODE,
    names,
  );
}

/**
 * The refusal of a vertical asked of a composite product rather than
 * one of its services: a product root holds services, and a capability
 * belongs to one of them. Names the service directories, and which of
 * them can take it, rather than the tags the root lacks — a root
 * carries almost none, so its nearest adapter is whichever family
 * happens to sit closest to an empty set, and its gap is advice for a
 * different product. `code` is the one the front door has always
 * refused this with.
 */
export function elsewhereRefusal(
  names: RefusalNames,
  vertical: Vertical,
  services: readonly ElsewhereService[],
  code: string,
): RefusalError {
  return refusalError({ kind: 'elsewhere', vertical: vertical.id, services }, code, names);
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
 * An {@link UnavailableRefusal} in words: a reason the vertical gives
 * for itself first; then the project's kind, when that is what is
 * wrong — a mixed gap reads as that, since adding the entrypoint alone
 * would not help; then the entrypoints it lacks; then the linked
 * project it lacks; then the capabilities some vertical adds.
 */
function unavailableSentence(refusal: UnavailableRefusal, names: RefusalNames): string {
  const title = titleOf(names, refusal.vertical);
  if (refusal.because !== undefined) return `${title} cannot be installed here: ${refusal.because}`;
  const entrypoint = refusal.missing.entrypoint ?? [];
  const peer = refusal.missing.peer ?? [];
  const identity = refusal.missing.identity ?? [];
  const capabilities = identity.filter((tag) => !isIdentity(tag));
  const providers = capabilities.map((tag) => providersOf(names, tag));
  const fixed = identity.filter(isIdentity);
  if (
    fixed.length > 0 ||
    providers.some((by) => by.length === 0) ||
    entrypoint.length + peer.length + identity.length === 0
  ) {
    const carried = nearest(refusal.carriedBy);
    const builds = fixed.filter((tag) => tag.startsWith('pkg.'));
    if (builds.length > 0 && builds.length === fixed.length && capabilities.length === 0) {
      const labels = builds.map((tag) => buildSystemLabel(tag));
      return `${title} has no adapter for this project's build system; it needs ${labels.join(' or ')}${carried}`;
    }
    return `${title} has no adapter for this project's stack${carried}`;
  }
  const needs: string[] = [];
  const entries = ENTRYPOINTS.filter((entry) => entrypoint.includes(entry.tag));
  if (entries.length > 0) {
    const noun = entries.length === 1 ? 'an entrypoint' : 'entrypoints';
    needs.push(
      `${noun} this project does not have: ${entries.map((entry) => entry.label).join(', ')}`,
    );
  }
  if (entries.length === 0 && peer.length > 0) {
    return `${title} wires linked projects, and no linked project serves it here — link one that does first`;
  }
  if (capabilities.length > 0) {
    const adders = [...new Set(providers.flat())];
    const verb = adders.length === 1 ? 'adds' : 'add';
    needs.push(`what ${listed(adders)} ${verb}, which this project does not have yet`);
  }
  return `${title} needs ${needs.join('; and ')}`;
}

/** The nearest-stacks tail of an identity sentence; empty when none carries it. */
function nearest(carriedBy: readonly string[]): string {
  if (carriedBy.length === 0) return '';
  return carriedBy.length === 1
    ? `; the nearest stack that carries it: ${carriedBy[0] ?? ''}`
    : `; the nearest stacks that carry it: ${carriedBy.join(', ')}`;
}

/** Where an elsewhere-refused vertical goes, by its services' readiness. */
function whereItGoes(services: readonly ElsewhereService[]): string {
  const carriers = services.filter(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  if (carriers.length > 0) return `it goes in ${directories(carriers, 'or')}`;
  const having = services.filter((service) => service.readiness === 'included');
  if (having.length > 0) {
    return `${directories(having, 'and')} ${having.length === 1 ? 'has' : 'have'} it already`;
  }
  return 'none of its services can carry it';
}

/** `backend/`, `backend/ or frontend/`, `a/, b/ and c/`. */
function directories(services: readonly { readonly path: string }[], last: 'or' | 'and'): string {
  const dirs = services.map((service) => `${service.path}/`);
  if (dirs.length <= 1) return dirs.join('');
  return `${dirs.slice(0, -1).join(', ')} ${last} ${dirs[dirs.length - 1] ?? ''}`;
}

/** The `missing` of an {@link UnavailableRefusal}, each key only when it holds a tag. */
function missingOf(
  entrypoint: readonly Tag[],
  peer: readonly Tag[],
  identity: readonly Tag[],
): UnavailableRefusal['missing'] {
  return {
    ...(entrypoint.length > 0 ? { entrypoint } : {}),
    ...(peer.length > 0 ? { peer } : {}),
    ...(identity.length > 0 ? { identity } : {}),
  };
}

/**
 * Each broken rule's own sentence, with the id a user searches for —
 * never the tags that tripped it, which are in the rule for whoever
 * looks it up. What a refusal of something other than a vertical says
 * of a rule too: `keel add module` on the flat layout.
 */
export function rulesSentence(
  broken: readonly { readonly id: string; readonly reason: string }[],
): string {
  return broken.map((conflict) => `${conflict.reason} (rule '${conflict.id}')`).join('; ');
}

/** Whether `tag` is one a preset fixes at `keel new`. */
function isIdentity(tag: Tag): boolean {
  return IDENTITY_NAMESPACES.some((ns) => tag.startsWith(ns));
}

/** The titles of the verticals that may add a tag `pattern` matches, in registry order. */
function providersOf(names: RefusalNames, pattern: Tag): readonly string[] {
  return names
    .verticals()
    .filter((vertical) => matchesPattern(pattern, new Set(vertical.promotes ?? [])))
    .map(verticalTitle);
}

/** A `pkg.*` tag by its build system's label, or the build system's id spelled out. */
function buildSystemLabel(tag: Tag): string {
  const option = Object.values(BUILD_SYSTEMS).find((candidate) => candidate.tag === tag);
  return option?.label ?? tag.slice('pkg.'.length);
}

/** A vertical's title by id: its own when registered, the id spelled out when not. */
function titleOf(names: RefusalNames, id: string): string {
  return verticalTitle(names.vertical(id) ?? { id, description: '', dimensions: [], adapters: [] });
}

/** Names for a caller holding only `vertical`: its title, and no capability's vertical. */
function onlyNames(vertical: Vertical): RefusalNames {
  return { vertical: (id) => (id === vertical.id ? vertical : null), verticals: () => [] };
}

/** `names`, answering for `vertical` even where they do not know it. */
function withVertical(names: RefusalNames, vertical: Vertical): RefusalNames {
  return {
    vertical: (id) => (id === vertical.id ? vertical : names.vertical(id)),
    verticals: () => names.verticals(),
  };
}

/** What a linked project projects onto this one (`keel link`). */
const PEER_NAMESPACE = 'peer.';

/** `A`, `A and B`, `A, B and C`. */
function listed(names: readonly string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;
}
