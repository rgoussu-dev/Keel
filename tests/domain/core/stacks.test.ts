/**
 * Unit tests for the stack registry's summary view, `listStacks` —
 * what `keel new --list` renders. The registry's install-time
 * behavior (resolving a stack, its build-system/module-layout
 * choices) is covered where it is exercised, in
 * `tests/domain/core/handlers/new-project.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { BUILD_SYSTEMS, getBuildSystem, STACKS } from '../../../src/domain/core/stacks.js';
import { listStackIds, listStacks, shippedRegistry } from '../../../src/domain/core/registry.js';
import {
  getModuleLayoutOption,
  MODULE_LAYOUTS,
} from '../../../src/domain/core/adapters/module-layout.js';

describe('listStacks', () => {
  it('lists every registered stack id, sorted, each with a non-empty description', () => {
    const summaries = listStacks(shippedRegistry);
    expect(summaries.map((s) => s.id)).toEqual(listStackIds(shippedRegistry));
    for (const summary of summaries) {
      expect(summary.description.length, `${summary.id} has an empty description`).toBeGreaterThan(
        0,
      );
      expect(summary.description).toBe(STACKS[summary.id]?.description);
    }
  });

  it('includes the composable-entrypoint combo stacks', () => {
    const ids = listStacks(shippedRegistry).map((s) => s.id);
    for (const id of [
      'quarkus-cli-rest',
      'spring-cli-rest',
      'micronaut-cli-rest',
      'go-cli-http',
      'rust-cli-http',
      'ts-cli-http',
    ]) {
      expect(ids, `missing ${id}`).toContain(id);
    }
  });
});

describe('the dial registries', () => {
  it('resolves every build system under its own id, to the same option object', () => {
    for (const [id, option] of Object.entries(BUILD_SYSTEMS)) {
      expect(option.id).toBe(id);
      expect(getBuildSystem(id)).toBe(option);
    }
    expect(Object.keys(BUILD_SYSTEMS).sort()).toEqual(['gradle', 'maven', 'npm', 'pnpm']);
  });

  it('resolves every module layout under its own id, to the same option object', () => {
    for (const option of MODULE_LAYOUTS) {
      expect(getModuleLayoutOption(option.id)).toBe(option);
    }
    expect(MODULE_LAYOUTS.map((o) => o.id)).toEqual(['basic', 'modulith']);
  });

  it('returns null for an id no option bears', () => {
    expect(getBuildSystem('bazel')).toBeNull();
    expect(getModuleLayoutOption('microservices')).toBeNull();
  });
});
