import { describe, expect, it } from 'vitest';
import {
  checkSuppliedAnswer,
  resolveAdapterAnswers,
  resolveAnswer,
} from '../../../src/domain/core/answers.js';
import type { Asker, Prompt } from '../../../src/domain/contract/ports/prompt.js';
import type { Adapter, Contribution, Question } from '../../../src/domain/contract/composition.js';
import { DomainError } from '../../../src/domain/kernel/result.js';

const noContribution: Contribution = {};

const asker: Asker = { kind: 'adapter', id: 'test/adapter' };

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
    const r = await resolveAnswer(
      q,
      { targets: 'linux-arm64' },
      'interactive',
      failingPrompt,
      asker,
    );
    expect(r).toEqual({ value: 'linux-arm64', persist: false });
  });

  it('returns default in non-interactive mode (sticky → persist)', async () => {
    const q = stickyQ('targets', 'linux-amd64');
    const r = await resolveAnswer(q, {}, 'non-interactive', failingPrompt, asker);
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
    const r = await resolveAnswer(q, {}, 'non-interactive', failingPrompt, asker);
    expect(r).toEqual({ value: 'patch', persist: false });
  });

  it('prompts when interactive and no stored answer (sticky → persist)', async () => {
    const q = stickyQ('targets', 'linux-amd64');
    const r = await resolveAnswer(q, {}, 'interactive', scripted('darwin-arm64'), asker);
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
    const r = await resolveAnswer(q, { note: 'old' }, 'interactive', scripted('new'), asker);
    expect(r).toEqual({ value: 'new', persist: false });
  });

  it('refuses a supplied value outside `choices` as a coded answer error', async () => {
    const q = stickyQ('backend', 'xray', 'xray', 'datadog');
    const refusal: unknown = await resolveAnswer(
      q,
      {},
      'interactive',
      scripted('honeycomb'),
      asker,
    ).catch((thrown: unknown) => thrown);
    // A DomainError is what the mediator puts back on the Err rail;
    // as a plain Error, a form posting a stale value got a 500.
    expect(refusal).toBeInstanceOf(DomainError);
    expect(refusal).toMatchObject({ code: 'keel.invalid-answer' });
    expect((refusal as DomainError).message).toBe(
      "'honeycomb' is not a choice for test/adapter:backend; choices: xray, datadog",
    );
  });

  it('keeps a default outside its own `choices` a bug, not a refusal', async () => {
    const q = stickyQ('backend', 'honeycomb', 'xray', 'datadog');
    const bug: unknown = await resolveAnswer(q, {}, 'non-interactive', failingPrompt, asker).catch(
      (thrown: unknown) => thrown,
    );
    expect(bug).toBeInstanceOf(Error);
    expect(bug).not.toBeInstanceOf(DomainError);
    expect((bug as Error).message).toMatch(/invalid value 'honeycomb'/);
  });

  it('keeps a bad default a bug when a prompt hands it back unchanged', async () => {
    // The preview's prompt answers an untouched field with the
    // question's default; that default is still the adapter's to fix.
    const q = stickyQ('backend', 'honeycomb', 'xray', 'datadog');
    const bug: unknown = await resolveAnswer(
      q,
      {},
      'interactive',
      scripted('honeycomb'),
      asker,
    ).catch((thrown: unknown) => thrown);
    expect(bug).toBeInstanceOf(Error);
    expect(bug).not.toBeInstanceOf(DomainError);
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

  it('attributes every question to the adapter that declared it', async () => {
    const recorded: Asker[] = [];
    const recording: Prompt = {
      ask: async (_question, who) => {
        recorded.push(who);
        return 'x';
      },
    };
    const a = adapter([
      { id: 'one', prompt: 'one', doc: '', default: 'd', memory: 'repeat' },
      { id: 'two', prompt: 'two', doc: '', default: 'd', memory: 'repeat' },
    ]);
    await resolveAdapterAnswers(a, {}, 'interactive', recording);
    expect(recorded).toEqual([
      { kind: 'adapter', id: 'test/adapter' },
      { kind: 'adapter', id: 'test/adapter' },
    ]);
  });

  it('rejects duplicate question ids on the same adapter', async () => {
    const a = adapter([stickyQ('x', '1'), stickyQ('x', '2')]);
    await expect(resolveAdapterAnswers(a, {}, 'non-interactive', failingPrompt)).rejects.toThrow(
      /duplicate question id/,
    );
  });
});

describe('a multi-select answer', () => {
  // A set, encoded as one string: each value it names is held to the
  // choices, not the joined string.
  const pick = (def: string): Question => ({
    id: 'targets',
    prompt: 'targets',
    doc: '',
    kind: 'multi-select',
    choices: ['linux', 'darwin', 'windows'].map((c) => ({ value: c, label: c, doc: '' })),
    default: def,
    memory: 'sticky',
  });

  it('takes a legal selection of several choices', async () => {
    const r = await resolveAnswer(pick(''), {}, 'interactive', scripted('linux,darwin'), asker);
    expect(r).toEqual({ value: 'linux,darwin', persist: true });
  });

  it('takes the empty selection, its legitimate "none", as a default', async () => {
    const r = await resolveAnswer(pick(''), {}, 'non-interactive', failingPrompt, asker);
    expect(r).toEqual({ value: '', persist: true });
  });

  it('refuses a selection naming a value outside the choices, naming only that one', async () => {
    const refusal: unknown = await resolveAnswer(
      pick(''),
      {},
      'interactive',
      scripted('linux,plan9'),
      asker,
    ).catch((thrown: unknown) => thrown);
    expect(refusal).toBeInstanceOf(DomainError);
    expect(refusal).toMatchObject({ code: 'keel.invalid-answer' });
    expect((refusal as DomainError).message).toBe(
      "'plan9' is not a choice for test/adapter:targets; choices: linux, darwin, windows",
    );
  });
});

describe('checkSuppliedAnswer', () => {
  const provider = stickyQ('provider', 'github-actions', 'github-actions', 'gitlab-ci');

  it('takes a supplied value inside its choices', () => {
    expect(() => checkSuppliedAnswer(provider, 'gitlab-ci', 'ci/jvm-pipeline')).not.toThrow();
  });

  it('refuses one outside them, under the key it was supplied as', () => {
    // The key a `--set` names, which may be a sibling the adapter
    // borrows from rather than the adapter itself.
    let refusal: unknown;
    try {
      checkSuppliedAnswer(provider, 'bitbucket', 'distribution/jvm-container');
    } catch (thrown: unknown) {
      refusal = thrown;
    }
    expect(refusal).toBeInstanceOf(DomainError);
    expect(refusal).toMatchObject({
      code: 'keel.invalid-answer',
      message:
        "'bitbucket' is not a choice for distribution/jvm-container:provider; choices: github-actions, gitlab-ci",
    });
  });
});
