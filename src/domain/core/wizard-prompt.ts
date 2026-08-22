/**
 * The `keel new` wizard's flow control, layered over the `Prompt`
 * port rather than growing it — `Prompt.ask(question) => string`
 * stays the only primitive an adapter or the install engine ever
 * calls; everything about staging back and forth lives here.
 *
 * `WizardPrompt` wraps the real prompt and records every question
 * asked and its answer, in order, across one staging attempt
 * (`resolveStackId` → build-system/module-layout/peer-context →
 * every adapter's questions as `installVertical` resolves them). On
 * a repeat attempt — triggered by the review step's "change this
 * answer" choice — it replays the previous attempt's answers
 * verbatim until either:
 *
 *   - the position the caller marked with {@link prepareEdit} is
 *     reached, at which point that question (and everything after
 *     it) is asked afresh; or
 *   - the question actually being asked at some position no longer
 *     matches what was recorded there last time (an earlier answer
 *     changed which adapters or questions apply from here on), at
 *     which point replay stops at that point and everything after it
 *     is asked afresh too.
 *
 * Either way, once replay stops it never resumes within the same
 * attempt — a stale answer is never reused once the sequence it came
 * from no longer holds.
 */

import type { Question } from '../contract/composition.js';
import type { Asker, Prompt } from '../contract/ports/prompt.js';

/** One resolved question, in the order it was asked. */
export interface RecordedAnswer {
  readonly question: Question;
  readonly value: string;
}

/** @see WizardPrompt.askDirect */
const CONTROL_ASKER: Asker = { kind: 'control', id: 'keel.new-project' };

export class WizardPrompt implements Prompt {
  /** Every question asked (and its answer) during the current attempt, in order. */
  recorded: RecordedAnswer[] = [];

  private previous: readonly RecordedAnswer[] = [];
  private cursor = 0;
  private replaying = false;
  private editIndex: number | null = null;

  constructor(private readonly underlying: Prompt) {}

  /** Starts a fresh staging attempt, replaying `recorded` from the last one. */
  beginAttempt(): void {
    this.previous = this.recorded;
    this.recorded = [];
    this.cursor = 0;
    this.replaying = true;
  }

  /**
   * Marks the question at `index` (a position into the previous
   * attempt's {@link recorded} list) to be re-asked on the next
   * attempt, instead of replayed from cache.
   */
  prepareEdit(index: number): void {
    this.editIndex = index;
  }

  async ask(question: Question, asker: Asker): Promise<string> {
    const index = this.cursor++;
    if (this.replaying && index !== this.editIndex) {
      const cached = this.previous[index];
      if (cached && cached.question.id === question.id) {
        this.recorded.push({ question, value: cached.value });
        return cached.value;
      }
    }
    this.replaying = false;
    const value = await this.underlying.ask(question, asker);
    this.recorded.push({ question, value });
    return value;
  }

  /**
   * Asks a question outside the staged sequence — the review step's
   * own proceed/edit/cancel prompt, which controls the flow rather
   * than being part of the plan it is reviewing.
   *
   * It carries the `control` asker, which is that same distinction
   * made visible to the port rather than only to this method's name.
   * A prompt adapter that collects answers instead of blocking — the
   * one `keel.preview` runs — has to tell a question about the plan
   * from a question about what to do next, and cannot from the
   * question alone.
   */
  askDirect(question: Question): Promise<string> {
    return this.underlying.ask(question, CONTROL_ASKER);
  }
}
