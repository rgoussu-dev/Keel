/**
 * The recording prompt and the answer bindings.
 *
 * `keel.preview`'s own suite covers this end to end through the
 * engine, which is where the adapter bindings are proved. What is
 * left here is the branch the engine reaches only through the
 * composite path: a **stack-level** dial, whose answer belongs to a
 * command field rather than to `manifest.answers`, and whose
 * destination is decided by the question id the install handler gave
 * it. Those ids are exported precisely so this mapping has one
 * source, and this is the test that keeps the two in step.
 */

import { describe, expect, it } from 'vitest';
import type { Question } from '../../../src/domain/contract/composition.js';
import type { Asker } from '../../../src/domain/contract/ports/prompt.js';
import { bindingFor, recordingPrompt } from '../../../src/domain/core/preview.js';
import {
  BUILD_SYSTEM_QUESTION_ID,
  LAYOUT_QUESTION_ID,
  MODULE_LAYOUT_QUESTION_ID,
} from '../../../src/domain/core/handlers/new-project.js';

const question = (id: string, fallback = 'default'): Question => ({
  id,
  prompt: id,
  doc: '',
  default: fallback,
  memory: 'repeat',
});

const stack: Asker = { kind: 'stack', id: 'fullstack' };
const adapter: Asker = { kind: 'adapter', id: 'persistence/engine' };
const toolchain: Asker = { kind: 'toolchain', id: 'toolchain' };

describe('bindingFor', () => {
  it('sends an adapter’s answer to its sticky memory', () => {
    expect(bindingFor(question('engine'), adapter)).toEqual({
      kind: 'answer',
      adapter: 'persistence/engine',
      question: 'engine',
    });
  });

  it('sends each stack-level dial to its command field', () => {
    expect(bindingFor(question(LAYOUT_QUESTION_ID), stack)).toEqual({ kind: 'layout' });
    expect(bindingFor(question(MODULE_LAYOUT_QUESTION_ID), stack)).toEqual({
      kind: 'moduleLayout',
    });
    expect(bindingFor(question(BUILD_SYSTEM_QUESTION_ID), stack)).toEqual({ kind: 'buildSystem' });
  });

  it('keeps the service path of a composite build-system dial', () => {
    expect(bindingFor(question(`${BUILD_SYSTEM_QUESTION_ID}:backend`), stack)).toEqual({
      kind: 'buildSystem',
      service: 'backend',
    });
  });

  it('falls back to an answer binding for a dial it does not recognise', () => {
    // A stack-level question added without teaching this mapping
    // about it: better a visible field whose answer round trips
    // harmlessly than a question silently dropped from the form.
    expect(bindingFor(question('somethingNew'), stack)).toEqual({
      kind: 'answer',
      adapter: 'fullstack',
      question: 'somethingNew',
    });
  });

  it('binds the provisioning dial under its own context', () => {
    expect(bindingFor(question('manager'), toolchain)).toEqual({
      kind: 'answer',
      adapter: 'toolchain',
      question: 'manager',
    });
  });
});

describe('recordingPrompt', () => {
  it('answers from the supplied map and records what it was asked', async () => {
    const recorder = recordingPrompt({ 'persistence/engine': { engine: 'mariadb' } });
    expect(await recorder.prompt.ask(question('engine', 'postgres'), adapter)).toBe('mariadb');
    expect(recorder.recorded).toEqual([
      expect.objectContaining({ id: 'engine', value: 'mariadb', default: 'postgres' }),
    ]);
  });

  it('falls back to the question’s default', async () => {
    const recorder = recordingPrompt({});
    expect(await recorder.prompt.ask(question('engine', 'postgres'), adapter)).toBe('postgres');
    expect(recorder.recorded[0]?.value).toBe('postgres');
  });

  it('never looks up a stack-level dial in the answer map', async () => {
    // Its value arrives as a command field, so by the time the
    // question is asked the handler has already applied the caller's
    // choice — reading the map here would let a stale answer override
    // it.
    const recorder = recordingPrompt({ fullstack: { layout: 'polyrepo' } });
    expect(await recorder.prompt.ask(question(LAYOUT_QUESTION_ID, 'monorepo'), stack)).toBe(
      'monorepo',
    );
  });

  it('keeps each recorder’s questions to itself', async () => {
    const first = recordingPrompt({});
    const second = recordingPrompt({});
    await first.prompt.ask(question('a'), adapter);
    expect(second.recorded).toEqual([]);
  });
});
