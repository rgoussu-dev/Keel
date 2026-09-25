/**
 * The remedy a command line has for a refusal — built from the
 * refusal's fields, never parsed out of its sentence.
 *
 * The engine's sentence is phase-neutral on purpose: `keel new --with
 * persistence` on a CLI preset and `keel add persistence` on the
 * project it scaffolds are refused in the same words. What the user
 * can *do* about it is not neutral — drop it from `--with`, or scaffold
 * the stack that carries it (with nothing to name, where that stack
 * comes with it), or name the product's service that can take it;
 * link a project first; `cd` into the
 * service it belongs to — or, to re-render it, the one that installed
 * it — or name that service in `--with`; move a file
 * aside before `keel new` but not after, where it may be the product
 * root's own. That is a command
 * line's to say, so it is said here, under the sentence, from the same
 * `Refusal` the page receives in its 422 body.
 *
 * Presentation only: no rule is decided here that the refusal did not
 * already carry.
 */

import type { ServiceExtras } from '../../../domain/contract/commands.js';
import type { ElsewhereService, Refusal } from '../../../domain/contract/refusal.js';

/** The command a refusal came back to — what its remedy is spelled for. */
export type HintedCommand = 'new' | 'add';

/**
 * The hint to print under a refusal's sentence for `command`, or null
 * when the sentence already says everything a user could do.
 *
 * `services` is what `keel new --with` named for each service of a
 * product (`--with backend:persistence`). A vertical refused there is
 * that service's, and so is the remedy: spelled in the `path:id` form
 * it was named in — dropping it, or naming it for another service of
 * the product that can take it — and never another stack to scaffold
 * instead: that would be another product, not this one's service.
 */
export function refusalHint(
  refusal: Refusal,
  command: HintedCommand,
  services: Readonly<Record<string, ServiceExtras>> = {},
): string | null {
  const named = command === 'new' ? services : {};
  switch (refusal.kind) {
    case 'needs': {
      const spell = spelling(refusal.verticals, named);
      const lines = refusal.prerequisites.map((set) =>
        command === 'new'
          ? `--with ${[...set, ...refusal.verticals].map(spell).join(',')}`
          : `keel add ${[...set, ...refusal.verticals].join(' ')}`,
      );
      return `name the one you want: ${lines.map((line) => `'${line}'`).join(' or ')}`;
    }
    case 'unavailable':
      return Object.keys(named).length > 0
        ? serviceHint(refusal, named)
        : unavailableHint(refusal, command);
    case 'elsewhere':
      return elsewhereHint(refusal.vertical, refusal.services, command);
    case 'incompatible':
      return command === 'new' ? 'drop one of them from --with' : null;
    case 'path-conflict':
      return command === 'new' && refusal.anchor === undefined && refusal.taken === undefined
        ? `move '${refusal.path}' aside, or start in an empty directory`
        : null;
    case 'path-missing':
      return null;
  }
}

/**
 * How `--with` spells an id named beside `ids`: with the service `keel
 * new` named `ids` for (`backend:persistence`) where that was one
 * service, and bare otherwise.
 */
function spelling(
  ids: readonly string[],
  services: Readonly<Record<string, ServiceExtras>>,
): (id: string) => string {
  const paths = Object.entries(services)
    .filter(([, service]) => service.extraVerticals.some((id) => ids.includes(id)))
    .map(([path]) => path);
  const [only] = paths;
  return paths.length === 1 && only !== undefined ? (id) => `${only}:${id}` : (id) => id;
}

/**
 * The remedy for a vertical one service of a product cannot carry,
 * named for that service in `--with`: drop the pair — or name the
 * vertical for another service the refusal says can take it
 * (`elsewhere`), one it was not already named for. A service that has
 * it already needs nothing named.
 */
