/**
 * The page's narrowing logic for the stack finder.
 *
 * Same standing as `tree.test.ts`: a pure function over data the
 * domain produces, living in `assets/web/` because that is where the
 * page lives and tested here because it needs no browser. The part
 * with an answer that can be wrong is *keeping* a choice across a
 * move — a shape change that silently threw away the framework, or an
 * emptied checkbox group that resolved to a preset nobody picked, is
 * the difference between a wizard you can step back through and one
 * you have to restart.
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
  pickFramework,
  pickLanguage,
  pickShape,
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
    expect(here.shape.id).toBe('backend');
    expect(here.language.id).toBe('kotlin@jvm');
    expect(here.framework.id).toBe('spring');
    expect(here.combination.entrypoints).toEqual(['cli', 'server-http']);
  });

  it('locates a fullstack product too, which is what the shape axis bought', async () => {
    const here = locate(await finder(), 'fullstack');
    expect(here.shape.id).toBe('fullstack');
    expect(here.language.id).toBe('java@jvm');
    expect(here.framework.id).toBe('quarkus');
  });

  it('locates nothing for a preset the finder could not place', async () => {
    expect(locate(await finder(), 'nonsense')).toBeNull();
  });

  it('keeps the language and framework when the shape moves', async () => {
    const tree = await finder();
    const here = locate(tree, 'spring-rest');
    expect(pickShape(tree, 'fullstack', here)).toBe('fullstack-spring');
  });

  it('carries the half of a set the new shape can still take', async () => {
    const tree = await finder();
    const here = locate(tree, 'fullstack');
    // `server-http + spa` cannot survive the move to a backend, but
    // `server-http` can — landing on the CLI preset for want of the
    // half that could not is throwing away an answer that was given.
    expect(pickShape(tree, 'backend', here)).toBe('quarkus-rest');
  });

  it('falls back where the new shape does not offer the old language', async () => {
    const tree = await finder();
    const here = locate(tree, 'spring-rest');
    // The browser is the only frontend language, so nothing carries.
    expect(pickShape(tree, 'frontend', here)).toBe('web-components');
  });

  it('keeps the entrypoints and framework when the language moves', async () => {
    const tree = await finder();
    const here = locate(tree, 'spring-cli-rest');
    expect(pickLanguage(here.shape, 'kotlin@jvm', here)).toBe('spring-cli-rest-kotlin');
  });

  it('falls back where the new language does not offer the old framework', async () => {
    const tree = await finder();
    const here = locate(tree, 'quarkus-cli-rest');
    // Go has no frameworks at all, so the entrypoints carry alone.
    expect(pickLanguage(here.shape, 'go', here)).toBe('go-cli-http');
  });

  it('keeps the entrypoints when the framework moves', async () => {
    const tree = await finder();
    const here = locate(tree, 'quarkus-cli-rest');
    expect(pickFramework(here.language, 'micronaut', here)).toBe('micronaut-cli-rest');
  });

  it('moves to the combination a checkbox group names', async () => {
    const tree = await finder();
    const here = locate(tree, 'micronaut-cli');
    expect(pickEntrypoints(here.framework, 'cli,server-http')).toBe('micronaut-cli-rest');
    expect(pickEntrypoints(here.framework, 'server-http')).toBe('micronaut-rest');
  });

  it('reads a selection in any order, since a checkbox group reports clicks', async () => {
    const tree = await finder();
    const here = locate(tree, 'go-cli');
    expect(pickEntrypoints(here.framework, 'server-http,cli')).toBe('go-cli-http');
  });

  it('refuses an empty selection instead of resolving it to something', async () => {
    const tree = await finder();
    const here = locate(tree, 'go-cli');
    expect(pickEntrypoints(here.framework, '')).toBeNull();
  });

  it('refuses a shape, language or framework it does not know', async () => {
    const tree = await finder();
    const here = locate(tree, 'go-cli');
    expect(pickShape(tree, 'sideways', here)).toBeNull();
    expect(pickLanguage(here.shape, 'cobol', here)).toBeNull();
    expect(pickFramework(here.language, 'nonesuch', here)).toBeNull();
  });

  it('round-trips a selection through the encoding the answer travels in', () => {
    expect(decodeSelection(encodeSelection(['cli', 'server-http']))).toEqual([
      'cli',
      'server-http',
    ]);
    expect(decodeSelection('')).toEqual([]);
  });

  it('reaches every preset from some path, products included', async () => {
    const tree = await finder();
    const reachable = new Set<string>();
    for (const shape of tree.shapes) {
      for (const language of shape.languages) {
        for (const framework of language.frameworks) {
          for (const combination of framework.combinations) reachable.add(combination.stack);
        }
      }
    }
    const catalog: Catalog = expectOk(await installMediator().dispatch(catalogQuery()));
    expect(catalog.stacks.filter((stack) => !reachable.has(stack.id)).map((s) => s.id)).toEqual([]);
  });
});
