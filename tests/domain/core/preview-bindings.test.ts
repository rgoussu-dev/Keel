/**
 * The recording prompt and the answer bindings.
 *
 * The prompt reads an adapter's answer by the install's own precedence
 * (`answerUnder` over `answerKeys`, in `answers.ts`), so its cases are
 * where a preview and an install could first disagree: a sibling's
 * key, two keys for one question, a value outside the choices.
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

/** An adapter's question: sticky, as every one keel ships is. */
const sticky = (id: string, fallback = 'default', more: Partial<Question> = {}): Question => ({
  ...question(id, fallback),
  memory: 'sticky',
  ...more,
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
    expect(await recorder.prompt.ask(sticky('engine', 'postgres'), adapter)).toBe('mariadb');
    expect(recorder.recorded).toEqual([
      expect.objectContaining({ id: 'engine', value: 'mariadb', default: 'postgres' }),
    ]);
    expect(recorder.reads).toEqual([
      { adapter: 'persistence/engine', question: 'engine', key: 'persistence/engine' },
    ]);
  });

  describe('reads an adapter’s answer by the install’s precedence', () => {
    const cli: Asker = {
      kind: 'adapter',
      id: 'walking-skeleton/acme-cli-bootstrap',
      sharesAnswersWith: ['walking-skeleton/acme-rest-bootstrap', 'walking-skeleton/acme-old'],
    };

    it('takes a sibling’s answer, and binds the question where it was found', async () => {
      const recorder = recordingPrompt({
        'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.acme' },
      });
      expect(await recorder.prompt.ask(sticky('basePackage', 'com.example'), cli)).toBe('org.acme');
      // Sent back under that binding, it is the answer read again —
      // never a second answer to the same question under the asker's id.
      expect(recorder.recorded[0]?.binding).toEqual({
        kind: 'answer',
        adapter: 'walking-skeleton/acme-rest-bootstrap',
        question: 'basePackage',
      });
      expect(recorder.reads).toEqual([
        {
          adapter: 'walking-skeleton/acme-cli-bootstrap',
          question: 'basePackage',
          key: 'walking-skeleton/acme-rest-bootstrap',
        },
      ]);
    });

    it('prefers its own id, then its siblings in the order it lists them', async () => {
      const own = recordingPrompt({
        'walking-skeleton/acme-old': { basePackage: 'org.old' },
        'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.rest' },
        'walking-skeleton/acme-cli-bootstrap': { basePackage: 'org.cli' },
      });
      expect(await own.prompt.ask(sticky('basePackage'), cli)).toBe('org.cli');
      const listed = recordingPrompt({
        'walking-skeleton/acme-old': { basePackage: 'org.old' },
        'walking-skeleton/acme-rest-bootstrap': { basePackage: 'org.rest' },
      });
      expect(await listed.prompt.ask(sticky('basePackage'), cli)).toBe('org.rest');
    });

    it('refuses a value outside the choices, naming the key it was sent under', async () => {
      const recorder = recordingPrompt({
        'walking-skeleton/acme-rest-bootstrap': { flavor: 'native' },
      });
      const choice = (value: string) => ({ value, label: value, doc: '' });
      await expect(
        recorder.prompt.ask(sticky('flavor', 'jvm', { choices: [choice('jvm')] }), cli),
      ).rejects.toMatchObject({
        code: 'keel.invalid-answer',
        message:
          "'native' is not a choice for walking-skeleton/acme-rest-bootstrap:flavor; choices: jvm",
      });
    });

    it('does not read a repeat question’s answer, which the install never takes either', async () => {
      const recorder = recordingPrompt({ 'persistence/engine': { engine: 'mariadb' } });
      expect(await recorder.prompt.ask(question('engine', 'postgres'), adapter)).toBe('postgres');
      expect(recorder.reads).toEqual([]);
    });
  });

  it('reports an identity question as shared with the project', async () => {
    const recorder = recordingPrompt({});
    await recorder.prompt.ask(sticky('projectName', 'demo', { shared: 'project' }), adapter);
    await recorder.prompt.ask(sticky('engine', 'postgres'), adapter);
    expect(recorder.recorded.map((pending) => pending.shared)).toEqual(['project', undefined]);
  });

  it('falls back to the question’s default', async () => {
    const recorder = recordingPrompt({});
    expect(await recorder.prompt.ask(sticky('engine', 'postgres'), adapter)).toBe('postgres');
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
