/**
 * Where the keel projects nearest a directory that holds none are, and
 * the sentence a command that needs a project is refused with there
 * (`keel.not-initialised`).
 *
 * The walk that finds them is the engine's (`domain/core/scope.ts`'
 * `nearbyProjects`); the sentence is spelled here, beside the shape it
 * reads, because two hexagons refuse with it — the engine's commands
 * (`keel add`, `keel add module`, `keel link`) and the provisioning
 * context's (`keel toolchain`), which reaches keel only through this
 * contract and is handed the walk by the composition root. One
 * sentence, so a directory inside a project points at that project
 * whichever of them was run there.
 */

/** The code every command needing a project is refused with where none is. */
export const NOT_INITIALISED_CODE = 'keel.not-initialised';

/** Where the keel projects nearest a directory holding none are. */
export interface NearbyProjects {
  /** The nearest project above, relative to the directory (`..`); null when none is. */
  readonly above: string | null;
  /**
   * Where the project {@link above} is a product root, those of its
   * services that hold a project, in its order, relative to the
   * directory as `above` is (`../backend`); absent where none does, and
   * anywhere else.
   */
  readonly services?: readonly string[];
  /** Service directories below that hold a project, relative to it, in registry order. */
  readonly below: readonly string[];
}

/** Nothing nearby: no project above, none below — `keel new` is the way in. */
export const NO_PROJECT_NEARBY: NearbyProjects = { above: null, below: [] };

/**
 * The sentence a command that needs a keel project is refused with in
 * a directory that holds none (`keel.not-initialised`): pointing at the
 * project it sits inside, or at the services below it that are
 * projects, where there are — `keel new` there is refused inside
 * another project, and would scaffold one over a polyrepo product's
 * services — and at `first`, the command that creates one, where there
 * are not. `command` is the one refused, as it is run there;
 * `serviceScoped` says a product root refuses it too (`keel add
 * module`, `keel toolchain`), so inside one it points at the root's
 * services instead.
 *
 * `refusedAt`, for a command a project can refuse as well (`keel add
 * module`, on a project that takes no bounded context), is why the
 * project the sentence names by `named` (`..`, `../backend`,
 * `backend`) refuses it — null where it would not, or where that is
 * not known. Where every project the sentence points at refuses it,
 * for one reason, the sentence says so and why, rather than sending
 * the user there to be refused again.
 */
export function notInitialisedSentence(
  scopeRoot: string,
  nearby: NearbyProjects,
  command: string,
  first: string,
  serviceScoped = false,
  refusedAt: (named: string) => string | null = () => null,
): string {
  const none = `no project initialised at ${scopeRoot}`;
  const services = serviceScoped ? (nearby.services ?? []) : [];
  const onward = (named: readonly string[], where: string): string => {
    const reasons = new Set(named.map(refusedAt));
    const [reason] = reasons;
    if (reasons.size !== 1 || reason === null || reason === undefined) {
      return `; run '${command}' ${where}`;
    }
    return `, ${named.length === 1 ? 'which refuses' : 'each refusing'} '${command}' too, since ${reason}`;
  };
  if (nearby.above !== null && services.length > 0) {
    const [are, where] =
      services.length === 1
        ? ['whose service is', 'in it']
        : ['whose services are', 'in one of them'];
    return `${none} — this directory is inside the keel product at ${nearby.above}/, ${are} ${directories(services)}${onward(services, where)}`;
  }
  if (nearby.above !== null) {
    return `${none} — this directory is inside the keel project at ${nearby.above}/${onward([nearby.above], 'there')}`;
  }
  if (nearby.below.length > 0) {
    const [verb, where] =
      nearby.below.length === 1
        ? ['holds a keel project', 'in it']
        : ['hold keel projects', 'in one of them'];
    return `${none} — ${directories(nearby.below)} below ${verb}${onward(nearby.below, where)}`;
  }
  return `${none} — run '${first}' first to create one`;
}

/** `a/`, `a/ and b/`, `a/, b/ and c/`. */
function directories(paths: readonly string[]): string {
  const dirs = paths.map((path) => `${path}/`);
  const last = dirs.pop() ?? '';
  return dirs.length === 0 ? last : `${dirs.join(', ')} and ${last}`;
}
