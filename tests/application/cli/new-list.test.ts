/**
 * `keel new --list` through the real commander program: every stack,
 * one marked ◻ where keel's CI does not build it at its default
 * setting (roadmap T.2e).
 *
 * The list is wired as the composition root wires it — the registry's
 * stacks, and each one's tier read by `defaultTier` over a
 * `SupportSource` — so a case can hand in its own facts.
 */

import { describe, expect, it } from 'vitest';
import { buildProgram } from '../../../src/application/cli/contract/program.js';
import { defaultTier } from '../../../src/domain/core/dials.js';
import { listStacks, shippedRegistry, shippedSupport } from '../../../src/domain/core/registry.js';
import type { SupportSource } from '../../../src/domain/core/support-tier.js';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { installMediator } from '../../support/factory.js';

/** What `keel new --list` prints over `support`, or with no tier read at all. */
async function list(support: SupportSource | null): Promise<readonly string[]> {
  const logger = new FakeLogger();
  await buildProgram({
    mediator: installMediator(),
    logger,
    version: 'test',
    availableStacks: listStacks(shippedRegistry),
    ...(support === null
      ? {}
      : { defaultTier: (stack: string) => defaultTier(shippedRegistry, support, stack) }),
    availableVerticals: [],
    serveUi: () => {
      throw new Error('unexpected UI start');
    },
  }).parseAsync(['new', '--list'], { from: 'user' });
  return logger.messages('info');
}

/** The ids `lines` mark ◻. */
const marked = (lines: readonly string[]): readonly string[] =>
  lines.flatMap((line) => /^ {2}(\S+) ◻ /.exec(line)?.slice(1) ?? []);

describe('keel new --list', () => {
  it('marks the presets best-effort at their default setting, and says what the mark means', async () => {
    const lines = await list(shippedSupport);
    expect(marked(lines)).toEqual([
      'fullstack',
      'fullstack-cli',
      'fullstack-cli-kotlin',
      'fullstack-go-cli',
      'fullstack-kotlin',
      'fullstack-micronaut',
      'fullstack-micronaut-cli',
      'fullstack-micronaut-cli-kotlin',
      'fullstack-micronaut-kotlin',
      'fullstack-rust-cli',
      'fullstack-spring',
      'fullstack-spring-cli',
      'fullstack-spring-cli-kotlin',
      'fullstack-spring-kotlin',
      'fullstack-ts',
      'fullstack-ts-cli',
      'micronaut-cli-rest-kotlin',
      'quarkus-cli-rest-kotlin',
      'spring-cli-rest',
      'ts-cli-http',
    ]);
    expect(lines.some((line) => /^ {2}go-cli +Go CLI/.test(line))).toBe(true);
    expect(lines.at(-1)).toMatch(/^◻ best-effort at its default setting: .*no CI job builds it/);
  });

  it('reads the tier from the source it is wired with', async () => {
    const lines = await list({ ...shippedSupport, facts: { singles: [], products: [] } });
    expect(marked(lines)).toHaveLength(listStacks(shippedRegistry).length);
  });

  it('marks nothing, and says nothing of a mark, where no stack has a tier', async () => {
    for (const support of [null, { ...shippedSupport, stacks: [] }]) {
      const lines = await list(support);
      expect(marked(lines)).toEqual([]);
      expect(lines.join('\n')).not.toContain('◻');
      expect(lines).toHaveLength(1 + listStacks(shippedRegistry).length);
    }
  });
});
