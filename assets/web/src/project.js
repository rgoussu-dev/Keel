/**
 * What the brownfield half says about the project as a whole, read
 * off `/api/project` before any card is picked.
 *
 * One fact stops every card alike: a project written by another
 * harness generation, which `keel add` refuses to half-patch — every
 * vertical but the agent harness, whose re-render is what brings the
 * project forward. Picking card after card to meet the same refusal
 * each time is the trial and error the status exists to spare, so the
 * status reports the generation once (`harnessGeneration`), and the
 * page says so once, above the cards.
 *
 * Pure, and separate from any element, so the wording is testable
 * without a DOM — the same split `steps.js` and `extras.js` live
 * under.
 *
 * @typedef {{ found: number|null, expected: number }} HarnessGeneration
 */

/**
 * The sentence the "What to add" step opens with on a project from
 * another harness generation, or null where the generations match —
 * and where there is no project, which has no generation to compare.
 *
 * @param {{ harnessGeneration?: HarnessGeneration }|null} status the `/api/project` payload
 * @returns {string|null}
 */
export function harnessNotice(status) {
  const generation = status?.harnessGeneration;
  if (generation === undefined || generation.found === generation.expected) return null;
  const { found, expected } = generation;
  if (found !== null && found > expected) {
    return `This project’s harness is generation ${found}, newer than the generation ${expected} this keel writes: upgrade keel before adding to it.`;
  }
  const marker = found === null ? 'carries no generation marker' : `is generation ${found}`;
  return `This project’s harness ${marker}, and this keel writes generation ${expected}: every card but Agent harness is refused until the harness is brought forward, and the refusal on any of them says how.`;
}
