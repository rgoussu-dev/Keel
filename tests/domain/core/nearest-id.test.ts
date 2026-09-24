/**
 * The id a mistyped `--stack` or vertical most likely meant.
 *
 * Scenario: a user types an id no piece is registered under — the
 * spellings the audit found users guessing (`quarkus-cli-http`,
 * `go-rest`, `fullstack-quarkus`), plain slips, and noise.
 * Factory: the shipped registry, and a registry of hand-made pieces
 * where the reading itself is the subject. Port: none — the reading is
 * a pure function of the registry.
 */

import { describe, expect, it } from 'vitest';
import type { Vertical } from '../../../src/domain/contract/composition.js';
import {
  nearestId,
  nearestStack,
  nearestVertical,
  unknownIdSentence,
} from '../../../src/domain/core/nearest-id.js';
import { shippedRegistry } from '../../../src/domain/core/registry.js';

describe('nearestStack', () => {
  it.each([
    // A facet in the family's other spelling: the JVM presets say `rest`.
    ['quarkus-cli-http', 'quarkus-cli-rest'],
    ['micronaut-http', 'micronaut-rest'],
    // …and Go, Rust and TypeScript say `http`.
    ['go-rest', 'go-http'],
    ['ts-rest', 'ts-http'],
    ['typescript-http', 'ts-http'],
    // A product named by its engine: the Quarkus one is plain `fullstack`.
    ['fullstack-quarkus', 'fullstack'],
    ['fullstack-spring-boot', 'fullstack-spring'],
    // Words in another order, another case, or run together.
    ['kotlin-quarkus-rest', 'quarkus-rest-kotlin'],
    ['Quarkus-CLI', 'quarkus-cli'],
    ['quarkuscli', 'quarkus-cli'],
    // A slip inside a word.
    ['quarkus-cli-kotin', 'quarkus-cli-kotlin'],
    ['micronaunt-cli', 'micronaut-cli'],
    // A front end, by what it is.
    ['spa', 'web-components'],
    ['web', 'web-components'],
  ])('reads %s as %s', (typed, meant) => {
    expect(nearestStack(shippedRegistry, typed)).toBe(meant);
  });

  it('names nothing where nothing is near', () => {
    expect(nearestStack(shippedRegistry, 'nope')).toBeNull();
    expect(nearestStack(shippedRegistry, 'xyz')).toBeNull();
  });

  it('does not count a word every stack answers to', () => {
    // Every preset is hexagonal, so the word points at none of them.
    expect(nearestStack(shippedRegistry, 'hexagonal')).toBeNull();
  });

  it('only ever names a registered id', () => {
    const ids = new Set(shippedRegistry.stacks().map((stack) => stack.id));
    for (const typed of ['java', 'rust', 'node', 'kotlin', 'spring-boot', 'cli-http']) {
      const meant = nearestStack(shippedRegistry, typed);
      expect(meant === null || ids.has(meant)).toBe(true);
    }
  });
});

describe('nearestVertical', () => {
  const verticals = shippedRegistry.verticals();

  it.each([
    ['persistance', 'persistence'],
    ['observabilty', 'observability'],
    ['devenv', 'dev-env'],
    // By its title's words: Container image, Infrastructure as code.
    ['container', 'containerization'],
    ['infra', 'iac'],
    ['harness', 'agent-harness'],
    // Two neighbours swapped are one slip, not two.
    ['vsc', 'vcs'],
    ['ica', 'iac'],
  ])('reads %s as %s', (typed, meant) => {
    expect(nearestVertical(verticals, typed)).toBe(meant);
  });

  it('names nothing where nothing is near', () => {
    expect(nearestVertical(verticals, 'nope')).toBeNull();
    expect(nearestVertical(verticals, 'nonsense-vertical')).toBeNull();
  });

  it('does not read a short word as any short id it could be edited into', () => {
    // Two edits make `ci` of any two letters: a guess, not a slip.
    expect(nearestVertical(verticals, 'db')).toBeNull();
    expect(nearestVertical(verticals, 'git')).toBeNull();
    expect(nearestVertical(verticals, '')).toBeNull();
  });

  it('reads a plugin vertical by the same words as a shipped one', () => {
    const plugin: Vertical = {
      id: 'message-queue',
      title: 'Message broker',
      description: '',
      dimensions: [],
      adapters: [],
    };
    expect(nearestVertical([...verticals, plugin], 'broker')).toBe('message-queue');
  });
});

describe('nearestId', () => {
  it('weighs a word the id spells over one its own facets say, over one its parts say', () => {
    const byParts = { id: 'alpha', own: [], related: ['kite'] };
    const byOwn = { id: 'beta', own: ['kite'], related: [] };
    const bySpelling = { id: 'kite-gamma', own: [], related: [] };
    // A candidate the word does not name, so the word tells them apart.
    const neither = { id: 'delta', own: [], related: [] };
    expect(nearestId('kite', [byParts, byOwn, bySpelling, neither])).toBe('kite-gamma');
    expect(nearestId('kite', [byParts, byOwn, neither])).toBe('beta');
    expect(nearestId('kite', [byParts, neither])).toBe('alpha');
  });

  it('breaks a tie by the id spelling fewer words the user did not type', () => {
    const candidates = [
      { id: 'kite-long-tail', own: [], related: [] },
      { id: 'kite-tail', own: [], related: [] },
      { id: 'delta', own: [], related: [] },
    ];
    expect(nearestId('kite', candidates)).toBe('kite-tail');
  });

  it('names nothing from an empty registry', () => {
    expect(nearestId('anything', [])).toBeNull();
  });
});

describe('unknownIdSentence', () => {
  it('names the nearest id first, then every id there is', () => {
    expect(unknownIdSentence('stack', 'go-rest', 'go-http', 'available: go-cli, go-http')).toBe(
      "unknown stack 'go-rest' — did you mean 'go-http'? Available: go-cli, go-http",
    );
  });

  it('keeps the plain list where nothing is near', () => {
    expect(unknownIdSentence('vertical', 'nope', null, 'available: ci, vcs')).toBe(
      "unknown vertical 'nope'; available: ci, vcs",
    );
  });
});