function serviceHint(
  refusal: Extract<Refusal, { kind: 'unavailable' }>,
  named: Readonly<Record<string, ServiceExtras>>,
): string {
  const { vertical } = refusal;
  // The services it lists are the product's others: the one refused
  // is among the rest, however many named the vertical.
  const others = new Set((refusal.elsewhere ?? []).map((service) => service.path));
  const here = Object.fromEntries(Object.entries(named).filter(([path]) => !others.has(path)));
  const drop = `drop '${spelling([vertical], here)(vertical)}' from --with`;
  const carriers = (refusal.elsewhere ?? []).filter(
    (service) =>
      (service.readiness === 'ready' || service.readiness === 'needs') &&
      !(named[service.path]?.extraVerticals ?? []).includes(vertical),
  );
  const [only] = carriers;
  if (only === undefined) return drop;
  const pairs = carriers.map((service) => `'--with ${service.path}:${vertical}'`).join(' or ');
  return carriers.length === 1
    ? `${drop}, or name ${only.path}/: ${pairs}`
    : `${drop}, or name another service: ${pairs}`;
}

function unavailableHint(
  refusal: Extract<Refusal, { kind: 'unavailable' }>,
  command: HintedCommand,
): string | null {
  const { vertical, missing, carriedBy } = refusal;
  const [nearest] = carriedBy;
  // The hint names the first nearest stack, and is worded by it: one
  // that comes with the vertical needs nothing named beside it.
  const comesWith = nearest !== undefined && (refusal.comesWith ?? []).includes(nearest);
  const entrypointOnly =
    (missing.entrypoint ?? []).length > 0 && (missing.identity ?? []).length === 0;
  const peerOnly =
    (missing.peer ?? []).length > 0 &&
    (missing.entrypoint ?? []).length === 0 &&
    (missing.identity ?? []).length === 0;
  if (refusal.refresh !== undefined) {
    // Only a project on disk has something to re-render, and only
    // `keel add` re-renders beside what it installs.
    const again = refusal.refresh.verticals.join(',');
    return command === 'add'
      ? `re-render it in the same run: 'keel add ${vertical} --refresh ${again}'`
      : `drop '${vertical}' from --with`;
  }
  if (command === 'add') {
    if (refusal.because !== undefined) return null;
    if (peerOnly) return `link a project it can wire first — 'keel link <path>' — then add it`;
    if (entrypointOnly && nearest !== undefined) {
      return comesWith
        ? `${nearest} has this project's entrypoints and comes with ${vertical}; a project's entrypoints are fixed at 'keel new'`
        : `${nearest} carries both this project's entrypoints and ${vertical}; a project's entrypoints are fixed at 'keel new'`;
    }
    return null;
  }
  const drop = `drop '${vertical}' from --with`;
  if (refusal.because !== undefined) return drop;
  const buildOnly =
    (missing.identity ?? []).length > 0 &&
    (missing.identity ?? []).every((tag) => tag.startsWith('pkg.')) &&
    (missing.entrypoint ?? []).length === 0 &&
    (missing.peer ?? []).length === 0;
  // The sentence names the build system it needs; the dial is --with's
  // neighbour on the same command line.
  if (buildOnly) return `${drop}, or choose the build system it needs with --build-system`;
  if (peerOnly) {
    return `${drop}; scaffold this project, 'keel link <path>' the one it should reach, then 'keel add ${vertical}'`;
  }
  if (nearest === undefined) return drop;
  return comesWith
    ? `${drop}, or scaffold ${nearest}, which comes with it: 'keel new --stack=${nearest}'`
    : `${drop}, or scaffold ${nearest}, which carries it: 'keel new --stack=${nearest} --with ${vertical}'`;
}

function elsewhereHint(
  vertical: string,
  services: readonly ElsewhereService[],
  command: HintedCommand,
): string | null {
  const carriers = services.filter(
    (service) => service.readiness === 'ready' || service.readiness === 'needs',
  );
  if (carriers.length === 0) {
    if (command === 'new') return `drop '${vertical}' from --with`;
    // Adding what the services have is no refusal at a product root —
    // it is there — so what met this one is a re-render: in a service
    // that installed it, not in one the product root builds it for.
    const having = services.filter(
      (service) => service.readiness === 'included' && service.fromProduct !== true,
    );
    return having.length === 0
      ? null
      : having
          .map((service) => `'cd ${service.path} && keel add ${vertical} --reapply'`)
          .join(' or ');
  }
  if (command === 'new') {
    // Refused because more than one service can take it: which one is
    // the user's to name, in the form `--with` takes a service in.
    const named = carriers.map((service) => `'--with ${service.path}:${vertical}'`);
    return `name the service it goes in: ${named.join(' or ')}`;
  }
  return carriers.map((service) => `'cd ${service.path} && keel add ${vertical}'`).join(' or ');
}
