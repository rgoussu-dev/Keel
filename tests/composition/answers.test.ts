import { describe, expect, it } from 'vitest';
import {
  resolveAdapterAnswers,
  resolveAnswer,
  type Prompt,
} from '../../src/composition/answers.js';
import type { Adapter, Contribution, Question } from '../../src/domain/contract/composition.js';

const noContribution: Contribution = {};

const scripted = (...replies: string[]): Prompt => {
  let i = 0;
  return {
    ask: async () => {
      const r = replies[i++];
      if (r === undefined) throw new Error('scripted prompt exhausted');
      return r;
    },
  };
};

const failingPrompt: Prompt = {
  ask: async () => {
    throw new Error('prompt should not have been called');
  },
};

const stickyQ = (id: string, def: string, ...choices: string[]): Question =>
  choices.length > 0
    ? {
        id,
        prompt: id,
        doc: '',
        default: def,
        memory: 'sticky',
        choices: choices.map((c) => ({ value: c, label: c, doc: '' })),
      }
    : { id, prompt: id, doc: '', default: def, memory: 'sticky' };

describe('resolveAnswer', () => {
  it('returns sticky stored answer without prompting', async () => {
    const q = stickyQ('targets', 'linux-amd64');
    const r = await resolveAnswer(q, { targets: 'linux-arm64' }, 'interactive', failingPrompt);
    expect(r).toEqual({ value: 'linux-arm64', persist: false });
  });

  it('returns default in non-interactive mode (sticky → persist)', async () => {
    const q = stickyQ('targets', 'linux-amd64');
    const r = await resolveAnswer(q, {}, 'non-interactive', failingPrompt);
    expect(r).toEqual({ value: 'linux-amd64', persist: true });
  });

  it('returns default in non-interactive mode (repeat → no persist)', async () => {
    const q: Question = {
      id: 'kind',
      prompt: 'kind',
      doc: '',
      default: 'patch',
      memory: 'repeat',
    };
    const r = await resolveAnswer(q, {}, 'non-interactive', failingPrompt);
    expect(r).toEqual({ value: 'patch', persist: false });
  });

  it('prompts when interactive and no stored answer (sticky → persist)', async () => {
    const q = stickyQ('targets', 'linux-amd64');
    const r = await resolveAnswer(q, {}, 'interactive', scripted('darwin-arm64'));
    expect(r).toEqual({ value: 'darwin-arm64', persist: true });
  });

  it('prompts every time for repeat questions even if a stored value exists', async () => {
    const q: Question = {
      id: 'note',
      prompt: 'note',
      doc: '',
      default: 'x',
      memory: 'repeat',
    };
    const r = await resolveAnswer(q, { note: 'old' }, 'interactive', scripted('new'));
    expect(r).toEqual({ value: 'new', persist: false });
  });

  it('rejects values not in `choices`', async () => {
    const q = stickyQ('backend', 'xray', 'xray', 'datadog');
    await expect(resolveAnswer(q, {}, 'interactive', scripted('honeycomb'))).rejects.toThrow(
      /invalid value/,
    );
  });
});

describe('resolveAdapterAnswers', () => {
  const adapter = (questions: readonly Question[]): Adapter => ({
    id: 'test/adapter',
    vertical: 'test',
    covers: [],
    predicate: {},
    questions,
    contribute: () => noContribution,
  });

  it('aggregates resolved values and update set', async () => {
    const a = adapter([
      stickyQ('targets', 'linux-amd64'),
      { id: 'note', prompt: 'note', doc: '', default: 'd', memory: 'repeat' },
    ]);
    const r = await resolveAdapterAnswers(
      a,
      { targets: 'linux-arm64' },
      'interactive',
      scripted('hi'),
    );
    expect(r.answers).toEqual({ targets: 'linux-arm64', note: 'hi' });
    expect(r.updates).toEqual({}); // sticky reused, repeat never persists
  });

  it('records updates only for newly-asked sticky questions', async () => {
    const a = adapter([stickyQ('targets', 'linux-amd64')]);
    const r = await resolveAdapterAnswers(a, {}, 'interactive', scripted('darwin-arm64'));
    expect(r.answers).toEqual({ targets: 'darwin-arm64' });
    expect(r.updates).toEqual({ targets: 'darwin-arm64' });
  });

  it('rejects duplicate question ids on the same adapter', async () => {
    const a = adapter([stickyQ('x', '1'), stickyQ('x', '2')]);
    await expect(resolveAdapterAnswers(a, {}, 'non-interactive', failingPrompt)).rejects.toThrow(
      /duplicate question id/,
    );
  });
});
