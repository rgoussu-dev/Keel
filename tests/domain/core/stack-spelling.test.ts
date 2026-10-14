/**
 * A `--stack` spelled in facet words names the one preset those facets
 * are, and nothing else does.
 *
 * Scenario: the spellings users type for a preset — the family's other
 * word (`quarkus-cli-http`), the words in another order, case or
 * spacing, a product named by its backend — and the ones that name no
 * preset, or more than one. Factory: the shipped registry, and beside
 * it a plugin's stacks registered as `registryOf` registers them. Port:
 * none — the reading is a pure function of the registry.
 */

import { describe, expect, it } from 'vitest';
import type { Registry } from '../../../src/domain/contract/ports/registry.js';
import type { Stack } from '../../../src/domain/contract/stack.js';
import {
  pluginOrigin,
  registryOf,
  shippedRegistry,
  shippedSource,
} from '../../../src/domain/core/registry.js';
import { ENTRYPOINTS } from '../../../src/domain/core/stack-wizard.js';
import { StackTableSchema } from '../../../src/domain/core/stack-table.js';
import stackTable from '../../../src/domain/core/stack-presets.json' with { type: 'json' };
import { ID_WORDS, stackReader, stackSpelled } from '../../../src/domain/core/stack-spelling.js';

const stacks = shippedRegistry.stacks();
const read = stackReader(stacks);

/** The shipped preset `id`, which a test reuses the pieces of. */
function shipped(id: string): Stack {
  const stack = shippedRegistry.stack(id);
  if (stack === null) throw new Error(`no stack '${id}'`);
  return stack;
}

/** keel's registry with `plugged` registered beside it by plugin `acme`. */
function withPlugin(...plugged: readonly Stack[]): Registry {
  return registryOf([shippedSource, { origin: pluginOrigin('acme'), stacks: plugged }]);
}

describe('stackSpelled', () => {
  it.each([
    // The family's other word: the JVM presets say `rest`, the rest `http`.
    ['quarkus-cli-http', 'quarkus-cli-rest'],
    ['micronaut-http', 'micronaut-rest'],
    ['go-rest', 'go-http'],
    ['typescript-http', 'ts-http'],
    // The words in any order, with the family's default said or not.
    ['kotlin-quarkus-rest', 'quarkus-rest-kotlin'],
    ['kotlin-spring-http', 'spring-rest-kotlin'],
    ['java-quarkus-cli', 'quarkus-cli'],
    ['cli-http-go', 'go-cli-http'],
    ['spa-web-components', 'web-components'],
    // A word holding a `-`, and a runtime, read as facets too.
    ['go-server-http', 'go-http'],
    ['ts-node-http', 'ts-http'],
    // A product, by its backend: Quarkus, Java and HTTP go unsaid.
    ['fullstack-quarkus', 'fullstack'],
    ['fullstack-go-http', 'fullstack-go'],
    ['fullstack-spring-rest', 'fullstack-spring'],
    // Case and the spaces around it are forgiven.
    ['Quarkus-CLI', 'quarkus-cli'],
    [' go-http ', 'go-http'],
  ])('reads %s as %s, by its facets', (typed, meant) => {
    const spelling = stackSpelled(shippedRegistry, typed);
    expect(spelling.kind).toBe('spelled');
    expect(spelling.kind === 'spelled' ? spelling.stack.id : null).toBe(meant);
  });

  it('takes a registered id as itself, before any reading', () => {
    for (const stack of stacks) {
      const spelling = stackSpelled(shippedRegistry, stack.id);
      expect(spelling).toEqual({ kind: 'id', stack });
    }
  });

  it.each([
    // A word no facet answers to.
    ['quarkus-cli-kotin'],
    ['fullstack-spring-boot'],
    ['nope'],
    ['backend-go-http'],
    // A preset's word missing: every JVM id says its framework and its
    // entrypoint, every Kotlin one its entrypoint.
    ['java-cli'],
    ['spring'],
    ['quarkus-kotlin'],
    // No preset at all: Go has no front end, Kotlin no product.
    ['go-spa'],
    ['fullstack-quarkus-rest-kotlin'],
    // Two entrypoints from both ends: only a product says `fullstack`.
    ['cli-spa'],
  ])('names no preset for %s', (typed) => {
    expect(stackSpelled(shippedRegistry, typed)).toEqual({ kind: 'unknown' });
  });

  it('names no preset where the words read as two', () => {
    // A twin registered beside quarkus-cli: which one the words meant
    // is a guess, and a guess is the nearest id's to make.
    const twin = { ...shipped('quarkus-cli'), id: 'java-quarkus-cli' };
    const twins = [...stacks, twin];
    const registry: Registry = {
      stacks: () => twins,
      verticals: () => shippedRegistry.verticals(),
      stack: (id) => twins.find((stack) => stack.id === id) ?? null,
      vertical: (id) => shippedRegistry.vertical(id),
    };
    const both = stackReader(twins)('cli-java-quarkus');
    expect(both.map((path) => path.stackId).sort()).toEqual(['java-quarkus-cli', 'quarkus-cli']);
    expect(stackSpelled(registry, 'cli-java-quarkus')).toEqual({ kind: 'unknown' });
  });
});

