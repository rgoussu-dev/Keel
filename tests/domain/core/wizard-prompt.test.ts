/**
 * `WizardPrompt` in isolation: the replay/divergence/edit logic the
 * `keel new` review loop depends on, tested against a bare `Prompt`
 * fake rather than through the handler — the port is the seam.
 */

import { describe, expect, it } from 'vitest';
import type { Question } from '../../../src/domain/contract/composition.js';
import type { Prompt } from '../../../src/domain/contract/ports/prompt.js';
import { WizardPrompt } from '../../../src/domain/core/wizard-prompt.js';

/** A minimal, valid `Question` for a given id — content beyond `id` doesn't matter here. */
function question(id: string): Question {
  return { id, prompt: id, doc: id, default: 'default', memory: 'repeat' };
}

/** Records every id it was asked, in order, and answers from a fixed map. */
class CountingPrompt implements Prompt {
  readonly calls: string[] = [];
  constructor(private readonly answers: Record<string, string>) {}

  ask(q: Question): Promise<string> {
    this.calls.push(q.id);
    const value = this.answers[q.id];
    if (value === undefined) throw new Error(`no answer for '${q.id}'`);
    return Promise.resolve(value);
  }
}

describe('WizardPrompt', () => {
  it('replays a repeated attempt verbatim without touching the underlying prompt', async () => {
    const underlying = new CountingPrompt({ a: '1', b: '2', c: '3' });
    const wizard = new WizardPrompt(underlying);

    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('b'));
    await wizard.ask(question('c'));
    expect(underlying.calls).toEqual(['a', 'b', 'c']);

    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('b'));
    await wizard.ask(question('c'));
    expect(underlying.calls).toEqual(['a', 'b', 'c']);
    expect(wizard.recorded.map((r) => r.value)).toEqual(['1', '2', '3']);
  });

  it('re-asks the edited question and every question after it', async () => {
    const underlying = new CountingPrompt({ a: '1', b: '2', c: '3' });
    const wizard = new WizardPrompt(underlying);

    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('b'));
    await wizard.ask(question('c'));

    wizard.prepareEdit(1);
    wizard.beginAttempt();
    await wizard.ask(question('a'));
    const b = await wizard.ask(question('b'));
    const c = await wizard.ask(question('c'));

    expect(underlying.calls).toEqual(['a', 'b', 'c', 'b', 'c']);
    expect(b).toBe('2');
    expect(c).toBe('3');
    expect(wizard.recorded.map((r) => r.value)).toEqual(['1', '2', '3']);
  });

  it('stops replaying once the actual question no longer matches what was recorded', async () => {
    const underlying = new CountingPrompt({ a: '1', b: '2', c: '3', d: '4', e: '5' });
    const wizard = new WizardPrompt(underlying);

    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('b'));
    await wizard.ask(question('c'));

    // No edit requested, but position 1 now asks a different question —
    // e.g. an earlier answer changed which adapters apply from here on.
    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('d'));
    await wizard.ask(question('e'));

    expect(underlying.calls).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(wizard.recorded.map((r) => r.question.id)).toEqual(['a', 'd', 'e']);
  });

  it('askDirect bypasses recording and the positional cursor', async () => {
    const underlying = new CountingPrompt({ a: '1', b: '2', review: 'proceed' });
    const wizard = new WizardPrompt(underlying);

    wizard.beginAttempt();
    await wizard.ask(question('a'));
    const reviewAnswer = await wizard.askDirect(question('review'));
    await wizard.ask(question('b'));

    expect(reviewAnswer).toBe('proceed');
    expect(wizard.recorded.map((r) => r.question.id)).toEqual(['a', 'b']);

    // Replaying the next attempt still lines 'a' and 'b' up correctly —
    // askDirect never consumed a position in the staged sequence.
    wizard.beginAttempt();
    await wizard.ask(question('a'));
    await wizard.ask(question('b'));
    expect(underlying.calls).toEqual(['a', 'review', 'b']);
  });
});
