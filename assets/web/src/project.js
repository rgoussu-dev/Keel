/**
 * What a keel project's page says about the project as a whole, read
 * off `/api/project` before any card is picked.
 *
 * **What it is.** A keel project has settled every answer the preset
 * steps ask, so on its rail those steps collapse into one, **Project**,
 * that shows them instead of asking ({@link projectSummary}): the preset
 * the manifest reads as and the choices that made it, in the words the
 * wizard asked them in — the status words them (`profile`), so no tag
 * reaches the page — its services at a product root, its bounded
 * contexts, and what it has installed.
 *
 * **What stops everything.** One fact stops every card alike: a project written by another
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
 * @typedef {{ label: string, value: string }} Row
 * @typedef {{ id: string, title: string }} Had
 * @typedef {{ rows: Row[], installed: Had[] }} ProjectSummary
 */

/**
 * The Project step's read-only summary: one row per settled answer —
 * the preset first, then the drill-down's answers and the dials, as the
 * status words them — then a row per service of a product, the bounded
 * contexts, and what the project has, by title: what its manifest
 * records, then what a monorepo service has from its product.
 *
 * @param {{ profile?: { preset: string|null, facts: ReadonlyArray<Row> }, services?: ReadonlyArray<{ path: string, label: string }>, modules?: ReadonlyArray<{ name: string }>, installed?: ReadonlyArray<{ id: string, title?: string }>, provided?: ReadonlyArray<{ id: string, title?: string }> }|null} status the `/api/project` payload
 * @returns {ProjectSummary}
 */
export function projectSummary(status) {
  const preset = status?.profile?.preset ?? null;
  const modules = status?.modules ?? [];
  const had = (vertical) => ({ id: vertical.id, title: vertical.title || vertical.id });
  return {
    rows: [
      ...(preset === null ? [] : [{ label: 'Preset', value: preset }]),
      ...(status?.profile?.facts ?? []),
      ...(status?.services ?? []).map((service) => ({
        label: `${service.path}/`,
        value: service.label,
      })),
      ...(modules.length === 0
        ? []
        : [
            {
              label: modules.length === 1 ? 'Bounded context' : 'Bounded contexts',
              value: modules.map((module) => module.name).join(', '),
            },
          ]),
    ],
    installed: [...(status?.installed ?? []), ...(status?.provided ?? [])].map(had),
  };
}

/**
 * The project in the few words a review row carries: the preset it
 * reads as, else what it builds in what, else a dash.
 *
 * @param {{ profile?: { preset: string|null, facts: ReadonlyArray<Row> } }|null} status the `/api/project` payload
 * @returns {string}
 */
export function projectHeadline(status) {
  const preset = status?.profile?.preset ?? null;
  if (preset !== null) return preset;
  const facts = status?.profile?.facts ?? [];
  const value = (label) => facts.find((fact) => fact.label === label)?.value;
  return [value('Building'), value('Language')].filter(Boolean).join(', ') || '—';
}

/**
 * The sentence a keel project's Options step opens with on a project from
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

/**
 * Whether a run re-rendering `rerendered` changes this project even
 * when its plan writes and runs nothing: re-rendering the agent harness
 * of a project from an older harness generation, or one with no marker,
 * stamps this keel's generation into the manifest — the one thing that
 * lets every other card through — so an empty plan there is not a run
 * with nothing to do. A newer marker is not one to stamp over.
 *
 * @param {{ harnessGeneration?: HarnessGeneration }|null} status the `/api/project` payload
 * @param {string|null} rerendered the vertical the run re-renders, if it is a re-render
 * @returns {boolean}
 */
export function stampsHarnessGeneration(status, rerendered) {
  const generation = status?.harnessGeneration;
  if (rerendered !== 'agent-harness' || generation === undefined) return false;
  return generation.found === null || generation.found < generation.expected;
}
