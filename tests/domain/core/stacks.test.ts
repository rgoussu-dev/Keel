/**
 * Unit tests for the stack registry's summary view, `listStacks` —
 * what `keel new --list` renders. The registry's install-time
 * behavior (resolving a stack, its build-system/module-layout
 * choices) is covered where it is exercised, in
 * `tests/domain/core/handlers/new-project.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { listStackIds, listStacks, STACKS } from '../../../src/domain/core/stacks.js';

describe('listStacks', () => {
  it('lists every registered stack id, sorted, each with a non-empty description', () => {
    const summaries = listStacks();
    expect(summaries.map((s) => s.id)).toEqual(listStackIds());
    for (const summary of summaries) {
      expect(summary.description.length, `${summary.id} has an empty description`).toBeGreaterThan(
        0,
      );
      expect(summary.description).toBe(STACKS[summary.id]?.description);
    }
  });

  it('includes the composable-entrypoint combo stacks', () => {
    const ids = listStacks().map((s) => s.id);
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
