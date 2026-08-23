/**
 * Which steps the wizard has, given what has been chosen so far.
 *
 * The page is a stepper now rather than one long form, and the list
 * of steps is **not** a constant: a language reaching one framework
 * has no framework step, a stack pinning its build system has no
 * options step, and the brownfield half is a different list
 * altogether. That is the same rule the terminal wizard skips a
 * question under — a step whose answer is already settled is not a
 * step — so it is derived here from the catalog, the dials and the
 * preview rather than hard-coded in the element that draws the rail.
 *
 * Pure, and separate from any element, so the rail is testable
 * without a DOM — the same split `finder.js` and `tree.js` live
 * under.
 *
 * @typedef {{ id: string, label: string, doc: string }} Step
 */

import { locate } from './finder.js';

/** Step ids, exported so an element can branch on one without a literal. */
export const DIRECTORY = 'directory';
export const SHAPE = 'shape';
export const LANGUAGE = 'language';
export const FRAMEWORK = 'framework';
export const ENTRYPOINTS = 'entrypoints';
export const OPTIONS = 'options';
export const TARGET = 'target';
export const QUESTIONS = 'questions';
export const REVIEW = 'review';

/**
 * The steps this state has, in order. Always at least the directory
 * and the review — the two ends of any run.
 *
 * `questions` is unconditional even when the preview reports none:
 * it is the one step whose content arrives asynchronously, and a rail
 * that grew a step each time a request landed would move under the
 * pointer. It says "this combination asks nothing" instead.
 *
 * @param {{ status: object|null, catalog: object|null, dials: object|null, target: object|null, preview: object|null }} state
 * @returns {Step[]}
 */
export function stepsFor(state) {
  const steps = [
    {
      id: DIRECTORY,
      label: 'Directory',
      doc: 'Where the project goes. A directory that does not exist yet is fine — keel creates it.',
    },
  ];
  steps.push(...(state.status?.initialised ? brownfieldSteps() : greenfieldSteps(state)));
  steps.push({
    id: QUESTIONS,
    label: 'Questions',
    doc: 'Everything the composition adapters ask. Which ones appear depends on the choices above, so this list changes as they move.',
  });
  steps.push({
    id: REVIEW,
    label: 'Review',
    doc: 'Every choice this run will make, and the button that commits it. Nothing is written before you press it.',
  });
  return steps;
}

function brownfieldSteps() {
  return [
    {
      id: TARGET,
      label: 'What to add',
      doc: 'A vertical to layer onto this project, or a new bounded context. Only what this project can actually take is offered.',
    },
  ];
}

/**
 * The greenfield middle: the drill-down's own steps, each present
 * only where it has something to ask, plus the dials.
 *
 * The shape step is unconditional. It is the widest question there
 * is, and it also carries the by-id escape hatch — so dropping it
 * would strand a preset the finder could not place.
 */
function greenfieldSteps(state) {
  const here = located(state);
  const steps = [
    {
      id: SHAPE,
      label: 'What to build',
      doc: 'Which ends of a system this project covers. Everything after it narrows within the answer.',
    },
  ];
  if ((here?.shape.languages.length ?? 0) > 1) {
    steps.push({
      id: LANGUAGE,
      label: 'Language',
      doc:
        here?.shape.id === 'fullstack'
          ? 'The backend’s language — the front end is the browser either way.'
          : 'The language the project is written in.',
    });
  }
  if ((here?.language.frameworks.length ?? 0) > 1) {
    steps.push({
      id: FRAMEWORK,
      label: 'Framework',
      doc: 'Which framework the adapters are built on. Only shown where the shape and language chosen leave more than one open.',
    });
  }
  if (here?.framework.entrypointStep) {
    steps.push({
      id: ENTRYPOINTS,
      label: 'Adapters',
      doc: 'How the outside world drives the hexagon. Only shown where more than one way in is reachable from here.',
    });
  }
  if (hasDials(state)) {
    steps.push({
      id: OPTIONS,
      label: 'Options',
      doc: 'The dials this preset offers: how it is built, how its modules are laid out, and what else is scaffolded alongside.',
    });
  }
  return steps;
}

/** Where the chosen preset sits in the finder tree, or null. */
export function located(state) {
  const stack = state.target?.stack;
  return state.catalog && stack ? locate(state.catalog.finder, stack) : null;
}

/** The catalog's descriptor for the chosen preset, or null. */
export function chosenStack(state) {
  return state.catalog?.stacks.find((candidate) => candidate.id === state.target?.stack) ?? null;
}

/**
 * Whether this preset has any dial worth a step of its own.
 *
 * The catalog says whether a control exists; the dials say what may
 * be on it. Both are consulted for the same reason `<keel-new-form>`
 * consults both — a control narrowed to one value is still a control,
 * but a preset that offers no choice at all should not cost a step.
 */
export function hasDials(state) {
  const stack = chosenStack(state);
  if (!stack) return false;
  if (stack.services.length > 0) return true;
  return (
    stack.buildSystems.length > 1 ||
    stack.moduleLayouts.length > 1 ||
    state.dials?.peerContext === true ||
    (state.dials?.extraVerticals?.length ?? 0) > 0
  );
}

/**
 * Every step id in the order they can appear, which is what
 * {@link settleStep} measures "before" against. The brownfield
 * `target` sits where the greenfield middle does, the two never
 * being on the same rail.
 */
const ORDER = [
  DIRECTORY,
  SHAPE,
  LANGUAGE,
  FRAMEWORK,
  ENTRYPOINTS,
  TARGET,
  OPTIONS,
  QUESTIONS,
  REVIEW,
];

/**
 * The step to show, given the one that was wanted and the steps that
 * exist.
 *
 * Falls back to the last step at or before it rather than to the
 * first, because a step can vanish under the pointer: pick a preset
 * with no dials while standing on Options and the rail loses that
 * step. Landing on Questions — the next thing that still exists at or
 * after where you were — is a step back; landing on Directory is a
 * lost place in the flow.
 *
 * @param {Step[]} steps
 * @param {string} wanted
 * @returns {string}
 */
export function settleStep(steps, wanted) {
  if (steps.some((step) => step.id === wanted)) return wanted;
  const rank = ORDER.indexOf(wanted);
  const before = steps.filter((step) => ORDER.indexOf(step.id) <= rank);
  return (before[before.length - 1] ?? steps[0])?.id ?? DIRECTORY;
}

/** The step after `current`, or `current` when it is the last. */
export function nextStep(steps, current) {
  const index = steps.findIndex((step) => step.id === current);
  return steps[index + 1]?.id ?? current;
}

/** The step before `current`, or `current` when it is the first. */
export function previousStep(steps, current) {
  const index = steps.findIndex((step) => step.id === current);
  return index > 0 ? (steps[index - 1]?.id ?? current) : current;
}
