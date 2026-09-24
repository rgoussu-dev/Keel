/**
 * How the page reads a list of verticals that carries the planner's
 * readiness — the `keel.dials` reply's `verticals` on the greenfield
 * half, the project status's `available` on the brownfield one.
 *
 * Both lists come from one function (`domain/core/planner.ts`, worded
 * by `plan-refusal.ts`'s `foresee`), and they used to be drawn by two
 * opposite policies: the Options step left out what a preset could
 * not carry, and the brownfield page offered every vertical and let
 * the click find out. They are drawn one way now — by one control, the
 * "Also scaffold" group on both phases' Options step — in the same
 * parts and the same words:
 *
 *   - **Ready** — installs on its own.
 *   - **Needs another capability first** — installs once others have;
 *     the badge names them by title, and ticking the card ticks them.
 *   - **Not for this project** — nothing keel adds of its own accord
 *     makes it install here: what it lacks is the project's to be, or
 *     a re-render only the user may ask for (`keel.needs-refresh`,
 *     whose sentence names it). Kept on screen, collapsed, with the
 *     sentence the command would refuse it with, because "does it take
 *     persistence?" deserves an answer where it is asked rather than
 *     an absence to puzzle over.
 *
 * What is specific to one half — what comes with a preset, what is
 * installed, what belongs in a service — is `extras.js`'s and
 * `additions.js`'s. What they share is here.
 *
 * Pure, and separate from any element, so the wording is testable
 * without a DOM — the same split `steps.js` and `target.js` live
 * under.
 *
 * @typedef {{ code: string, message: string, refusal?: { kind: string } }} RefusalDescriptor
 * @typedef {{ id: string, title: string, readiness: string, requires: ReadonlyArray<string>, refusal?: RefusalDescriptor }} ReadinessEntry
 * @typedef {{ id: string, title: string, sentence: string }} Refused
 */

/**
 * A lookup from vertical id to title, over any number of lists,
 * falling back to the id for one none of them names.
 *
 * @param {...ReadonlyArray<{ id: string, title?: string }>} lists
 * @returns {(id: string) => string}
 */
export function titles(...lists) {
  const byId = new Map(
    lists.flat().map((vertical) => [vertical.id, vertical.title || vertical.id]),
  );
  return (id) => byId.get(id) ?? id;
}

/**
 * A reason `keel.dials` gave for adding or dropping a vertical, worded
 * to follow the vertical's title. A sentence whose subject is the
 * vertical itself — "Version control already comes with go-cli", or a
 * refusal's — goes on from "it", since the line has just said the
 * title ("left out Version control — it already comes with go-cli");
 * any other reason ("Infrastructure as code needs it installed first")
 * stands as it is.
 *
 * @param {string} title
 * @param {string} because
 * @returns {string}
 */
export function reasonAfter(title, because) {
  return because.startsWith(`${title} `) ? `it ${because.slice(title.length + 1)}` : because;
}

/**
 * What a "needs" card says it needs, by title: the verticals ticking
 * it brings along, or — where two different sets would each do — that
 * the choice between them is the user's to make first.
 *
 * @param {{ requires: ReadonlyArray<string> }} vertical
 * @param {(id: string) => string} titleOf
 * @returns {string}
 */
export function needsBadge(vertical, titleOf) {
  return vertical.requires.length === 0
    ? 'needs one of several verticals first'
    : `needs ${vertical.requires.map(titleOf).join(', ')}`;
}

/**
 * The entries of a readiness list that the project cannot take at
 * all, each with its reason: the sentence the command would refuse it
 * with, word for word — there is no second wording of a refusal on
 * the page.
 *
 * A vertical refused as belonging in one of a product's services is
 * not "not for this project" — it is for this product, one directory
 * down — so it is left to the caller, which draws it apart.
 *
 * @param {ReadonlyArray<ReadinessEntry>} verticals
 * @returns {Refused[]}
 */
export function refusedOf(verticals) {
  return verticals
    .filter((vertical) => vertical.readiness === 'unavailable' && !belongsElsewhere(vertical))
    .map(refused);
}

/**
 * Whether an entry is refused as belonging in one of a product's
 * services rather than as beyond this project.
 *
 * @param {ReadinessEntry} vertical
 * @returns {boolean}
 */
export function belongsElsewhere(vertical) {
  return vertical.refusal?.refusal?.kind === 'elsewhere';
}

/**
 * One refused entry, as a line of a collapsed list: its title, and
 * the refusal's sentence.
 *
 * @param {ReadinessEntry} vertical
 * @returns {Refused}
 */
export function refused(vertical) {
  return {
    id: vertical.id,
    title: vertical.title || vertical.id,
    sentence: vertical.refusal?.message ?? '',
  };
}
