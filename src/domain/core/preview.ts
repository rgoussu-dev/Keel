/**
 * The machinery behind `keel.preview`: a Prompt adapter that answers
 * from a supplied map and records what it was asked, plus the
 * mapping from an {@link Asker} back to where the answer belongs.
 *
 * **Why record rather than enumerate.** keel's question set is not
 * static. An adapter is asked only once its predicate matched, and a
 * predicate reads tags an earlier adapter promoted — so "which
 * questions does `quarkus-rest` have?" has no answer independent of
 * the answers already given. Walking the registry would produce a
 * superset at best and a wrong set in practice. Running the real
 * resolution with a prompt that never blocks produces the true set,
 * in the true order, for free: the install is a dry run either way.
 *
 * Nothing here is shared between runs — a fresh recorder per query —
 * so two previews in flight at once cannot see each other's
 * questions.
 */

import type { PresetAnswers } from '../contract/commands.js';
import type { Question } from '../contract/composition.js';
import type { AnswerBinding, PendingQuestion } from '../contract/queries.js';
import type { Asker, Prompt } from '../contract/ports/prompt.js';
import {
  BUILD_SYSTEM_QUESTION_ID,
  ENTRYPOINTS_QUESTION_ID,
  FRAMEWORK_QUESTION_ID,
  LANGUAGE_QUESTION_ID,
  LAYOUT_QUESTION_ID,
  MODULE_LAYOUT_QUESTION_ID,
  PEER_CONTEXT_QUESTION_ID,
  SERVICE_QUESTION_SEPARATOR,
  STACK_QUESTION_ID,
} from './handlers/new-project.js';

/**
 * The drill-down's three steps (see `./stack-wizard.ts`). None of
 * them is a field of the command: they are how a *terminal* user
 * navigates to a stack id, and the only thing they leave behind is
 * the `stack` the last one resolves to.
 */
const DRILL_DOWN_QUESTION_IDS: readonly string[] = [
  LANGUAGE_QUESTION_ID,
  ENTRYPOINTS_QUESTION_ID,
  FRAMEWORK_QUESTION_ID,
];

/** A prompt that answers without blocking, and remembers being asked. */
export interface RecordingPrompt {
  readonly prompt: Prompt;
  /** Questions asked so far, in ask order. Read after the run. */
  readonly recorded: readonly PendingQuestion[];
}

/**
 * Builds a prompt answering each question from `answers` (keyed the
 * way the answer's binding keys it) and falling back to the
 * question's own default.
 *
 * Runs are driven **interactively** on purpose. A preset sticky
 * answer folded into the manifest instead would short-circuit its
 * question before the prompt ever saw it, and the question would
 * vanish from the form the moment it was answered. Routing every
 * answer through the prompt keeps the whole set visible, which is
 * what a form needs, and resolves to the same values an install
 * would use.
 */
export function recordingPrompt(answers: PresetAnswers): RecordingPrompt {
  const recorded: PendingQuestion[] = [];
  const prompt: Prompt = {
    ask(question: Question, asker: Asker): Promise<string> {
      // The `keel new` wizard's review step asks what to do next, not
      // what to scaffold. Taking its default ends the staging loop at
      // the first plan — which is the whole of a preview — and keeping
      // it out of `recorded` keeps a flow-control prompt from
      // arriving at a form as a field.
      if (asker.kind === 'control') return Promise.resolve(question.default);
      const binding = bindingFor(question, asker);
      const value = suppliedAnswer(answers, binding) ?? question.default;
      recorded.push({
        id: question.id,
        prompt: question.prompt,
        doc: question.doc,
        ...(question.kind === undefined ? {} : { kind: question.kind }),
        ...(question.choices === undefined ? {} : { choices: question.choices }),
        default: question.default,
        value,
        memory: question.memory,
        binding,
      });
      return Promise.resolve(value);
    },
  };
  return { prompt, recorded };
}

/**
 * Where the answer to `question` is recorded.
 *
 * An adapter's question is sticky memory under the adapter's id — the
 * shape `--set adapterId:questionId=value` writes, and the shape the
 * manifest keeps. A stack-level dial has no such home: it is a field
 * of the command, and which field is decided by the question id the
 * install handler gave it. The toolchain dial reaches neither
 * command, so it binds as an answer under its context's name and is
 * simply never sent back by an install front end.
 */
export function bindingFor(question: Question, asker: Asker): AnswerBinding {
  if (asker.kind !== 'stack') {
    return { kind: 'answer', adapter: asker.id, question: question.id };
  }
  if (question.id === STACK_QUESTION_ID) return { kind: 'stack' };
  // Bound as an answer rather than to a field, deliberately. Three
  // questions cannot fill one `stack`, and binding any of them to it
  // would have a front end post `java@jvm` as a stack id. An answer
  // binding round-trips harmlessly instead: it reaches the drill-down
  // through the prompt on the next preview and resolves the same way.
  // A front end with a stack picker sends `stack` and never sees
  // these at all, which is what `keel ui` does.
  if (DRILL_DOWN_QUESTION_IDS.includes(question.id)) {
    return { kind: 'answer', adapter: asker.id, question: question.id };
  }
  if (question.id === LAYOUT_QUESTION_ID) return { kind: 'layout' };
  if (question.id === PEER_CONTEXT_QUESTION_ID) return { kind: 'withPeerContext' };
  if (question.id === MODULE_LAYOUT_QUESTION_ID) return { kind: 'moduleLayout' };
  const [head, service] = splitServiceQuestion(question.id);
  if (head === BUILD_SYSTEM_QUESTION_ID) {
    return service === undefined ? { kind: 'buildSystem' } : { kind: 'buildSystem', service };
  }
  // A stack-level dial nobody taught this function about. Binding it
  // to the stack keeps the question visible in the form (where it can
  // at least be read) rather than dropping it, and the answer round
  // trips harmlessly: no command field is filled from it, so the
  // preview shows the default and says so.
  return { kind: 'answer', adapter: asker.id, question: question.id };
}

/**
 * The caller's answer for a binding, if they supplied one.
 *
 * Only `answer` bindings are looked up here: a stack-level dial
 * travels as a field of the target, and the handler has already
 * folded it into the command by the time the question is asked, so
 * the value reaching the prompt is the one the caller chose.
 */
function suppliedAnswer(answers: PresetAnswers, binding: AnswerBinding): string | undefined {
  if (binding.kind !== 'answer') return undefined;
  return answers[binding.adapter]?.[binding.question];
}

/** Splits `buildSystem:backend` into its id and its service path. */
function splitServiceQuestion(id: string): [string, string | undefined] {
  const at = id.indexOf(SERVICE_QUESTION_SEPARATOR);
  if (at < 0) return [id, undefined];
  return [id.slice(0, at), id.slice(at + SERVICE_QUESTION_SEPARATOR.length)];
}
