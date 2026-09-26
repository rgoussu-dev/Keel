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
 * contexts, and what it has installed. Its **Adapters** line offers the
 * back entrypoint the project lacks where `keel add entrypoint` would
 * add it ({@link entrypointOffers}): the project's ways in are no
 * longer settled for good at `keel new`.
 *
 * **What stops everything.** One fact stops every card alike: a project written by another
 * harness generation, which `keel add` refuses to half-patch — every
 * vertical but the agent harness, whose re-render is what brings the
 * project forward; at a monorepo product root, whose harness no card
 * brings forward, every vertical it does not refuse anyway. Picking
 * card after card to meet the same refusal
 * each time is the trial and error the status exists to spare, so the
 * status reports the generation once (`harnessGeneration`), and the
 * page says so once, above the cards.
 *
 * Pure, and separate from any element, so the wording is testable
 * without a DOM — the same split `steps.js` and `extras.js` live
 * under.
 *
 * @typedef {{ found: number|null, expected: number }} HarnessGeneration
 * @typedef {{ word: string, label: string, present: boolean, installs?: ReadonlyArray<string>, refusal?: { code: string, message: string } }} EntrypointStatus
 * @typedef {{ word: string, name: string, gloss: string, meta: string, refusal: string|null }} EntrypointOffer
 * @typedef {{ label: string, value: string, offers?: EntrypointOffer[] }} Row
 * @typedef {{ id: string, title: string }} Had
 * @typedef {{ rows: Row[], installed: Had[] }} ProjectSummary
 */

/** The profile line that says what a project's ways in are. */
const ADAPTERS = 'Adapters';

/**
 * The Project step's summary, read-only but for its ways in: one row
 * per settled answer — the preset first, then the drill-down's answers
 * and the dials, as the status words them — then a row per service of a
 * product, the bounded contexts, and what the project has, by title:
 * what its manifest records, then what a monorepo service has from its
 * product — but not what a product root's services have, which is
 * theirs: the root lists each service instead. The Adapters line
 * carries the entrypoints the project could add (`offers`), the one
 * thing on the step to act on.
 *
 * @param {{ profile?: { preset: string|null, facts: ReadonlyArray<Row> }, services?: ReadonlyArray<{ path: string, label: string }>, modules?: ReadonlyArray<{ name: string }>, installed?: ReadonlyArray<{ id: string, title?: string }>, provided?: ReadonlyArray<{ id: string, title?: string }>, entrypoints?: ReadonlyArray<EntrypointStatus> }|null} status the `/api/project` payload
 * @returns {ProjectSummary}
 */
export function projectSummary(status) {
  const preset = status?.profile?.preset ?? null;
  const modules = status?.modules ?? [];
  const had = (vertical) => ({ id: vertical.id, title: vertical.title || vertical.id });
  const offers = entrypointOffers(status).filter((offer) => offer.refusal === null);
  return {
    rows: [
      ...(preset === null ? [] : [{ label: 'Preset', value: preset }]),
      ...(status?.profile?.facts ?? []).map((fact) =>
        fact.label === ADAPTERS && offers.length > 0 ? { ...fact, offers } : fact,
      ),
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
    installed: [
      ...(status?.installed ?? []),
      ...((status?.services ?? []).length > 0 ? [] : (status?.provided ?? [])),
    ].map(had),
  };
}

/**
 * The back entrypoints a keel project lacks, as `keel add entrypoint`
 * would answer each there — the status's `entrypoints`, those not
 * present: the word the command takes, the entrypoint's name and gloss
 * (its finder label, split where it is written `name — gloss`), the
 * command, and the sentence it would be refused with, or null where it
 * would run as far as the status reads, off the manifest: what the
 * command reads off the files, its preview refuses. Empty where the
 * project has them all, and where the status reports none — a
 * directory that is no keel project.
 *
 * @param {{ entrypoints?: ReadonlyArray<EntrypointStatus> }|null} status the `/api/project` payload
 * @returns {EntrypointOffer[]}
 */
export function entrypointOffers(status) {
  return (status?.entrypoints ?? [])
    .filter((entrypoint) => !entrypoint.present)
    .map((entrypoint) => {
      const [name = entrypoint.word, ...gloss] = entrypoint.label.split(' — ');
      return {
        word: entrypoint.word,
        name,
        gloss: gloss.join(' — '),
        meta: `keel add entrypoint ${entrypoint.word}`,
        refusal: entrypoint.refusal?.message ?? null,
      };
    });
}

/**
 * The name of the entrypoint `word` names, as the status labels it —
 * `HTTP server` for `http` — or the word itself where it labels none.
 *
 * @param {{ entrypoints?: ReadonlyArray<EntrypointStatus> }|null} status the `/api/project` payload
 * @param {string} word
 * @returns {string}
 */
export function entrypointName(status, word) {
  const label = (status?.entrypoints ?? []).find((entrypoint) => entrypoint.word === word)?.label;
  return label === undefined ? word : (label.split(' — ')[0] ?? word);
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
 * At a product root — a status listing services — no card brings the
 * harness forward, the root's being the product's own: it says so, and
 * what the refusals there say — one not for the root as its card does,
 * one in its services as theirs, any other naming the keel to pin.
 *
 * @param {{ harnessGeneration?: HarnessGeneration, services?: ReadonlyArray<unknown> }|null} status the `/api/project` payload
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
  if ((status?.services ?? []).length > 0) {
    return `This product root’s harness ${marker}, and this keel writes generation ${expected}: no card brings a product root’s harness forward, and every card is refused — one not for this root as it says, one in its services as theirs, and any other naming the keel that scaffolded it, to pin.`;
  }
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