describe("a plugin's stacks", () => {
  it('read by their own language, as keel’s do', () => {
    const python = {
      ...shipped('go-cli'),
      id: 'python-cli',
      tags: ['lang.python', 'arch.hexagonal', 'arch.cli'],
    };
    const spelling = stackSpelled(withPlugin(python), 'cli-python');
    expect(spelling.kind === 'spelled' ? spelling.stack.id : null).toBe('python-cli');
  });

  it('say no word with a tag of an empty last segment, and a typo still refuses', () => {
    const odd = {
      ...shipped('go-cli'),
      id: 'acme-cli',
      tags: ['lang.go', 'framework.', 'arch.cli'],
    };
    const registry = withPlugin(odd);
    expect(stackSpelled(registry, 'quarkus-cli-kotin')).toEqual({ kind: 'unknown' });
    expect(stackSpelled(registry, 'acme-cli')).toEqual({ kind: 'id', stack: odd });
    const spelling = stackSpelled(registry, 'quarkus-cli-http');
    expect(spelling.kind === 'spelled' ? spelling.stack.id : null).toBe('quarkus-cli-rest');
  });

  it('make a word two facets answer to name neither, keel’s ids still exact', () => {
    // A plugin framework called `ts`: `cli-ts` might mean either, so it
    // is refused rather than read one way, and `ts-cli` is still an id.
    const tsCli = shipped('ts-cli');
    const registry = withPlugin({
      ...tsCli,
      id: 'acme-ts-cli',
      tags: [...tsCli.tags, 'framework.ts'],
    });
    expect(stackSpelled(registry, 'cli-ts')).toEqual({ kind: 'unknown' });
    expect(stackSpelled(registry, 'ts-cli')).toEqual({ kind: 'id', stack: tsCli });
  });
});

describe('stackReader', () => {
  it('reads every registered id, by its facets alone, as that preset and no other', () => {
    // A family whose ids say a word no tag does — as the JVM's `rest`
    // and TypeScript's `ts` — reads as nothing here until the reading
    // learns the word, so the family could not be spelled.
    for (const stack of stacks) {
      expect(
        read(stack.id).map((path) => path.stackId),
        stack.id,
      ).toEqual([stack.id]);
    }
  });

  it('never reads a set of words as two presets, and reads 753 of them as one', () => {
    // Every word the reading knows, in sets of up to six: what a typed
    // spelling names must not depend on which of two presets is meant.
    // The count of those naming one keeps the sweep from passing on a
    // word the reading stopped knowing, which would read as nothing.
    const ambiguous: string[] = [];
    let named = 0;
    for (const set of subsetsUpTo(vocabulary(), 6)) {
      const presets = read(set.join('-'));
      if (presets.length > 1) {
        ambiguous.push(`${set.join('-')} → ${presets.map((path) => path.stackId).join(', ')}`);
      }
      if (presets.length === 1) named++;
    }
    expect(ambiguous).toEqual([]);
    expect(named).toBe(753);
  });

  it("knows beyond the tags only the table's own words: its rows' `words`, and ids' other words", () => {
    const table = StackTableSchema.parse(stackTable);
    const said: Record<string, readonly string[]> = {};
    for (const row of table.platforms) {
      for (const [word, spelled] of Object.entries(row.words ?? {})) {
        const entry = ENTRYPOINTS.find((candidate) => candidate.word === word);
        said[spelled] = [`entrypoint:${entry?.id ?? word}`];
      }
      const language = row.tags.find((tag) => tag.startsWith('lang.'))?.split('.')[1];
      for (const word of untagged(row.id, row.tags)) said[word] = [`language:${language}`];
    }
    expect(said).toEqual(ID_WORDS);
  });
});

/** The words of an id pattern no tag of its row says, `{entrypoints}` aside. */
function untagged(pattern: string, tags: readonly string[]): readonly string[] {
  let rest = `-${pattern.replace('{entrypoints}', '')}-`;
  for (const word of tags.map((tag) => tag.slice(tag.indexOf('.') + 1))) {
    rest = rest.replaceAll(`-${word}-`, '-');
  }
  return rest.split('-').filter((word) => word !== '');
}

/**
 * Every word a spelling of a shipped preset may use: each language,
 * runtime and framework its tags name, each entrypoint's id and word,
 * the product shape, and the words ids spell that no tag does.
 */
function vocabulary(): readonly string[] {
  const words = new Set<string>(['fullstack', ...Object.keys(ID_WORDS)]);
  for (const stack of stacks) {
    for (const service of [stack, ...(stack.services ?? []).map(({ stack: id }) => shipped(id))]) {
      for (const tag of service.tags) {
        const [kind, word] = tag.split('.');
        if ((kind === 'lang' || kind === 'runtime' || kind === 'framework') && word) {
          words.add(word);
        }
      }
    }
  }
  for (const entry of ENTRYPOINTS) {
    words.add(entry.id);
    words.add(entry.word);
  }
  return [...words].sort();
}

function* subsetsUpTo(words: readonly string[], size: number): Generator<readonly string[]> {
  function* from(start: number, chosen: readonly string[]): Generator<readonly string[]> {
    if (chosen.length > 0) yield chosen;
    if (chosen.length === size) return;
    for (let at = start; at < words.length; at++) {
      yield* from(at + 1, [...chosen, words[at] as string]);
    }
  }
  yield* from(0, []);
}
