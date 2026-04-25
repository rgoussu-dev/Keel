import { describe, expect, it } from 'vitest';
import { pickStack, type Prompt } from '../src/installer/profile.js';
import type { PromptSchema } from '../src/engine/types.js';

interface ScriptedAnswer {
  match: (schema: PromptSchema<unknown>) => boolean;
  value: unknown;
}

/**
 * Test factory: a {@link Prompt} that returns scripted answers. Each
 * call walks `answers` in order and uses the first matcher that hits.
 * Throws on unmatched prompts so a missed branch fails loudly instead
 * of silently defaulting.
 */
function scriptedPrompt(answers: ScriptedAnswer[]): Prompt {
  let cursor = 0;
  return async <T>(schema: PromptSchema<T>): Promise<T> => {
    for (let i = cursor; i < answers.length; i++) {
      if (answers[i]!.match(schema)) {
        cursor = i + 1;
        return answers[i]!.value as T;
      }
    }
    throw new Error(`unscripted prompt: ${schema.name}`);
  };
}

describe('pickStack()', () => {
  it('walks language → framework → native and returns the resolved choice', async () => {
    const choice = await pickStack(
      scriptedPrompt([
        { match: (s) => s.name === 'language', value: 'java' },
        { match: (s) => s.name === 'framework', value: 'quarkus' },
        { match: (s) => s.name === 'native', value: false },
      ]),
    );

    expect(choice.language).toBe('java');
    expect(choice.framework.id).toBe('quarkus');
    expect(choice.framework.claudeSchematic).toBe('claude-quarkus');
    expect(choice.framework.walkingSkeleton).toBe('walking-skeleton');
    expect(choice.native).toBe(false);
  });

  it('records native=true when the user opts in', async () => {
    const choice = await pickStack(
      scriptedPrompt([
        { match: (s) => s.name === 'language', value: 'java' },
        { match: (s) => s.name === 'framework', value: 'quarkus' },
        { match: (s) => s.name === 'native', value: true },
      ]),
    );

    expect(choice.native).toBe(true);
  });

  it('skips the native question when the framework does not support it', async () => {
    // No built-in framework currently sets supportsNative=false — this
    // exercises that branch via a synthetic registry rather than
    // mutating the production one.
    const choice = await pickStack(
      scriptedPrompt([
        { match: (s) => s.name === 'language', value: 'fake-lang' },
        { match: (s) => s.name === 'framework', value: 'fake-fw' },
      ]),
      [
        {
          id: 'fake-lang',
          label: 'Fake',
          frameworks: [
            {
              id: 'fake-fw',
              label: 'Fake FW',
              claudeSchematic: 'claude-fake',
              walkingSkeleton: null,
              supportsNative: false,
            },
          ],
        },
      ],
    );

    expect(choice.native).toBe(false);
  });

  it('throws when the user picks an unregistered language', async () => {
    await expect(
      pickStack(scriptedPrompt([{ match: (s) => s.name === 'language', value: 'cobol' }])),
    ).rejects.toThrow(/unknown language/);
  });

  it('throws when the user picks an unregistered framework', async () => {
    await expect(
      pickStack(
        scriptedPrompt([
          { match: (s) => s.name === 'language', value: 'java' },
          { match: (s) => s.name === 'framework', value: 'spring-boot' },
        ]),
      ),
    ).rejects.toThrow(/unknown framework/);
  });
});
