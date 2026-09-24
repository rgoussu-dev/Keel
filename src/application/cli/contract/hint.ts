/**
 * The remedy a command line has for a refusal — built from the
 * refusal's fields, never parsed out of its sentence.
 *
 * The engine's sentence is phase-neutral on purpose: `keel new --with
 * persistence` on a CLI preset and `keel add persistence` on the
 * project it scaffolds are refused in the same words. What the user
 * can *do* about it is not neutral — drop it from `--with`, or scaffold
 * the stack that carries it; link a project first; `cd` into the
 * service it belongs to; move a file aside before `keel new` but not
 * after, where it may be the product root's own. That is a command
 * line's to say, so it is said here, under the sentence, from the same
 * `Refusal` the page receives in its 422 body.
 *
 * Presentation only: no rule is decided here that the refusal did not
 * already carry.
 */

import type { ElsewhereService, Refusal } from '../../../domain/contract/refusal.js';

/** The command a refusal came back to — what its remedy is spelled for. */
export type HintedCommand = 'new' | 'add';

/**
 * The hint to print under a refusal's sentence for `command`, or null
 * when the sentence already says everything a user could do.
 */
export function refusalHint(refusal: Refusal, command: HintedCommand): string | null {
  switch (refusal.kind) {
    case 'needs': {
      const lines = refusal.prerequisites.map((set) =>
        command === 'new'
          ? `--with ${[...set, ...refusal.verticals].join(',')}`
          : `keel add ${[...set, ...refusal.verticals].join(' ')}`,
      );
      return `name the one you want: ${lines.map((line) => `'${line}'`).join(' or ')}`;
    }
    case 'unavailable':
      return unavailableHint(refusal, command);
    case 'elsewhere':
      return elsewhereHint(refusal.vertical, refusal.services, command);
    case 'incompatible':
      return command === 'new' ? 'drop one of them from --with' : null;
    case 'path-conflict':
      return command === 'new' && refusal.anchor === undefined
        ? `move '${refusal.path}' aside, or start in an empty directory`
        : null;
    case 'path-missing':
      return null;
  }
}

function unavailableHint(
  refusal: Extract<Refusal, { kind: 'unavailable' }>,
  command: HintedCommand,
): string | null {
  const { vertical, missing, carriedBy } = refusal;
  const [nearest] = carriedBy;
  const entrypointOnly =
    (missing.entrypoint ?? []).length > 0 && (missing.identity ?? []).length === 0;
  const peerOnly =
    (missing.peer ?? []).length > 0 &&
    (missing.entrypoint ?? []).length === 0 &&
    (missing.identity ?? []).length === 0;
  if (command === 'add') {
    if (refusal.because !== undefined) return null;
    if (peerOnly) return `link a project it can wire first — 'keel link <path>' — then add it`;
    if (entrypointOnly && nearest !== undefined) {
      return `${nearest} carries both this project's entrypoints and ${vertical}; a project's entrypoints are fixed at 'keel new'`;
    }
    return null;
  }
  const drop = `drop '${vertical}' from --with`;
  if (refusal.because !== undefined) return drop;
  if (peerOnly) {
    return `${drop}; scaffold this project, 'keel link <path>' the one it should reach, then 'keel add ${vertical}'`;
  }
  if (nearest === undefined) return drop;
  return `${drop}, or scaffold ${nearest}, which carries it: 'keel new --stack=${nearest} --with ${vertical}'`;
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
    return command === 'new' ? 'scaffold the product without --with' : null;
  }
  if (command === 'new') {
    const where = carriers.map((service) => `${service.path}/`).join(' or ');
    return `scaffold the product, then 'keel add ${vertical}' inside ${where}`;
  }
  return carriers.map((service) => `'cd ${service.path} && keel add ${vertical}'`).join(' or ');
}
