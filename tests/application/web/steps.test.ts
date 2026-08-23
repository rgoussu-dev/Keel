/**
 * Which steps the wizard has, given what has been chosen.
 *
 * Same standing as `finder.test.ts` and `tree.test.ts`: a pure
 * function over data the domain produces, living in `assets/web/`
 * and tested here because it needs no browser.
 *
 * This is the part of the stepper with an answer that can be wrong.
 * "A step with one answer is skipped" is the rule the terminal wizard
 * has always followed, and a rail that offered a framework step over
 * a menu of one — or dropped the shape step and stranded a preset the
 * finder could not place — would be the page disagreeing with the
 * terminal about the same catalog. Driven against the real
 * `keel.catalog` payload for that reason.
 */

import { describe, expect, it } from 'vitest';
import { catalogQuery } from '../../../src/domain/contract/queries.js';
import type { Catalog } from '../../../src/domain/contract/queries.js';
import {
  hasDials,
  located,
  nextStep,
  previousStep,
  settleStep,
  stepsFor,
} from '../../../assets/web/src/steps.js';
import { expectOk, installMediator } from '../../support/factory.js';

async function catalog(): Promise<Catalog> {
  return expectOk(await installMediator().dispatch(catalogQuery()));
}

/**
 * What `<keel-app>` holds, as `stepsFor` reads it. Spelled out rather
 * than left as a bag of unknowns so the typecheck compares these
 * fixtures against the shape the module documents.
 */
interface PageState {
  status: object | null;
  catalog: object | null;
  dials: object | null;
  target: object | null;
  preview: object | null;
}

/** The greenfield state a page holds once it has settled on `stack`. */
async function greenfield(stack: string, extra: Partial<PageState> = {}): Promise<PageState> {
  return {
    status: { initialised: false },
    catalog: await catalog(),
    dials: null,
    target: { kind: 'new-project', stack },
    preview: null,
    ...extra,
  };
}

const ids = (steps: { id: string }[]): string[] => steps.map((step) => step.id);

describe('the wizard’s steps', () => {
  it('walks a JVM backend through every narrowing step', async () => {
    expect(ids(stepsFor(await greenfield('quarkus-cli')))).toEqual([
      'directory',
      'shape',
      'language',
      'framework',
      'entrypoints',
      'options',
      'questions',
      'review',
    ]);
  });

  it('drops the framework step for a language that has none', async () => {
    // Go answers "which framework?" by existing, so the rail must not
    // show a step over a menu of one.
    expect(ids(stepsFor(await greenfield('go-cli')))).not.toContain('framework');
    expect(ids(stepsFor(await greenfield('go-cli')))).toContain('entrypoints');
  });

  it('drops everything below the shape for the frontend, which reaches one preset', async () => {
    expect(ids(stepsFor(await greenfield('web-components')))).toEqual([
      'directory',
      'shape',
      'options',
      'questions',
      'review',
    ]);
  });

  it('keeps the framework step but not the adapters one for a product', async () => {
    // Six fullstack presets, three of them Java: the framework is a
    // real choice, and both entrypoints come with the product.
    expect(ids(stepsFor(await greenfield('fullstack')))).toEqual([
      'directory',
      'shape',
      'language',
      'framework',
      'options',
      'questions',
      'review',
    ]);
  });

  it('keeps the shape step even where the preset sits nowhere in the tree', async () => {
    // It is the escape hatch's own step. Dropping it would strand a
    // preset the finder could not place.
    const steps = ids(stepsFor(await greenfield('nonsense')));
    expect(steps).toContain('shape');
    expect(steps).not.toContain('language');
  });

  it('offers the brownfield half a different list altogether', () => {
    const steps = stepsFor({
      status: { initialised: true },
      catalog: null,
      dials: null,
      target: { kind: 'add-vertical', vertical: 'ci' },
      preview: null,
    });
    expect(ids(steps)).toEqual(['directory', 'target', 'questions', 'review']);
  });

  it('keeps the questions step even when the preview reports none', async () => {
    // The one step whose content arrives asynchronously: a rail that
    // grew a step each time a request landed would move under the
    // pointer.
    const state = await greenfield('quarkus-cli', { preview: { questions: [] } });
    expect(ids(stepsFor(state))).toContain('questions');
  });

  it('locates the chosen preset for the steps that narrow within it', async () => {
    // Null is a real answer — a preset the tree cannot place — so it
    // is asserted rather than dereferenced through.
    expect(located(await greenfield('spring-rest-kotlin'))?.framework.id).toBe('spring');
    expect(located(await greenfield('nonsense'))).toBeNull();
  });

  it('counts a dial that only the rules can offer', async () => {
    // A stack pinning both its dials still earns an options step once
    // `keel.dials` says the peer context is on the table.
    const pinned = await greenfield('web-components');
    expect(hasDials({ ...pinned, dials: { peerContext: true } })).toBe(true);
  });

  it('settles a step that no longer exists back to the last one before it', async () => {
    // Standing on Framework and moving to a language that has none is
    // a step back to Language, not a trip to the start.
    const steps = stepsFor(await greenfield('go-cli'));
    expect(settleStep(steps, 'framework')).toBe('language');
    expect(settleStep(steps, 'entrypoints')).toBe('entrypoints');
    // Nothing before it either: the frontend keeps only the shape.
    const frontend = stepsFor(await greenfield('web-components'));
    expect(settleStep(frontend, 'framework')).toBe('shape');
  });

  it('moves one step at a time, and stops at both ends', async () => {
    const steps = stepsFor(await greenfield('quarkus-cli'));
    expect(nextStep(steps, 'directory')).toBe('shape');
    expect(previousStep(steps, 'shape')).toBe('directory');
    expect(previousStep(steps, 'directory')).toBe('directory');
    expect(nextStep(steps, 'review')).toBe('review');
  });

  it('gives every step a label and a line saying what it is for', async () => {
    for (const step of stepsFor(await greenfield('quarkus-cli'))) {
      expect(step.label).not.toBe('');
      expect(step.doc).not.toBe('');
    }
  });
});
