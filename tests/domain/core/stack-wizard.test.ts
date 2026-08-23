/**
 * The `keel new` drill-down grid, as a pure function over a stack
 * catalog.
 *
 * Two halves. The **invariants over the real registry** are the ones
 * that matter operationally: every preset must be reachable, no two
 * may collapse onto the same path, and no menu may offer a
 * combination that resolves to nothing. They are the same class of
 * guard as `ci-workflow.test.ts` — a stack the drill-down cannot
 * reach looks exactly like a stack nobody wanted, and a dead-end menu
 * entry looks exactly like a working one until it is picked.
 *
 * "Every preset" now includes the composite products, which is the
 * whole point of the shape axis: before it there was no branch a
 * two-service product could sit on, and `fullstack` was reachable
 * only by typing its id.
 *
 * The **behaviour over synthetic catalogs** covers the shapes the
 * shipped registry happens not to have, notably a combination whose
 * entrypoint subsets are incomplete — which is where the multi-select
 * would be able to express a dead end, and where the step falls back
 * to spelling the combinations out.
 */

import { describe, expect, it } from 'vitest';
import type { Stack, Vertical } from '../../../src/domain/core/stacks.js';
import { STACKS } from '../../../src/domain/core/stacks.js';
import {
  ENTRYPOINTS,
  SHAPES,
  entrypointCombinations,
  entrypointStep,
  entrypointsLabel,
  frameworkChoices,
  frameworkPaths,
  languageChoices,
  languageLabel,
  normaliseEntrypoints,
  pathFor,
  pathOf,
  shapeChoices,
  shapeLabel,
  wizardPaths,
  type ProjectShape,
  type WizardPath,
} from '../../../src/domain/core/stack-wizard.js';

/** A stack that exists only to carry tags — nothing here installs it. */
function stack(id: string, tags: readonly string[]): Stack {
  return { id, description: id, tags, verticals: [] as readonly Vertical[] };
}

/** A composite that exists only to carry service references. */
function product(id: string, services: readonly string[]): Stack {
  return {
    id,
    description: id,
    tags: [],
    verticals: [] as readonly Vertical[],
    services: services.map((ref, index) => ({ path: `s${index}`, stack: ref })),
  };
}

/** The key a drill-down path is identified by: its four axes. */
function key(path: WizardPath): string {
  return `${path.shape}|${path.language}|${path.framework ?? ''}|${path.entrypoints.join(',')}`;
}

const registry = wizardPaths(Object.values(STACKS));

