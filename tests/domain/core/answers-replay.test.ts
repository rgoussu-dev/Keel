import { describe, expect, it } from 'vitest';
import type { Adapter } from '../../../src/domain/contract/composition.js';
import { resolveAdapterAnswers } from '../../../src/domain/core/answers.js';
import { rejectingPrompt } from '../../../src/infrastructure/prompt/fake.js';

const adapter: Adapter = {
  id: 'acme/repeat',
  vertical: 'acme',
  covers: [],
  predicate: {},
  questions: [
    {
      id: 'destination',
      prompt: 'Destination',
      doc: '',
      default: 'default-target',
      memory: 'repeat',
    },
  ],
  contribute: () => ({}),
};

describe('recorded answers during harness replay', () => {
  it('uses defaults for newly introduced repeat questions absent from the snapshot', async () => {
    const result = await resolveAdapterAnswers(
      adapter,
      {},
      'non-interactive',
      rejectingPrompt,
      true,
    );
    expect(result).toEqual({ answers: { destination: 'default-target' }, updates: {} });
  });

  it('keeps ordinary noninteractive repeat resolution independent from recorded values', async () => {
    const result = await resolveAdapterAnswers(
      adapter,
      { destination: 'warehouse' },
      'non-interactive',
      rejectingPrompt,
    );
    expect(result).toEqual({ answers: { destination: 'default-target' }, updates: {} });
  });
});
