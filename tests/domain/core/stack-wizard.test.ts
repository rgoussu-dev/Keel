/**
 * The `keel new` drill-down grid, as a pure function over a stack
 * catalog.
 *
 * Two halves. The **invariants over the real registry** are the ones
 * that matter operationally: every single-service preset must be
 * reachable, no two may collapse onto the same path, and no menu may
 * offer a combination that resolves to nothing. They are the same
 * class of guard as `ci-workflow.test.ts` — a stack the drill-down
 * cannot reach looks exactly like a stack nobody wanted, and a
 * dead-end menu entry looks exactly like a working one until it is
 * picked.
 *
 * The **behaviour over synthetic catalogs** covers the shapes the
 * shipped registry happens not to have, notably a language whose
 * entrypoint subsets are incomplete — which is where the multi-select
 * would be able to express a dead end, and where the step falls back
 * to spelling the combinations out.
 */

import { describe, expect, it } from 'vitest';
import type { Stack, Vertical } from '../../../src/domain/core/stacks.js';
import { STACKS } from '../../../src/domain/core/stacks.js';
import {
  ENTRYPOINTS,
  entrypointStep,
  entrypointsLabel,
  frameworkChoices,
  languageChoices,
  languageLabel,
  normaliseEntrypoints,
  pathFor,
  wizardPaths,
  type WizardPath,
} from '../../../src/domain/core/stack-wizard.js';

/** A stack that exists only to carry tags — nothing here installs it. */
function stack(id: string, tags: readonly string[]): Stack {
  return { id, description: id, tags, verticals: [] as readonly Vertical[] };
}

/** The key a drill-down path is identified by: its three axes. */
function key(path: WizardPath): string {
  return `${path.language}|${path.framework ?? ''}|${path.entrypoints.join(',')}`;
}

const registry = wizardPaths(Object.values(STACKS));

describe('the drill-down grid over the shipped registry', () => {
  it('reaches every single-service preset', () => {
    const reachable = new Set(registry.map((path) => path.stackId));
    const missing = Object.values(STACKS)
      .filter((s) => s.services === undefined)
      .map((s) => s.id)
      .filter((id) => !reachable.has(id));
    expect(missing).toEqual([]);
  });

  it('leaves the composite products to the escape hatch, having no language to sit under', () => {
    const composite = Object.values(STACKS)
      .filter((s) => s.services !== undefined)
      .map((s) => s.id);
    expect(composite.length).toBeGreaterThan(0);
    expect(registry.map((path) => path.stackId)).not.toContain(composite[0]);
  });

  it('gives every preset a path of its own — no two collapse onto one', () => {
    const keys = registry.map(key);
    expect(keys.filter((k, index) => keys.indexOf(k) !== index)).toEqual([]);
  });

  it('never offers a menu entry that resolves to nothing', () => {
    for (const language of languageChoices(registry)) {
      const step = entrypointStep(registry, language.value);
      const combinations =
        step === null
          ? [registry.find((p) => p.language === language.value)?.entrypoints ?? []]
          : step.kind === 'select'
            ? step.choices.map((choice) => normaliseEntrypoints(choice.value))
            : // A checkbox can express any non-empty subset of what it
              // shows, so every one of them has to resolve.
              subsets(step.choices.map((choice) => choice.value));
      for (const entrypoints of combinations) {
        const frameworks = frameworkChoices(registry, language.value, entrypoints);
        const answers = frameworks === null ? [null] : frameworks.map((f) => f.value);
        for (const framework of answers) {
          expect(pathFor(registry, language.value, entrypoints, framework)).not.toBeNull();
        }
      }
    }
  });

  it('asks for a framework on the JVM and nowhere else', () => {
    const asked = languageChoices(registry)
      .map((language) => language.value)
      .filter((language) => {
        const step = entrypointStep(registry, language);
        const entrypoints =
          step === null
            ? (registry.find((p) => p.language === language)?.entrypoints ?? [])
            : normaliseEntrypoints(step.default);
        return frameworkChoices(registry, language, entrypoints) !== null;
      });
    expect(asked).toEqual(['java@jvm', 'kotlin@jvm']);
  });

  it('resolves both JVM entrypoints to the composed preset, not a product', () => {
    expect(pathFor(registry, 'java@jvm', ['cli', 'server-http'], 'quarkus')?.stackId).toBe(
      'quarkus-cli-rest',
    );
    expect(pathFor(registry, 'kotlin@jvm', ['cli', 'server-http'], 'spring')?.stackId).toBe(
      'spring-cli-rest-kotlin',
    );
  });

  it('resolves the frameworkless families straight through', () => {
    expect(pathFor(registry, 'go', ['cli', 'server-http'], null)?.stackId).toBe('go-cli-http');
    expect(pathFor(registry, 'rust', ['server-http'], null)?.stackId).toBe('rust-http');
    expect(pathFor(registry, 'typescript@node', ['cli'], null)?.stackId).toBe('ts-cli');
  });

  it('separates the two TypeScript targets, which is what keeps the SPA out of the checkbox', () => {
    expect(pathFor(registry, 'typescript@browser', ['spa'], null)?.stackId).toBe('web-components');
    expect(entrypointStep(registry, 'typescript@browser')).toBeNull();
    expect(entrypointStep(registry, 'typescript@node')?.choices.map((c) => c.value)).toEqual([
      'cli',
      'server-http',
    ]);
  });

  it('defaults every step towards the preset an omitted --stack always meant', () => {
    const paths = wizardPaths(Object.values(STACKS));
    expect(entrypointStep(paths, 'java@jvm', 'quarkus-cli')?.default).toBe('cli');
    expect(frameworkChoices(paths, 'java@jvm', ['cli'])?.map((c) => c.value)).toContain('quarkus');
  });
});