describe('the drill-down grid over the shipped registry', () => {
  it('reaches every preset, products included', () => {
    const reachable = new Set(registry.map((path) => path.stackId));
    const missing = Object.values(STACKS)
      .map((s) => s.id)
      .filter((id) => !reachable.has(id));
    expect(missing).toEqual([]);
  });

  it('places the composite products under the fullstack shape', () => {
    const composite = Object.values(STACKS)
      .filter((s) => s.services !== undefined)
      .map((s) => s.id);
    expect(composite.length).toBeGreaterThan(0);
    for (const id of composite) expect(pathOf(registry, id)?.shape).toBe('fullstack');
  });

  it('reads a product’s language and framework off its backend, not its front end', () => {
    // The front end is what makes it fullstack; the engine is the
    // half a fullstack product actually leaves open.
    expect(pathOf(registry, 'fullstack')).toMatchObject({
      shape: 'fullstack',
      language: 'java@jvm',
      framework: 'quarkus',
      entrypoints: ['server-http', 'spa'],
    });
    expect(pathOf(registry, 'fullstack-go')).toMatchObject({
      shape: 'fullstack',
      language: 'go',
      framework: null,
    });
  });

  it('sorts every single-service preset into backend or frontend by its entrypoints', () => {
    expect(pathOf(registry, 'quarkus-cli-rest')?.shape).toBe('backend');
    expect(pathOf(registry, 'rust-http')?.shape).toBe('backend');
    expect(pathOf(registry, 'web-components')?.shape).toBe('frontend');
  });

  it('gives every preset a path of its own — no two collapse onto one', () => {
    const keys = registry.map(key);
    expect(keys.filter((k, index) => keys.indexOf(k) !== index)).toEqual([]);
  });

  it('never offers a menu entry that resolves to nothing', () => {
    for (const shape of shapeChoices(registry)) {
      const id = shape.value as ProjectShape;
      for (const language of languageChoices(registry, id)) {
        const frameworks = frameworkChoices(registry, id, language.value);
        const answers = frameworks === null ? [null] : frameworks.map((f) => f.value);
        for (const framework of answers) {
          const step = entrypointStep(registry, id, language.value, framework);
          const combinations =
            step === null
              ? entrypointCombinations(registry, id, language.value, framework)
              : step.kind === 'select'
                ? step.choices.map((choice) => normaliseEntrypoints(choice.value))
                : // A checkbox can express any non-empty subset of what
                  // it shows, so every one of them has to resolve.
                  subsets(step.choices.map((choice) => choice.value));
          for (const entrypoints of combinations) {
            expect(pathFor(registry, id, language.value, framework, entrypoints)).not.toBeNull();
          }
        }
      }
    }
  });

  it('asks all three shapes, since the registry reaches all three', () => {
    expect(shapeChoices(registry).map((c) => c.value)).toEqual([
      'fullstack',
      'backend',
      'frontend',
    ]);
  });

  it('asks for a framework on the JVM and nowhere else', () => {
    const asked: string[] = [];
    for (const shape of shapeChoices(registry)) {
      const id = shape.value as ProjectShape;
      for (const language of languageChoices(registry, id)) {
        if (frameworkChoices(registry, id, language.value) !== null) {
          asked.push(`${id}/${language.value}`);
        }
      }
    }
    expect(asked).toEqual(['fullstack/java@jvm', 'backend/java@jvm', 'backend/kotlin@jvm']);
  });

  it('never asks a frontend anything past the shape, there being one preset', () => {
    expect(languageChoices(registry, 'frontend').map((c) => c.value)).toEqual([
      'typescript@browser',
    ]);
    expect(frameworkChoices(registry, 'frontend', 'typescript@browser')).toBeNull();
    expect(entrypointStep(registry, 'frontend', 'typescript@browser', null)).toBeNull();
    expect(pathFor(registry, 'frontend', 'typescript@browser', null, ['spa'])?.stackId).toBe(
      'web-components',
    );
  });

  it('resolves both JVM entrypoints to the composed preset, not a product', () => {
    expect(
      pathFor(registry, 'backend', 'java@jvm', 'quarkus', ['cli', 'server-http'])?.stackId,
    ).toBe('quarkus-cli-rest');
    expect(
      pathFor(registry, 'backend', 'kotlin@jvm', 'spring', ['cli', 'server-http'])?.stackId,
    ).toBe('spring-cli-rest-kotlin');
  });

  it('resolves the frameworkless families straight through', () => {
    expect(pathFor(registry, 'backend', 'go', null, ['cli', 'server-http'])?.stackId).toBe(
      'go-cli-http',
    );
    expect(pathFor(registry, 'backend', 'rust', null, ['server-http'])?.stackId).toBe('rust-http');
    expect(pathFor(registry, 'backend', 'typescript@node', null, ['cli'])?.stackId).toBe('ts-cli');
  });

  it('separates the two TypeScript targets, which is what keeps the SPA out of the checkbox', () => {
    expect(languageChoices(registry, 'backend').map((c) => c.value)).toContain('typescript@node');
    expect(languageChoices(registry, 'backend').map((c) => c.value)).not.toContain(
      'typescript@browser',
    );
    expect(
      entrypointStep(registry, 'backend', 'typescript@node', null)?.choices.map((c) => c.value),
    ).toEqual(['cli', 'server-http']);
  });

  it('reaches a product through the same four answers a form would send', () => {
    expect(
      pathFor(registry, 'fullstack', 'java@jvm', 'spring', ['server-http', 'spa'])?.stackId,
    ).toBe('fullstack-spring');
  });

  it('defaults every step towards the preset an omitted --stack always meant', () => {
    expect(pathOf(registry, 'quarkus-cli')).toMatchObject({
      shape: 'backend',
      language: 'java@jvm',
      framework: 'quarkus',
      entrypoints: ['cli'],
    });
    expect(entrypointStep(registry, 'backend', 'java@jvm', 'quarkus', 'quarkus-cli')?.default).toBe(
      'cli',
    );
    expect(frameworkChoices(registry, 'backend', 'java@jvm')?.map((c) => c.value)).toContain(
      'quarkus',
    );
  });
});

