/**
 * The id a mistyped `--stack` or vertical most likely meant.
 *
 * Scenario: a user types an id no piece is registered under and no
 * preset's facets name — facet words that together name nothing
 * (`java-cli`, `go-spa`), plain slips, and noise. The reading itself
 * is also held on the facet spellings the audit found users guessing
 * (`quarkus-cli-http`, `go-rest`): a front door now resolves those by
 * `stack-spelling` first, but the reading must still point at them.
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
    // Facet words that together name no preset, as reach this reading.
    ['java-cli', 'quarkus-cli'],
    ['go-spa', 'fullstack-go'],
    ['quarkus-kotlin', 'quarkus-cli-kotlin'],
    ['fullstack-kotlin-go', 'fullstack-kotlin'],
    // A facet in the family's other spelling — resolved before this
    // reading by `stack-spelling`, held here as the reading's own.
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
    // Words run together are split into the ids' words before they are
    // read. Read whole, each counted for nothing, which named the id
    // with one word fewer.
    ['quarkus-clirest', 'quarkus-cli-rest'],
    ['springcli-rest-kotlin', 'spring-cli-rest-kotlin'],
    ['micronaut-restkotlin', 'micronaut-rest-kotlin'],
    ['gocli-http', 'go-cli-http'],
    ['rust-clihttp', 'rust-cli-http'],
    ['fullstackts', 'fullstack-ts'],
    // Read whole, `quarkuscli` counts for nothing and `kotlin` alone
    // names the product that spells it least: `fullstack-kotlin`.
    ['quarkuscli-kotlin', 'quarkus-cli-kotlin'],
    ['quarkusrest-kotlin', 'quarkus-rest-kotlin'],
    ['springcli-kotlin', 'spring-cli-kotlin'],
    ['springrest-kotlin', 'spring-rest-kotlin'],
    ['micronautcli-kotlin', 'micronaut-cli-kotlin'],
    ['micronautrest-kotlin', 'micronaut-rest-kotlin'],
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
    // Words run together, split as a stack's are.
    ['agentharness', 'agent-harness'],
    ['codestyle', 'code-style'],
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

  it('names nothing for several vertical ids typed as one', () => {
    // Naming one of them would drop the rest.
    expect(nearestVertical(verticals, 'ci,persistence')).toBeNull();
    expect(nearestVertical(verticals, 'ci-persistence')).toBeNull();
    expect(nearestVertical(verticals, 'vcsci')).toBeNull();
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

  it('splits a word run together where the longest first word would strand the rest', () => {
    const candidates = [
      { id: 'kite-tail-gamma-long', own: [], related: [] },
      { id: 'kitet-x', own: [], related: [] },
      { id: 'tail-gamma', own: [], related: [] },
      { id: 'kite-gamma', own: [], related: [] },
      { id: 'delta', own: [], related: [] },
    ];
    // `kite` + `tail` + `gamma`. Longest first takes `kitet` and strands
    // `ailgamma`; read whole, only `gamma`'s ids are near.
    expect(nearestId('kitetailgamma', candidates)).toBe('kite-tail-gamma-long');
  });

  it('reads a word that splits two ways as the fewer words', () => {
    const candidates = [
      { id: 'abcdef-gamma', own: [], related: [] },
      { id: 'ab-cdef-zeta', own: [], related: [] },
      { id: 'delta', own: [], related: [] },
    ];
    // `abcdef` + `gamma`; as `ab` + `cdef` + `gamma` it would name
    // `ab-cdef-zeta`, which spells two of the three.
    expect(nearestId('abcdefgamma', candidates)).toBe('abcdef-gamma');
  });

  it('reads a run-together word as its parts over an id one slip from it whole', () => {
    const candidates = [
      { id: 'kite-tail', own: [], related: [] },
      { id: 'kitetai', own: [], related: [] },
      { id: 'delta', own: [], related: [] },
    ];
    expect(nearestId('kitetail', candidates)).toBe('kite-tail');
  });

  it('reads a word typed twice over as one word, never two', () => {
    expect(nearestStack(shippedRegistry, 'gogo')).toBeNull();
  });

  it('splits two-letter id words too, and lets the rest of the reading choose', () => {
    // `go` and `ts` both count; no id spells both, so the tie-breaks
    // name the nearest of those that spell one.
    expect(nearestStack(shippedRegistry, 'gots')).toBe('go-cli');
  });

  it('stays quick on a long run of id words', () => {
    const started = performance.now();
    nearestStack(shippedRegistry, 'go'.repeat(2500));
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it('names nothing from an empty registry', () => {
    expect(nearestId('anything', [])).toBeNull();
  });
});

describe('unknownIdSentence', () => {
  it('names the nearest id first, then every id there is', () => {
    expect(
      unknownIdSentence('stack', 'java-cli', 'quarkus-cli', 'available: go-cli, quarkus-cli'),
    ).toBe("unknown stack 'java-cli' — did you mean 'quarkus-cli'? Available: go-cli, quarkus-cli");
  });

  it('keeps the plain list where nothing is near', () => {
    expect(unknownIdSentence('vertical', 'nope', null, 'available: ci, vcs')).toBe(
      "unknown vertical 'nope'; available: ci, vcs",
    );
  });
});
