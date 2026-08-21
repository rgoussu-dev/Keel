/**
 * The guard on the fence around machine-maintained lists.
 *
 * Two adapters rewrite emitted JVM source by matching a region of it
 * — Spring's `@ComponentScan(basePackages = …)` and Micronaut's
 * `@Import(packages = …)`. Once `code-style` runs a Java formatter
 * over the scaffold, that stops working unless the region is fenced:
 * prince-of-space collapses the whole annotation onto one line, the
 * anchor moves, and `keel add module` fails with "could not find the
 * … list". That is not hypothetical — it is what went red across
 * every Java Spring and Micronaut `add-module` cell the first time
 * the vertical ran on CI.
 *
 * Three things have to agree for it to keep working, and each is
 * asserted here rather than left to a JVM build to discover:
 *
 *   1. every template carrying an anchor ships the fence;
 *   2. `code-style/jvm-format` emits `toggleOffOn()`, or Spotless
 *      ignores the markers entirely and the fence is decoration;
 *   3. the adapters re-emit the fence when they rewrite, and do not
 *      stack a second copy of it on each run.
 *
 * The Kotlin templates are fenced too even though ktlint does not
 * reflow them: the warning inside the fence is for the reader, and it
 * would be strange for the same list to carry it in Java and not in
 * Kotlin.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  fenceClose,
  fenceOpen,
  FENCE_OFF,
  FENCE_ON,
  FENCE_WARNING,
} from '../../../../src/domain/core/adapters/jvm-context.js';
import {
  renderGradleSpotlessBlock,
  addSpotlessToPom,
} from '../../../../src/domain/core/adapters/jvm-format.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const skeletonRoot = path.join(repoRoot, 'assets', 'composition', 'walking-skeleton');

/** The anchor line both adapters match on. */
const ANCHOR = /^[ \t]*(?:basePackages|packages) = /m;

/** Every template carrying a machine-maintained list. */
function templatesWithAnchor(): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.ejs') && ANCHOR.test(fs.readFileSync(full, 'utf8'))) {
        out.push(full);
      }
    }
  };
  walk(skeletonRoot);
  return out.sort();
}

describe('the fence around machine-maintained lists', () => {
  const templates = templatesWithAnchor();

  it('finds the templates it is meant to guard', () => {
    // A path change that emptied this list would make every
    // assertion below vacuously true.
    expect(templates.length).toBeGreaterThanOrEqual(12);
  });

  it('fences the anchor in every template that carries one', () => {
    for (const file of templates) {
      const text = fs.readFileSync(file, 'utf8');
      const rel = path.relative(repoRoot, file);
      expect(text, `${rel}: no ${FENCE_OFF}`).toContain(FENCE_OFF);
      expect(text, `${rel}: no ${FENCE_ON}`).toContain(FENCE_ON);

      const lines = text.split('\n');
      const anchor = lines.findIndex((l) => ANCHOR.test(l));
      const off = lines.findIndex((l) => l.includes(FENCE_OFF));
      const on = lines.findIndex((l) => l.includes(FENCE_ON));
      expect(off, `${rel}: ${FENCE_OFF} must precede the anchor`).toBeLessThan(anchor);
      expect(on, `${rel}: ${FENCE_ON} must follow the anchor`).toBeGreaterThan(anchor);
    }
  });

  it('carries the do-not-edit warning inside every fence', () => {
    for (const file of templates) {
      const text = fs.readFileSync(file, 'utf8');
      expect(text, `${path.relative(repoRoot, file)}: no warning`).toContain(FENCE_WARNING[0]);
    }
  });

  it('indents the fence to match its anchor, so the region reads as one block', () => {
    for (const file of templates) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      const anchor = lines.find((l) => ANCHOR.test(l)) ?? '';
      const indent = /^[ \t]*/.exec(anchor)?.[0] ?? '';
      expect(lines, path.relative(repoRoot, file)).toContain(`${indent}// ${FENCE_OFF}`);
      expect(lines, path.relative(repoRoot, file)).toContain(fenceClose(indent));
    }
  });
});

describe('the Spotless config that honours the fence', () => {
  const tagSets = [
    ['lang.java', 'runtime.jvm', 'pkg.gradle'],
    ['lang.kotlin', 'runtime.jvm', 'pkg.gradle'],
  ];

  it('turns toggleOffOn on for Gradle, or the markers are decoration', () => {
    for (const tags of tagSets) {
      expect(renderGradleSpotlessBlock(tags), tags.join(',')).toContain('toggleOffOn()');
    }
  });

  it('turns toggleOffOn on for Maven too', () => {
    const pom =
      '<project><build><pluginManagement><plugins></plugins></pluginManagement></build></project>';
    for (const tags of [
      ['lang.java', 'runtime.jvm', 'pkg.maven'],
      ['lang.kotlin', 'runtime.jvm', 'pkg.maven'],
    ]) {
      expect(addSpotlessToPom(pom, tags), tags.join(',')).toContain('<toggleOffOn/>');
    }
  });
});

describe('fenceOpen / fenceClose', () => {
  it('opens with the marker and closes with it', () => {
    const opened = fenceOpen('    ', ['note']);
    expect(opened[0]).toBe(`    // ${FENCE_OFF}`);
    expect(fenceClose('    ')).toBe(`    // ${FENCE_ON}`);
  });

  it('puts the warning before the caller’s own note', () => {
    const opened = fenceOpen('', ['the note']).join('\n');
    expect(opened.indexOf(FENCE_WARNING[0] ?? '')).toBeLessThan(opened.indexOf('the note'));
  });

  it('comments every line, so the fence is valid in Java and Kotlin alike', () => {
    for (const line of fenceOpen('  ', ['a note'])) {
      expect(line.trimStart().startsWith('//'), line).toBe(true);
    }
  });
});
