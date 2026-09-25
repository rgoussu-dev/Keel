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
 * redirect and `keel new`'s composite `--with`, and a vertical placed at
 * a repository root asked of a monorepo service. So a fact reads the
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

import { DomainError } from '../kernel/result.js';
import type { Conflict, Tag, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Readiness, ReadinessGap } from '../contract/queries.js';
import {
  pathSentence,
  RefusalError,
  type ElsewhereRefusal,
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
 * The code a vertical is refused with, by `keel add`, when what stops
 * it is an installed vertical rendered through an adapter that does
 * not add what it needs — one a re-render in the same run would swap:
 * Distribution shipped as native binaries before the project had a
 * container image, and Infrastructure as code asked after. Not
 * `keel.uncoverable-vertical`, since something keel has would make it
 * install; not included on its own accord, since a re-render rewrites
 * files the user may have edited, and is theirs to ask for.
 */
export const NEEDS_REFRESH_CODE = 'keel.needs-refresh';

/**
 * The code a vertical is refused with when one of its own rules
 * forbids this project, and a set when no order installs it together.
 */
export const INCOMPATIBLE_CODE = 'keel.incompatible';

/**
 * The code a vertical is refused with, in both phases, when what
 * stops it is the scope it was asked in rather than the project: one
 * asked of a product root that belongs in a service (an `elsewhere`),
 * and one asked of a monorepo service that belongs at the repository
 * root — or needs a vertical that does (an `unavailable` naming
 * `repositoryOnly`). "Not here", where `keel.uncoverable-vertical` is
 * "not in this project".
 */
export const WRONG_SCOPE_CODE = 'keel.wrong-scope';

/**
 * The code `keel new` refuses a composite product with when two of its
 * scopes — the product root and a service, or two services — would
 * write one file: each scope stages into a Tree of its own, so without
 * this the one committed last would win, silently. A defect of the
 * pieces put together (a preset, a plugin's product glue), never of a
 * file the user keeps — that is `keel.path-conflict`.
 */
export const CROSS_SCOPE_WRITE_CODE = 'keel.cross-scope-write';

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
      return elsewhereSentence(refusal, names);
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
 * The refusal of `keel add module` where one of the bounded-context
 * vertical's own rules stops it — the flat layout — before a name is
 * read: `keel.incompatible`, as every broken rule is.
 *
 * Its sentence is the rules' own reasons, as a sentence of its own:
 * the one `keel ui` shows under the tab it disables, where a clause
 * that starts in lowercase and ends in a rule id reads as a log line —
 * and not the `unavailable` sentence its data would read as ("Bounded
 * context cannot be installed here: a bounded context needs …"),
 * which names the context twice. The ids are not lost — they travel in
 * the refusal's `rules`, for a script or an author who looks the rule
 * up, and `because` holds the reasons alone.
 */
export function moduleRulesRefusal(vertical: Vertical, broken: readonly Conflict[]): RefusalError {
  const because = broken.map((conflict) => conflict.reason).join('; ');
  return new RefusalError(
    `${because.charAt(0).toUpperCase()}${because.slice(1)}`,
    INCOMPATIBLE_CODE,
    {
      kind: 'unavailable',
      vertical: vertical.id,
      missing: {},
      carriedBy: [],
      because,
      rules: broken.map((conflict) => conflict.id),
    },
  );
}

/**
 * The refusal of a vertical the planner reads as unavailable here,
 * from its {@link ReadinessGap}. A gap that is a rule is refused as
 * that rule (`keel.incompatible`), in its own sentence and under its
 * id — one of the vertical's own, or one of `rules`, those the pieces
 * already on the project declare (`PlanScope.rules`), which its tags
 * would break; any other gap as {@link UNCOVERED_CODE}.
 *
 * `elsewhere` is, where the project is one service of a product, the
 * product's other services with how ready the vertical is in each
 * ({@link elsewhereService}): where one could take it or has it, the
 * refusal carries them and its sentence names it — but for a gap that
 * is where the service stands in the repository, or a re-render, which
 * say what to do here. Where none could, the refusal is the one a
 * single project gets, word for word.
 */
export function unavailableRefusal(
  names: RefusalNames,
  vertical: Vertical,
  gap: ReadinessGap,
  rules: readonly Conflict[] = [],
  elsewhere: readonly ElsewhereService[] = [],
): RefusalError {
  const placed = gap.repositoryOnly ?? [];
  if (placed.length > 0) {
    return refusalError(
      {
        kind: 'unavailable',
        vertical: vertical.id,
        missing: {},
        carriedBy: [],
        repositoryOnly: placed,
      },
      WRONG_SCOPE_CODE,
      names,
    );
  }
  if (gap.refresh !== undefined) {
    return refusalError(
      {
        kind: 'unavailable',
        vertical: vertical.id,
        missing: {},
        carriedBy: [],
        refresh: gap.refresh,
      },
      NEEDS_REFRESH_CODE,
      names,
    );
  }
  const broken = conflictsOf([vertical, { conflicts: rules }]).filter((conflict) =>
    gap.rules.includes(conflict.id),
  );
  const refusal: UnavailableRefusal = {
    kind: 'unavailable',
    vertical: vertical.id,
    missing: missingOf(gap.entrypoint, gap.peer, gap.identity),
    carriedBy: gap.nearestStacks,
    ...(gap.comesWith === undefined ? {} : { comesWith: gap.comesWith }),
    ...(elsewhere.some((service) => service.readiness !== 'unavailable') ? { elsewhere } : {}),
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
 * different product. Under {@link WRONG_SCOPE_CODE}, in both phases.
 *
 * A vertical the services that could have it all have already is not
 * refused at all — it is there ({@link inServicesNote}) — but for a
 * re-render of it at the root: that refusal names the services having
 * it, and where each has it from — its own install, re-rendered there,
 * or the product root, which builds it for them; where the root builds
 * it for each that has it, it is said as the root's, which has no
 * install of it to re-render.
 */
export function elsewhereRefusal(
  names: RefusalNames,
  vertical: Vertical,
  services: readonly ElsewhereService[],
): RefusalError {
  return refusalError(
    { kind: 'elsewhere', vertical: vertical.id, services },
    WRONG_SCOPE_CODE,
    names,
  );
}

/**
 * One service of an {@link ElsewhereRefusal}: where it is, and how
 * ready the vertical is there — with, where what stops it is the
 * service being part of a monorepo, the verticals whose place is the
 * repository root, which is what the sentence's way forward is read
 * from; and, where the service has it because the product root gives
 * it (`fromProduct`, the service's `PlanScope.member`), that it has
 * nothing of it to re-render.
 */
export function elsewhereService(
  path: string,
  stack: string,
  ready: Readiness,
  fromProduct = false,
): ElsewhereService {
  const placed = ready.kind === 'unavailable' ? (ready.gap.repositoryOnly ?? []) : [];
  return {
    path,
    stack,
    readiness: ready.kind,
    ...(ready.kind === 'included' && fromProduct ? { fromProduct: true as const } : {}),
    ...(placed.length > 0 ? { repositoryOnly: placed } : {}),
  };
}

/**
 * The refusal of a vertical placed at a repository root
 * (`Vertical.placement`) asked of a monorepo product's root, which is
 * that repository's root but carries none of its adapters: no service
 * can take it instead, since each is a directory of this repository —
 * so it is not sent anywhere. Under {@link UNCOVERED_CODE}: this is
 * the right scope, and nothing keel has installs it here.
 */
export function productRootPlacementRefusal(names: RefusalNames, vertical: Vertical): RefusalError {
  return refusalError(
    {
      kind: 'unavailable',
      vertical: vertical.id,
      missing: {},
      carriedBy: [],
      because: `keel installs it at no monorepo product's root yet, and it cannot go in one of the product's services: ${vertical.placement?.because ?? "its place is the repository's root"}`,
    },
    UNCOVERED_CODE,
    names,
  );
}

/** The code a re-render of a vertical this project has not installed is refused with. */
export const VERTICAL_NOT_INSTALLED_CODE = 'keel.vertical-not-installed';

/**
 * The sentence a re-render (`--reapply`, `--refresh`) of a vertical
 * this project has not installed is refused with, naming what installs
 * it instead.
 */
export function notInstalledSentence(vertical: Vertical, verb: 'reapply' | 'refresh'): string {
  return `vertical '${vertical.id}' is not installed in this project — nothing to ${verb}; install it with 'keel add ${vertical.id}'`;
}

/**
 * The sentence a re-render of a vertical a monorepo service has from
 * its product (`providedNote`'s `by`) is refused with: it is not this
 * service's to re-render, and installing it here would change
 * nothing — `repository`: the product root has it installed, and
 * re-renders it there; `product`: the product root builds it for the
 * service, which is no install of the root's either, so the sentence
 * names nowhere else to re-render it.
 */
export function providedNotInstalledSentence(
  vertical: Vertical,
  by: 'repository' | 'product',
  verb: 'reapply' | 'refresh',
): string {
  const where =
    by === 'repository'
      ? 'the product root has it, for the one repository its services share, and it is re-rendered there'
      : 'the product root builds it for this service';
  return `${verticalTitle(vertical)} is not installed in this service — ${where}: nothing to ${verb} here`;
}

/**
 * The refusal of a vertical whose place is a repository root
 * (`Vertical.placement`) asked of a monorepo service, in its own words
 * — the one `keel add` of it gets there (`keel.wrong-scope`), for
 * whatever else asks it of a service: a re-render of it.
 */
export function placementRefusal(names: RefusalNames, vertical: Vertical): RefusalError {
  return refusalError(
    {
      kind: 'unavailable',
      vertical: vertical.id,
      missing: {},
      carriedBy: [],
      repositoryOnly: [vertical.id],
    },
    WRONG_SCOPE_CODE,
    names,
  );
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
 * The sentence an answer is refused with when the question it answers
 * is shared (`Adapter.sharesAnswersWith`) and was also answered under
 * `readInstead`, the key read first: one question takes one answer,
 * and keeping the other would leave it quietly unread.
 */
export function shadowedAnswerSentence(key: string, readInstead: string): string {
  return `${key} is not read: it answers the same question as ${readInstead}, which is read first — send one answer for it`;
}

/**
 * The sentence an answer is refused with when the project's manifest
 * already records an answer to the question it would decide, under
 * `recorded`, and no installed vertical owns that key — an answer an
 * older keel recorded for an adapter this project never ran. The
 * recorded one is what every reader takes.
 */
export function recordedAnswerSentence(key: string, recorded: string): string {
  return `${key} is not read: this project's manifest records ${recorded}, written by an older keel although nothing installed here asked it, and that recorded answer is what is read — remove it from .claude/.keel-manifest.json to answer anew`;
}

/**
 * The sentence an answer is refused with when every adapter that could
 * read it had its answer to that question already, from a sibling
 * that settled it earlier in the run.
 */
export function settledAnswerSentence(key: string): string {
  return `${key} is not read: every adapter here that reads it has that answer already, from an adapter that settled it first`;
}

/**
 * The sentence an answer is refused with when it is supplied for an
 * adapter of a vertical being re-rendered that the manifest records
 * answers for: a re-render reads those, and moving one is out of scope.
 */
export function reapplyFrozenSentence(adapterId: string, vertical: Vertical): string {
  return `--set cannot change ${adapterId}'s answers: re-rendering '${vertical.id}' reads them as the manifest recorded them, and changing one is not supported yet`;
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
 * The note `keel new --with` gives for a vertical named for a composite
 * product without a service that the services able to have it have
 * already, each by what it comes with there: "Code style already comes
 * with quarkus-rest in backend/ and web-components in frontend/". As
 * for a single preset, asking for what the plan has is set aside, not
 * refused; `keel.dials` drops it from a page's extras in the same words.
 */
export function alreadyInServicesNote(
  vertical: Vertical,
  services: readonly { readonly path: string; readonly by: string }[],
): string {
  const by = new Map<string, { readonly path: string }[]>();
  for (const service of services) by.set(service.by, [...(by.get(service.by) ?? []), service]);
  const parts = [...by].map(([stack, paths]) => `${stack} in ${directories(paths, 'and')}`);
  return `${verticalTitle(vertical)} already comes with ${listed(parts)}`;
}

/**
 * The note `keel new` gives for a vertical named for a composite
 * product without a service, which one of its services alone can take
 * — so it goes there, and the run says where. `keel.dials` moves it
 * into that service's extras in the same words.
 */
export function routedExtraNote(vertical: Vertical, servicePath: string, product: string): string {
  return `${verticalTitle(vertical)} goes in ${servicePath}/, the one service of ${product} that can take it`;
}

/** Who wrote a file, for {@link crossScopeWriteError}. */
export interface ScopeWriter {
  /** The writing adapter's id (`<vertical>/<adapter>`); null for keel's own harness files. */
  readonly by: string | null;
  /** The scope's path under the product root; `''` for the root itself. */
  readonly scope: string;
}

/**
 * The refusal of a composite product two of whose scopes would both
 * write `path` (from the product root), naming each writer and where
 * it runs — {@link CROSS_SCOPE_WRITE_CODE}. Raised before the plan is
 * reported, so a preview and an install refuse it alike.
 */
export function crossScopeWriteError(
  path: string,
  first: ScopeWriter,
  second: ScopeWriter,
): DomainError {
  const who = (writer: ScopeWriter): string =>
    `${writer.by ?? "keel's own harness"} ${writer.scope === '' ? 'at the product root' : `in ${writer.scope}/`}`;
  return new DomainError(
    `${path} would be written by two scopes of this product — by ${who(first)}, and by ${who(second)} — and the one written last would silently replace the other; one of the product's pieces has to leave the file to the other`,
    CROSS_SCOPE_WRITE_CODE,
  );
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
 * The note `keel add` gives in a monorepo service for a vertical the
 * product gives it rather than an install of its own: `repository` —
 * the product root installed it, and its place is the repository the
 * service is part of; `product` — the product root builds it for this
 * service (an adapter's `providesInServices`). Nothing is installed,
 * and the run is Ok, as for one installed here already; there is
 * nothing here to re-render either, so the note names no command.
 */
export function providedNote(vertical: Vertical, by: 'repository' | 'product'): string {
  const where =
    by === 'repository'
      ? 'the product root has it, for the one repository its services share'
      : 'the product root builds it for this service';
  return `${verticalTitle(vertical)} is already there: ${where}`;
}

/**
 * The note `keel add` gives at a monorepo product's root for a vertical
 * the root cannot carry itself, that no service of it could take, and
 * that the services that could have it have — `paths`, in the
 * product's order: "Code style is already there: backend/ and frontend/
 * have it". The root's reading of what `keel new --with` sets aside on
 * the product ({@link alreadyInServicesNote}), so it is Ok, as for one
 * installed here already; a status lists it as provided with these
 * words.
 */
export function inServicesNote(vertical: Vertical, paths: readonly string[]): string {
  return `${verticalTitle(vertical)} is already there: ${haveIt(paths.map((path) => ({ path })))}`;
}

/**
 * The note `keel new` gives for a service of a monorepo product that a
 * vertical the product root builds for its services
 * (`Adapter.providesInServices`) is not built for — a stack the root's
 * glue does not know, a plugin's — where the service could take the
 * vertical on its own: the product root leaves it out, and adding it
 * in the service fills the gap.
 */
export function unbuiltInServiceNote(servicePath: string, vertical: Vertical): string {
  return `${servicePath}/ has no ${verticalTitle(vertical)} from the product root, which builds one only for the stacks it knows — 'keel add ${vertical.id}' there adds its own`;
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
 * project it lacks; then the capabilities some vertical adds. Where
 * the project is one service of a product, and another of its
 * services could take the vertical or has it (`elsewhere`), the
 * sentence goes on to name it ({@link siblingsClause}).
 */
function unavailableSentence(refusal: UnavailableRefusal, names: RefusalNames): string {
  const own = ownSentence(refusal, names);
  return refusal.elsewhere === undefined ? own : `${own}; ${siblingsClause(refusal.elsewhere)}`;
}

/** An {@link UnavailableRefusal} in words, as far as this project goes. */
function ownSentence(refusal: UnavailableRefusal, names: RefusalNames): string {
  const title = titleOf(names, refusal.vertical);
  const placed = refusal.repositoryOnly ?? [];
  if (placed.length > 0) return placementSentence(title, refusal.vertical, placed, names);
  if (refusal.refresh !== undefined) return refreshSentence(title, refusal.refresh, names);
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
    if (
      builds.length > 0 &&
      builds.length === fixed.length &&
      capabilities.length === 0 &&
      entrypoint.length === 0
    ) {
      // The build system is the way forward, and the sentence names
      // it: a stack to scaffold instead would be another kind of
      // project for what is this one on another dial.
      const labels = builds.map((tag) => buildSystemLabel(tag));
      return `${title} has no adapter for this project's build system; it needs ${labels.join(' or ')}`;
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

/**
 * A vertical stopped by where it was asked — a monorepo service — in
 * the words of the first vertical whose place is a repository root:
 * itself ("Continuous integration cannot go in a monorepo service:
 * …"), or one it needs ("Infrastructure as code needs Distribution,
 * which cannot go in a monorepo service: …").
 */
function placementSentence(
  title: string,
  id: string,
  placed: readonly string[],
  names: RefusalNames,
): string {
  const [first = id] = placed;
  const because = names.vertical(first)?.placement?.because ?? 'its place is a repository root';
  if (placed.includes(id)) return `${title} cannot go in a monorepo service: ${because}`;
  const needed = listed(placed.map((other) => titleOf(names, other)));
  return `${title} needs ${needed}, which cannot go in a monorepo service: ${because}`;
}

/**
 * A vertical stopped by how an installed one was rendered: "Infrastructure
 * as code needs Container image, then Distribution re-rendered — as it
 * was rendered, Distribution does not add what Infrastructure as code
 * needs". No command is named: re-rendering in the same run is
 * `keel add`'s `--refresh`, and the front end's to spell.
 */
function refreshSentence(
  title: string,
  refresh: NonNullable<UnavailableRefusal['refresh']>,
  names: RefusalNames,
): string {
  const again = listed(refresh.verticals.map((id) => titleOf(names, id)));
  const first = listed(refresh.prerequisites.map((id) => titleOf(names, id)));
  const [as, verb] = refresh.verticals.length === 1 ? ['it was', 'does'] : ['they were', 'do'];
  const needs = first === '' ? `${again} re-rendered` : `${first}, then ${again} re-rendered`;
  return `${title} needs ${needs} — as ${as} rendered, ${again} ${verb} not add what ${title} needs`;
}

/** The nearest-stacks tail of an identity sentence; empty when none carries it. */
function nearest(carriedBy: readonly string[]): string {
  if (carriedBy.length === 0) return '';
  return carriedBy.length === 1
    ? `; the nearest stack that carries it: ${carriedBy[0] ?? ''}`
    : `; the nearest stacks that carry it: ${carriedBy.join(', ')}`;
}

/**
 * The sentence of an `elsewhere` refusal: the vertical belongs to a
 * service, and where it goes ({@link whereItGoes}). But for one no
 * service could take and each service having it has from the product
 * root (`fromProduct`) — met only by a re-render at the root, which
 * builds it for them: that is no service's, and no install of the
 * root's, so it is said as the root's, naming them.
 */
function elsewhereSentence(refusal: ElsewhereRefusal, names: RefusalNames): string {
  const title = titleOf(names, refusal.vertical);
  const having = refusal.services.filter((service) => service.readiness === 'included');
  const builtForAll =
    having.length > 0 &&
    having.every((service) => service.fromProduct === true) &&
    !refusal.services.some(
      (service) => service.readiness === 'ready' || service.readiness === 'needs',
    );
  if (builtForAll) {
    return `${title} is not installed at the product root, which builds it for ${directories(having, 'and')}: nothing to re-render here`;
  }
  return `${title} belongs to a service, not to the product root — ${whereItGoes(refusal.vertical, refusal.services, names)}`;
}

/**
 * Where an elsewhere-refused vertical goes, by its services' readiness
 * — and, where none can carry it because each is a monorepo service
 * and it needs what only a repository root may carry, why, in that
 * vertical's own words, which end in the way forward (the polyrepo
 * layout), as the service's own refusal does. Where the services that
 * could have it have it, only a re-render is refused (see
 * {@link elsewhereRefusal}), so the clause says where each has it
 * from: its own install, re-rendered there, or the product root, which
 * builds it for the service (`fromProduct` — a vertical placed at a
 * repository root, the other thing a root gives its services, is
 * refused as placed before it gets here; and where the root builds it
 * for every service having it, {@link elsewhereSentence} says so
 * instead).
 */
function whereItGoes(
  id: string,
  services: readonly ElsewhereService[],
  names: RefusalNames,
): string {
  const carriers = services.filter(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  if (carriers.length > 0) return `it goes in ${directories(carriers, 'or')}`;
  const having = services.filter((service) => service.readiness === 'included');
  if (having.length > 0) {
    const own = having.filter((service) => service.fromProduct !== true);
    const built = having.filter((service) => service.fromProduct === true);
    return [
      ...(own.length > 0 ? [`${haveIt(own)} already, and it is re-rendered there`] : []),
      ...(built.length > 0 ? [`${haveIt(built)} already, built by the product root`] : []),
    ].join('; ');
  }
  const placed = services.find((service) => (service.repositoryOnly ?? []).length > 0);
  if (placed?.repositoryOnly === undefined) return 'none of its services can carry it';
  const [first = id] = placed.repositoryOnly;
  const because = names.vertical(first)?.placement?.because ?? 'its place is a repository root';
  if (placed.repositoryOnly.includes(id)) {
    return `none of its services can carry it, since it cannot go in a monorepo service: ${because}`;
  }
  const needed = listed(placed.repositoryOnly.map((other) => titleOf(names, other)));
  return `none of its services can carry it, since it needs ${needed}, which cannot go in a monorepo service: ${because}`;
}

/**
 * Where a vertical one service of a product cannot carry can be had
 * instead, among the product's other services: those that could take
 * it, then those that have it — _backend/ can take it_, _backend/ has
 * it already_. A service that could do neither is not named.
 */
function siblingsClause(services: readonly ElsewhereService[]): string {
  const carriers = services.filter(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  const having = services.filter((service) => service.readiness === 'included');
  return [
    ...(carriers.length > 0 ? [`${directories(carriers, 'or')} can take it`] : []),
    ...(having.length > 0 ? [`${haveIt(having)} already`] : []),
  ].join('; ');
}

/** `backend/ has it`, `backend/ and frontend/ have it`. */
function haveIt(services: readonly { readonly path: string }[]): string {
  return `${directories(services, 'and')} ${services.length === 1 ? 'has' : 'have'} it`;
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
 * looks it up.
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
