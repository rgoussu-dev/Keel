/**
 * Interactive terminal adapter for the Prompt port, backed by
 * `@inquirer/prompts`. Picks `select` for choice questions and a
 * free-form `input` (with the default pre-filled) otherwise.
 *
 * Boolean-shaped questions can be modelled as a `select` with values
 * `'yes' | 'no'`; no `confirm` shortcut is exposed, keeping the
 * answer alphabet uniformly stringy in the manifest.
 */

import { input, select } from '@inquirer/prompts';
import type { Question } from '../../domain/contract/composition.js';
import type { Prompt } from '../../domain/contract/ports/prompt.js';

/** The terminal prompt the CLI wires by default. */
export const inquirerPrompt: Prompt = {
  async ask(question: Question): Promise<string> {
    if (question.choices && question.choices.length > 0) {
      const value = await select<string>({
        message: question.prompt,
        default: question.default,
        choices: question.choices.map((c) => ({
          name: c.label,
          value: c.value,
          description: c.doc,
        })),
      });
      return value;
    }
    return input({ message: question.prompt, default: question.default });
  },
};
