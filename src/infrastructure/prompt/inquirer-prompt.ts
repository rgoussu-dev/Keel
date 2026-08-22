/**
 * Interactive terminal adapter for the Prompt port, backed by
 * `@inquirer/prompts`. Picks `checkbox` for `multi-select` choice
 * questions, `select` for single-choice ones, and a free-form
 * `input` (with the default pre-filled) otherwise.
 *
 * `question.doc` is mandatory on every `Question` precisely so it is
 * never lost: `select` and `checkbox` surface it as each choice's own
 * description, and `input` — which `@inquirer/prompts` gives no
 * description slot of its own — has it appended to the message on its
 * own line.
 *
 * Boolean-shaped questions can be modelled as a `select` with values
 * `'yes' | 'no'`; no `confirm` shortcut is exposed, keeping the
 * answer alphabet uniformly stringy in the manifest.
 */

import { checkbox, input, select } from '@inquirer/prompts';
import {
  decodeSelection,
  encodeSelection,
  type Question,
} from '../../domain/contract/composition.js';
import type { Asker, Prompt } from '../../domain/contract/ports/prompt.js';

/** The terminal prompt the CLI wires by default. */
export const inquirerPrompt: Prompt = {
  async ask(question: Question, asker: Asker): Promise<string> {
    // The terminal shows the question, not its provenance: the CLI
    // asks in resolution order, so "which adapter wants this?" is
    // context the user already has. The asker is here for the ports
    // that cannot rely on ordering — see `Asker`.
    void asker;
    if (question.choices && question.choices.length > 0) {
      if (question.kind === 'multi-select') {
        const checked = new Set(decodeSelection(question.default));
        const values = await checkbox<string>({
          message: question.prompt,
          // A default naming at least one value is the question
          // saying an empty set is not an answer — see `Question.default`.
          required: checked.size > 0,
          choices: question.choices.map((c) => ({
            name: c.label,
            value: c.value,
            description: c.doc,
            checked: checked.has(c.value),
          })),
        });
        // Re-ordered into choice order rather than click order, so
        // the same set always encodes to the same answer — which is
        // what makes a replayed wizard answer compare equal.
        return encodeSelection(
          (question.choices ?? []).map((c) => c.value).filter((v) => values.includes(v)),
        );
      }
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
    return input({
      message: question.doc.length > 0 ? `${question.prompt}\n  ${question.doc}` : question.prompt,
      default: question.default,
    });
  },
};
