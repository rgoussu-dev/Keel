/**
 * The page's narrowing logic for the stack finder.
 *
 * Same standing as `tree.test.ts`: a pure function over data the
 * domain produces, living in `assets/web/` because that is where the
 * page lives and tested here because it needs no browser. The part
 * with an answer that can be wrong is *keeping* a choice across a
 * facet move — a language change that silently threw away the
 * framework, or an emptied checkbox group that resolved to a preset
 * nobody picked, is the difference between facets and a wizard you
 * have to restart.
 *
 * Driven against the real `keel.catalog` payload rather than a
 * hand-written tree, so a change to the grid shows up here.
 */

import { describe, expect, it } from 'vitest';
import { catalogQuery } from '../../../src/domain/contract/queries.js';
import type { Catalog } from '../../../src/domain/contract/queries.js';
// @ts-expect-error — plain ESM shipped to the browser, no declarations.
import {
  decodeSelection,
  defaultStack,
  encodeSelection,
  locate,
  pickEntrypoints,
  pickLanguage,
} from '../../../assets/web/src/finder.js';
import { expectOk, installMediator } from '../../support/factory.js';

async function finder(): Promise<Catalog['finder']> {
  const catalog: Catalog = expectOk(await installMediator().dispatch(catalogQuery()));
  return catalog.finder;
}

describe('the page’s stack finder', () => {
  it('opens on the preset an omitted --stack resolves to', async () => {
    expect(defaultStack(await finder())).toBe('quarkus-cli');
  });

  it('locates a preset by the path that reaches it', async () => {
    const here = locate(await finder(), 'spring-cli-rest-kotlin');
    expect(here.language.id).toBe('kotlin@jvm');
    expect(here.combination.entrypoints).toEqual(['cli', 'server-http']);
    expect(here.framework.id).toBe('spring');
  });

  it('locates nothing for a fullstack product, which names no language', async () => {
    expect(locate(await finder(), 'fullstack')).toBeNull();
  });

  it('keeps the entrypoints and framework when the language moves', async () => {
    const tree = await finder();
    const here = locate(tree, 'spring-cli-rest');
    expect(pickLanguage(tree, 'kotlin@jvm', here)).toBe('spring-cli-rest-kotlin');
  });

  it('falls back where the new language does not offer the old framework', async () => {
    const tree = await finder();
    const here = locate(tree, 'quarkus-cli-rest');
    // Go has no frameworks at all, so the combination carries.
    expect(pickLanguage(tree, 'go', here)).toBe('go-cli-http');
  });

  it('falls back where the new language does not offer the old entrypoints', async () => {
    const tree = await finder();
    const here = locate(tree, 'quarkus-cli-rest');
    // The browser target reaches only `spa`; there is one preset to land on.
    expect(pickLanguage(tree, 'typescript@browser', here)).toBe('web-components');
  });

  it('keeps the framework when the entrypoints move', async () => {
    const tree = await finder();
    const here = locate(tree, 'micronaut-cli');
    expect(pickEntrypoints(here.language, 'cli,server-http', here)).toBe('micronaut-cli-rest');
    expect(pickEntrypoints(here.language, 'server-http', here)).toBe('micronaut-rest');
  });

  it('reads a selection in any order, since a checkbox group reports clicks', async () => {
    const tree = await finder();
    const here = locate(tree, 'go-cli');
    expect(pickEntrypoints(here.language, 'server-http,cli', here)).toBe('go-cli-http');
  });

  it('refuses an empty selection instead of resolving it to something', async () => {
    const tree = await finder();
    const here = locate(tree, 'go-cli');
    expect(pickEntrypoints(here.language, '', here)).toBeNull();
  });

  it('refuses a language it does not know', async () => {
    expect(pickLanguage(await finder(), 'cobol', null)).toBeNull();
  });

  it('round-trips a selection through the encoding the answer travels in', () => {
    expect(decodeSelection(encodeSelection(['cli', 'server-http']))).toEqual([
      'cli',
      'server-http',
    ]);
    expect(decodeSelection('')).toEqual([]);
  });

  it('reaches every single-project preset from some path', async () => {
    const tree = await finder();
    const reachable = new Set<string>();
    for (const language of tree.languages) {
      for (const combination of language.combinations) {
        for (const framework of combination.frameworks) reachable.add(framework.stack);
      }
    }
    const catalog: Catalog = expectOk(await installMediator().dispatch(catalogQuery()));
    const single = catalog.stacks.filter((stack) => stack.services.length === 0);
    expect(single.filter((stack) => !reachable.has(stack.id)).map((s) => s.id)).toEqual([]);
  });
});