describe('the drill-down grid over a synthetic catalog', () => {
  it('skips the entrypoint step for a combination reaching one set', () => {
    const paths = wizardPaths([stack('only', ['lang.elm', 'arch.spa'])]);
    expect(entrypointStep(paths, 'frontend', 'elm', null)).toBeNull();
    expect(pathFor(paths, 'frontend', 'elm', null, ['spa'])?.stackId).toBe('only');
  });

  it('offers a checkbox when every subset of the combination is a preset', () => {
    const paths = wizardPaths([
      stack('a', ['lang.zig', 'arch.cli']),
      stack('b', ['lang.zig', 'arch.server-http']),
      stack('c', ['lang.zig', 'arch.cli', 'arch.server-http']),
    ]);
    const step = entrypointStep(paths, 'backend', 'zig', null);
    expect(step?.kind).toBe('multi-select');
    expect(step?.choices.map((c) => c.value)).toEqual(['cli', 'server-http']);
  });

  it('spells the combinations out when a subset is missing, rather than offering a dead end', () => {
    // Both stacks reach both sides, so both are fullstack — and there
    // is no `cli + server-http + spa` preset, which a checkbox over
    // the three would be able to express.
    const paths = wizardPaths([
      stack('a', ['lang.zig', 'arch.cli', 'arch.spa']),
      stack('b', ['lang.zig', 'arch.server-http', 'arch.spa']),
    ]);
    const step = entrypointStep(paths, 'fullstack', 'zig', null);
    expect(step?.kind).toBe('select');
    expect(step?.choices.map((c) => c.value)).toEqual(['cli,spa', 'server-http,spa']);
    expect(pathFor(paths, 'fullstack', 'zig', null, ['cli', 'server-http', 'spa'])).toBeNull();
  });

  it('splits one language across shapes, so a backend menu never offers a front end', () => {
    const paths = wizardPaths([
      stack('svc', ['lang.zig', 'arch.cli']),
      stack('page', ['lang.zig', 'arch.spa']),
    ]);
    expect(pathOf(paths, 'svc')?.shape).toBe('backend');
    expect(pathOf(paths, 'page')?.shape).toBe('frontend');
    expect(entrypointStep(paths, 'backend', 'zig', null)).toBeNull();
    expect(shapeChoices(paths).map((c) => c.value)).toEqual(['backend', 'frontend']);
  });

  it('asks for a framework only where the shape and language leave more than one', () => {
    const paths = wizardPaths([
      stack('one', ['lang.zig', 'framework.alpha', 'arch.cli']),
      stack('two', ['lang.zig', 'framework.beta', 'arch.cli']),
      stack('solo', ['lang.zig', 'framework.alpha', 'arch.spa']),
    ]);
    expect(frameworkChoices(paths, 'backend', 'zig')?.map((c) => c.value)).toEqual([
      'alpha',
      'beta',
    ]);
    expect(frameworkChoices(paths, 'frontend', 'zig')).toBeNull();
    expect(frameworkPaths(paths, 'frontend', 'zig').map((f) => f.presets)).toEqual([['solo']]);
  });

  it('qualifies a language by its runtime, so two targets are two nodes', () => {
    const paths = wizardPaths([
      stack('node', ['lang.zig', 'runtime.node', 'arch.cli']),
      stack('browser', ['lang.zig', 'runtime.browser', 'arch.cli']),
    ]);
    expect(
      languageChoices(paths, 'backend')
        .map((c) => c.value)
        .sort(),
    ).toEqual(['zig@browser', 'zig@node']);
  });

  it('skips a stack that names no language or no entrypoint', () => {
    const paths = wizardPaths([
      stack('nolang', ['arch.cli']),
      stack('noentry', ['lang.zig', 'arch.hexagonal']),
    ]);
    expect(paths).toEqual([]);
  });

  it('documents each language by the presets it leads to', () => {
    const paths = wizardPaths([
      stack('a', ['lang.zig', 'arch.cli']),
      stack('b', ['lang.zig', 'arch.server-http']),
    ]);
    expect(languageChoices(paths, 'backend')[0]?.doc).toBe('2 presets: a, b');
  });

  it('leaves a product out where it names a service the catalog does not hold', () => {
    expect(wizardPaths([product('p', ['missing'])])).toEqual([]);
  });

  it('leaves a product out where it has no single backend to read', () => {
    const front = stack('page', ['lang.zig', 'arch.spa']);
    const one = stack('api', ['lang.zig', 'arch.server-http']);
    const two = stack('worker', ['lang.go', 'arch.cli']);
    // Two engines: which language the product is in has no answer, so
    // the tree declines to invent one and the by-id list keeps it.
    const paths = wizardPaths([front, one, two, product('p', ['page', 'api', 'worker'])]);
    expect(pathOf(paths, 'p')).toBeNull();
    // …and none at all is the same story.
    expect(pathOf(wizardPaths([front, product('q', ['page'])]), 'q')).toBeNull();
  });

  it('reads a product’s shape from every service together', () => {
    const paths = wizardPaths([
      stack('page', ['lang.zig', 'arch.spa']),
      stack('api', ['lang.zig', 'arch.server-http']),
      product('both', ['page', 'api']),
    ]);
    expect(pathOf(paths, 'both')).toMatchObject({
      shape: 'fullstack',
      language: 'zig',
      entrypoints: ['server-http', 'spa'],
    });
  });
});

