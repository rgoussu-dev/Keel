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
import {
  decodeSelection,
  defaultStack,
  encodeSelection,
  languageJump,
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

/**
 * `locate`, asserted to have found something.
 *
 * `locate` answers null for a preset the tree cannot place, which is
 * a real answer and has its own case below. Everywhere else a null
 * would mean the fixture is wrong, and failing on the spot says so
 * better than a property access on null three lines later.
 */
type LanguageNode = Catalog['finder']['shapes'][number]['languages'][number];
type FrameworkNode = LanguageNode['frameworks'][number];
type Combination = FrameworkNode['combinations'][number];

function at(tree: Catalog['finder'], stack: string): NonNullable<ReturnType<typeof locate>> {
  const found = locate(tree, stack);
  if (found === null) throw new Error(`the finder cannot place '${stack}'`);
  return found;
}

describe('the page’s stack finder', () => {
  it('opens on the preset an omitted --stack resolves to', async () => {
    expect(defaultStack(await finder())).toBe('quarkus-cli');
  });

  it('locates a preset by the path that reaches it', async () => {
    const here = at(await finder(), 'spring-cli-rest-kotlin');
    expect(here.shape.id).toBe('backend');
    expect(here.language.id).toBe('kotlin@jvm');
    expect(here.framework.id).toBe('spring');
    expect(here.combination.entrypoints).toEqual(['cli', 'server-http']);
  });

  it('locates a fullstack product too, which is what the shape axis bought', async () => {
    const here = at(await finder(), 'fullstack');
    expect(here.shape.id).toBe('fullstack');
    expect(here.language.id).toBe('java@jvm');
    expect(here.framework.id).toBe('quarkus');
  });

  it('locates nothing for a preset the finder could not place', async () => {
    expect(locate(await finder(), 'nonsense')).toBeNull();
  });

  it('keeps the language and framework when the shape moves', async () => {
    const tree = await finder();
    const here = at(tree, 'spring-rest');
    expect(pickShape(tree, 'fullstack', here)).toBe('fullstack-spring');
  });

  it('carries the half of a set the new shape can still take', async () => {
    const tree = await finder();
    const here = at(tree, 'fullstack');
    // `server-http + spa` cannot survive the move to a backend, but
    // `server-http` can — landing on the CLI preset for want of the
    // half that could not is throwing away an answer that was given.
    expect(pickShape(tree, 'backend', here)).toBe('quarkus-rest');
  });

  it('falls back where the new shape does not offer the old language', async () => {
    const tree = await finder();
    const here = at(tree, 'spring-rest');
    // The browser is the only frontend language, so nothing carries.
    expect(pickShape(tree, 'frontend', here)).toBe('web-components');
  });

  it('lands a language the new shape lacks on its kin with the same framework', async () => {
    const tree = await finder();
    const here = at(tree, 'spring-cli-rest-kotlin');
    // No product is written in Kotlin. Java on Spring is one step
    // away; Go — first, because languages sort by label — is not.
    expect(pickShape(tree, 'fullstack', here)).toBe('fullstack-spring');
  });

  it('lands a front end moving to the backend where a blank form opens', async () => {
    const tree = await finder();
    const here = at(tree, 'web-components');
    // The browser shares neither a framework nor a runtime with any
    // backend, so the default preset is the nearest thing to an answer.
    expect(pickShape(tree, 'backend', here)).toBe(defaultStack(tree));
    // …and a product has the default's language and framework too.
    expect(pickShape(tree, 'fullstack', here)).toBe('fullstack');
  });

  it('lands a preset the finder could not place on the default too', async () => {
    const tree = await finder();
    expect(pickShape(tree, 'backend', null)).toBe(defaultStack(tree));
  });

  it('asks the framework first, then the runtime, then the default — in that order', () => {
    // The shipped catalog cannot tell the rungs apart — Java has every
    // framework Kotlin has, on the same runtime — so the tree is
    // written out, typed against the contract so it cannot drift from
    // it. Each wrong rung lands somewhere different here.
    const leaf = (stack: string, entrypoints: string[]): Combination => ({ entrypoints, stack });
    const framework = (id: string, ...combinations: Combination[]): FrameworkNode => ({
      id,
      label: id,
      entrypointStep: null,
      combinations,
    });
    const language = (
      id: string,
      runtime: string | null,
      ...frameworks: FrameworkNode[]
    ): LanguageNode => ({ id, label: id, doc: '', runtime, frameworks });
    const product = ['server-http', 'spa'];
    const tree: Catalog['finder'] = {
      defaultStack: 'app-go',
      shapes: [
        {
          id: 'backend',
          label: 'Backend',
          doc: '',
          languages: [
            language('go', null, framework('', leaf('app-go', ['cli']))),
            language(
              'kotlin@jvm',
              'jvm',
              framework('ktor', leaf('app-ktor', ['server-http'])),
              framework('spring', leaf('app-spring', ['server-http'])),
            ),
          ],
        },
        {
          id: 'fullstack',
          label: 'Fullstack',
          doc: '',
          languages: [
            language('go', null, framework('', leaf('product-go', product))),
            language('groovy@jvm', 'jvm', framework('micronaut', leaf('product-groovy', product))),
            language('java@jvm', 'jvm', framework('spring', leaf('product-spring', product))),
          ],
        },
      ],
    };
    // Spring has a product, in Java: kin by framework beats kin by
    // runtime, which would have been Groovy.
    expect(pickShape(tree, 'fullstack', at(tree, 'app-spring'))).toBe('product-spring');
    // Ktor has none, but the JVM does. Go is both the first language
    // and the default's, so landing on it would mean the runtime was
    // never asked.
    expect(pickShape(tree, 'fullstack', at(tree, 'app-ktor'))).toBe('product-groovy');
  });

  it('keeps the entrypoints and framework when the language moves', async () => {
    const tree = await finder();
    const here = at(tree, 'spring-cli-rest');
    expect(pickLanguage(here.shape, 'kotlin@jvm', here)).toBe('spring-cli-rest-kotlin');
  });

  it('falls back where the new language does not offer the old framework', async () => {
    const tree = await finder();
    const here = at(tree, 'quarkus-cli-rest');
    // Go has no frameworks at all, so the entrypoints carry alone.
    expect(pickLanguage(here.shape, 'go', here)).toBe('go-cli-http');
  });

  it('keeps the entrypoints when the framework moves', async () => {
    const tree = await finder();
    const here = at(tree, 'quarkus-cli-rest');
    expect(pickFramework(here.language, 'micronaut', here)).toBe('micronaut-cli-rest');
  });

  it('moves to the combination a checkbox group names', async () => {
    const tree = await finder();
    const here = at(tree, 'micronaut-cli');
    expect(pickEntrypoints(here.framework, 'cli,server-http')).toBe('micronaut-cli-rest');
    expect(pickEntrypoints(here.framework, 'server-http')).toBe('micronaut-rest');
  });

  it('reads a selection in any order, since a checkbox group reports clicks', async () => {
    const tree = await finder();
    const here = at(tree, 'go-cli');
    expect(pickEntrypoints(here.framework, 'server-http,cli')).toBe('go-cli-http');
  });

  it('refuses an empty selection instead of resolving it to something', async () => {
    const tree = await finder();
    const here = at(tree, 'go-cli');
    expect(pickEntrypoints(here.framework, '')).toBeNull();
  });

  it('refuses a shape, language or framework it does not know', async () => {
    const tree = await finder();
    const here = at(tree, 'go-cli');
    expect(pickShape(tree, 'sideways', here)).toBeNull();
    expect(pickLanguage(here.shape, 'cobol', here)).toBeNull();
    expect(pickFramework(here.language, 'nonesuch', here)).toBeNull();
  });

  it('reports a language the move had to leave behind, and the one it landed on', async () => {
    const tree = await finder();
    const jump = languageJump(tree, 'spring-cli-rest-kotlin', 'fullstack-spring');
    expect(jump?.shape.id).toBe('fullstack');
    expect(jump?.from.label).toBe('Kotlin');
    expect(jump?.to.label).toBe('Java');
    expect(languageJump(tree, 'web-components', 'quarkus-cli')?.to.id).toBe('java@jvm');
  });

  it('reports no jump where the language came along, or was picked', async () => {
    const tree = await finder();
    // The new shape has Java: whichever preset under it was reached,
    // a Java one or not, it was reached by choice.
    expect(languageJump(tree, 'spring-rest', 'fullstack-spring')).toBeNull();
    expect(languageJump(tree, 'spring-rest', 'fullstack-go')).toBeNull();
    // Within a shape a language only changes when someone changes it.
    expect(languageJump(tree, 'spring-rest-kotlin', 'go-http')).toBeNull();
    // And nothing can be said about a preset the finder cannot place.
    expect(languageJump(tree, 'nonsense', 'fullstack')).toBeNull();
    expect(languageJump(tree, undefined, 'fullstack')).toBeNull();
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
