/**
 * What a keel project is, read back off its manifest — the page's
 * read-only Project step, in words rather than tags.
 *
 * The claim worth guarding is that the reading runs the drill-down
 * backwards and lands where `keel new` started: every preset the
 * finder offers, on every setting of its dials, reads back as itself,
 * with the build system and module layout it was scaffolded on — and
 * every product reads back from the services its root records. A
 * preset reading back as another would be the page naming the wrong
 * stack for a project it was just pointed at. Pure over the registry,
 * so the whole catalog is swept without a scaffold; the handler's
 * half (the field on `keel.project-status`, off a real manifest) is
 * `handlers/project-status.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import type { ServiceRef } from '../../../src/domain/contract/manifest.js';
import { projectProfile, serviceLabel } from '../../../src/domain/core/profile.js';
import { assemblableStacks, shippedRegistry } from '../../../src/domain/core/registry.js';
import { stackTagsFor } from '../../../src/domain/core/stacks.js';

const singles = assemblableStacks(shippedRegistry).filter((stack) => !stack.services);
const products = assemblableStacks(shippedRegistry).filter((stack) => stack.services);

/** A fact's value by its label, or undefined where the profile has no such line. */
const fact = (profile: ReturnType<typeof projectProfile>, label: string): string | undefined =>
  profile.facts.find((line) => line.label === label)?.value;

describe('projectProfile', () => {
  it('reads every single preset back as itself, on every setting of its dials', () => {
    expect(singles.length).toBeGreaterThan(20);
    for (const stack of singles) {
      for (const build of stack.buildSystems ?? [null]) {
        for (const layout of stack.moduleLayouts ?? [null]) {
          const tags = stackTagsFor(stack, build?.tag ?? null, layout?.tag ?? null);
          const profile = projectProfile(shippedRegistry, tags, []);
          const cell = `${stack.id} ${build?.id ?? '-'} ${layout?.id ?? '-'}`;
          expect(profile.preset, cell).toBe(stack.id);
          expect(fact(profile, 'Build system'), cell).toBe(build?.label.split(' — ')[0]);
          if (layout !== null) expect(fact(profile, 'Module layout'), cell).toBe(layout.id);
          // Words, never a tag: nothing on a line reads `lang.java`.
          for (const line of profile.facts) {
            expect(line.value, `${cell} ${line.label}`).not.toMatch(/^[a-z]+\.[a-z-]+$/);
          }
        }
      }
    }
  });

  it('says what a project is in the order the wizard asked it', () => {
    const stack = singles.find((candidate) => candidate.id === 'quarkus-cli-rest');
    if (stack === undefined) throw new Error('no quarkus-cli-rest');
    const tags = stackTagsFor(stack, 'pkg.maven', 'layout.modulith');
    expect(projectProfile(shippedRegistry, tags, [])).toEqual({
      preset: 'quarkus-cli-rest',
      facts: [
        { label: 'Building', value: 'Backend or tool' },
        { label: 'Language', value: 'Java' },
        { label: 'Framework', value: 'Quarkus' },
        { label: 'Adapters', value: 'CLI + HTTP server' },
        { label: 'Build system', value: 'Maven' },
        { label: 'Module layout', value: 'modulith' },
      ],
    });
  });

  it('reads every product back from the services its root records', () => {
    expect(products.length).toBeGreaterThan(0);
    for (const product of products) {
      const services: ServiceRef[] = (product.services ?? []).map((service) => ({
        path: service.path,
        stack: service.stack,
      }));
      const profile = projectProfile(shippedRegistry, ['agentic.harness'], services);
      expect(profile.preset, product.id).toBe(product.id);
      expect(fact(profile, 'Building'), product.id).toBe('Fullstack');
      // A product's dials are its services', said service by service.
      expect(fact(profile, 'Build system'), product.id).toBeUndefined();
    }
  });

  it('names no preset where the tags lead to none, and still says what they do say', () => {
    // A language no preset is written in: the drill-down answers read
    // back, and no preset is claimed for them.
    const unplaced = projectProfile(shippedRegistry, ['lang.cobol', 'arch.cli', 'pkg.maven'], []);
    expect(unplaced.preset).toBeNull();
    expect(fact(unplaced, 'Adapters')).toBe('CLI');
    expect(fact(unplaced, 'Build system')).toBe('Maven');
    // No language at all, and services no product has: nothing to place.
    expect(projectProfile(shippedRegistry, ['arch.cli'], [])).toEqual({
      preset: null,
      facts: [],
    });
    expect(projectProfile(shippedRegistry, [], [{ path: 'api', stack: 'go-http' }])).toEqual({
      preset: null,
      facts: [],
    });
  });
});

describe('serviceLabel', () => {
  it('names a service by its preset and the build system recorded for it', () => {
    expect(serviceLabel({ path: 'backend', stack: 'quarkus-rest', buildSystem: 'gradle' })).toBe(
      'quarkus-rest · Gradle',
    );
    expect(serviceLabel({ path: 'backend', stack: 'go-http' })).toBe('go-http');
    expect(serviceLabel({ path: 'backend', stack: 'x', buildSystem: 'bazel' })).toBe('x · bazel');
  });
});