describe('labels and encodings', () => {
  it('normalises an answered selection into menu order', () => {
    expect(normaliseEntrypoints('server-http,cli')).toEqual(['cli', 'server-http']);
    expect(normaliseEntrypoints('')).toEqual([]);
    expect(normaliseEntrypoints('cli,nonsense')).toEqual(['cli']);
  });

  it('spells a combination the way a message names it', () => {
    expect(entrypointsLabel(['cli', 'server-http'])).toBe('CLI + HTTP server');
  });

  it('falls back to the tags themselves for a language nobody named', () => {
    expect(languageLabel('java@jvm')).toBe('Java');
    expect(languageLabel('zig')).toBe('zig');
    expect(languageLabel('zig@wasm')).toBe('zig (wasm)');
  });

  it('registers only the arch tags that really are entrypoints, each with a side', () => {
    expect(ENTRYPOINTS.map((e) => [e.tag, e.side])).toEqual([
      ['arch.cli', 'back'],
      ['arch.server-http', 'back'],
      ['arch.spa', 'front'],
    ]);
  });

  it('names every shape, and spells one the way a message names it', () => {
    expect(SHAPES.map((s) => s.id)).toEqual(['fullstack', 'backend', 'frontend']);
    expect(shapeLabel('backend')).toContain('Backend');
    expect(shapeLabel('nonsense' as ProjectShape)).toBe('nonsense');
  });
});

/** Every non-empty subset of `values`, in the order the menu lists them. */
function subsets(values: readonly string[]): readonly (readonly string[])[] {
  const out: string[][] = [];
  for (let mask = 1; mask < 2 ** values.length; mask += 1) {
    out.push(values.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return out;
}