describe('the drill-down grid over a synthetic catalog', () => {
  it('skips the entrypoint step for a language reaching one combination', () => {
    const paths = wizardPaths([stack('only', ['lang.elm', 'arch.spa'])]);
    expect(entrypointStep(paths, 'elm')).toBeNull();
    expect(pathFor(paths, 'elm', ['spa'], null)?.stackId).toBe('only');
  });

  it('offers a checkbox when every subset of the language is a preset', () => {
    const paths = wizardPaths([
      stack('a', ['lang.zig', 'arch.cli']),
      stack('b', ['lang.zig', 'arch.server-http']),
      stack('c', ['lang.zig', 'arch.cli', 'arch.server-http']),
    ]);
    const step = entrypointStep(paths, 'zig');
    expect(step?.kind).toBe('multi-select');
    expect(step?.choices.map((c) => c.value)).toEqual(['cli', 'server-http']);
  });

  it('spells the combinations out when a subset is missing, rather than offering a dead end', () => {
    // No `cli + spa` preset: a checkbox over {cli, spa} could express
    // it, so the step must not be a checkbox.
    const paths = wizardPaths([
      stack('a', ['lang.zig', 'arch.cli']),
      stack('b', ['lang.zig', 'arch.spa']),
    ]);
    const step = entrypointStep(paths, 'zig');
    expect(step?.kind).toBe('select');
    expect(step?.choices.map((c) => c.value)).toEqual(['cli', 'spa']);
    expect(pathFor(paths, 'zig', ['cli', 'spa'], null)).toBeNull();
  });

  it('asks for a framework only where the chosen entrypoints leave more than one', () => {
    const paths = wizardPaths([
      stack('one', ['lang.zig', 'framework.alpha', 'arch.cli']),
      stack('two', ['lang.zig', 'framework.beta', 'arch.cli']),
      stack('solo', ['lang.zig', 'framework.alpha', 'arch.server-http']),
    ]);
    expect(frameworkChoices(paths, 'zig', ['cli'])?.map((c) => c.value)).toEqual(['alpha', 'beta']);
    expect(frameworkChoices(paths, 'zig', ['server-http'])).toBeNull();
  });

  it('qualifies a language by its runtime, so two targets are two nodes', () => {
    const paths = wizardPaths([
      stack('node', ['lang.zig', 'runtime.node', 'arch.cli']),
      stack('browser', ['lang.zig', 'runtime.browser', 'arch.spa']),
    ]);
    expect(
      languageChoices(paths)
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
    expect(languageChoices(paths)[0]?.doc).toBe('2 presets: a, b');
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

  it('registers only the arch tags that really are entrypoints', () => {
    expect(ENTRYPOINTS.map((e) => e.tag)).toEqual(['arch.cli', 'arch.server-http', 'arch.spa']);
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
