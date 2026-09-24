/**
 * Where an answer supplied up front may land.
 *
 * `--set adapterId:questionId=value` and an install body's `answers`
 * name the adapter an answer is for. The install loop hands each
 * adapter only the answers keyed to it, or to a sibling it borrows
 * from (`Adapter.sharesAnswersWith`), so an answer keyed to anything
 * else reaches nothing. Before that it did worse than nothing: it was
 * seeded into the manifest of every scope the run wrote, where an
 * adapter scanning a fixed list of bootstrap ids found a Quarkus
 * package on a Spring project and split the package, and `keel add`
 * wrote it over an installed vertical's recorded answer without
 * re-rendering a file.
 *
 * So a run refuses, before anything is committed, every answer its
 * plan would not read:
 *
 *   - keyed to an adapter of a vertical the project already has —
 *     {@link FROZEN_ANSWER_CODE}, since reconfiguring is not supported;
 *   - keyed to any other adapter outside the plan —
 *     {@link UNKNOWN_ANSWER_CODE}, naming the plan's adapters that do
 *     take answers;
 *   - naming a question its adapter does not ask — the same code,
 *     naming the questions it does.
 *
 * A value outside its question's choices is refused where it reaches
 * its adapter (`checkSuppliedAnswer` in `./answers.ts`), which is
 * before that adapter contributes anything.
 */

import { DomainError } from '../kernel/result.js';
import type { PresetAnswers } from '../contract/commands.js';
import type { Adapter, Vertical } from '../contract/composition.js';
import type { ManifestV2 } from '../contract/manifest.js';
import type { Registry } from '../contract/ports/registry.js';
import {
  frozenAnswerSentence,
  unknownAnswerSentence,
  unknownQuestionSentence,
} from './refusals.js';

/** The code an answer no adapter of the run's plan reads is refused with. */
export const UNKNOWN_ANSWER_CODE = 'keel.unknown-answer';

/** The code an answer for an installed vertical's adapter is refused with. */
export const FROZEN_ANSWER_CODE = 'keel.frozen-answer';

/**
 * Which installed vertical owns an adapter id, if any — the question
 * {@link strayAnswerRefusal} asks before calling a key unknown.
 */
export type InstalledOwner = (adapterId: string) => Vertical | null;

/** A greenfield run's {@link InstalledOwner}: nothing is installed yet. */
export const NOTHING_INSTALLED: InstalledOwner = () => null;

/**
 * The first supplied answer no adapter of `plan` reads, as the refusal
 * it earns; null when every one lands.
 *
 * An adapter reads the answers keyed to its own id and to each
 * {@link Adapter.sharesAnswersWith} sibling, for the questions it
 * declares. A key the plan resolves itself is never frozen: nothing it
 * recorded exists yet. A key it only borrows is, when an installed
 * vertical owns it: that answer is the installed vertical's, already
 * recorded and rendered, and taking a different value for it would
 * leave the plan disagreeing with what that vertical wrote.
 *
 * @param plan - every adapter the run resolves, across all its scopes.
 * @param installedOwner - the project's installed verticals, by
 *   adapter id; {@link NOTHING_INSTALLED} for a new project.
 */
export function strayAnswerRefusal(
  supplied: PresetAnswers,
  plan: readonly Adapter[],
  installedOwner: InstalledOwner,
): DomainError | null {
  for (const [adapterId, byQuestion] of Object.entries(supplied)) {
    const questionIds = Object.keys(byQuestion);
    const first = questionIds[0];
    if (first === undefined) continue;
    const key = `${adapterId}:${first}`;
    const readers = plan.filter(
      (adapter) =>
        adapter.id === adapterId || (adapter.sharesAnswersWith ?? []).includes(adapterId),
    );
    if (!plan.some((adapter) => adapter.id === adapterId)) {
      const owner = installedOwner(adapterId);
      if (owner !== null) {
        return new DomainError(frozenAnswerSentence(owner, key), FROZEN_ANSWER_CODE);
      }
    }
    if (readers.length === 0) {
      return new DomainError(unknownAnswerSentence(key, askersOf(plan)), UNKNOWN_ANSWER_CODE);
    }
    const asked = [
      ...new Set(readers.flatMap((reader) => (reader.questions ?? []).map((q) => q.id))),
    ];
    const unasked = questionIds.find((questionId) => !asked.includes(questionId));
    if (unasked !== undefined) {
      // Only an adapter the plan runs can be said to ask no such
      // question: a borrowed key's own adapter may well ask it, it is
      // just nobody here that does.
      return new DomainError(
        plan.some((adapter) => adapter.id === adapterId)
          ? unknownQuestionSentence(adapterId, unasked, asked)
          : unknownAnswerSentence(`${adapterId}:${unasked}`, askersOf(plan)),
        UNKNOWN_ANSWER_CODE,
      );
    }
  }
  return null;
}

/**
 * The {@link InstalledOwner} of a project on disk: its installed
 * verticals, found in the registry — or, for one no brownfield flow
 * offers (a product root's glue), among the stacks' own.
 */
export function installedOwnerOf(registry: Registry, manifest: ManifestV2): InstalledOwner {
  const installed = manifest.verticals
    .map(
      ({ id }) =>
        registry.vertical(id) ??
        registry
          .stacks()
          .flatMap((stack) => stack.verticals)
          .find((vertical) => vertical.id === id) ??
        null,
    )
    .filter((vertical): vertical is Vertical => vertical !== null);
  return (adapterId) =>
    installed.find((vertical) => vertical.adapters.some((adapter) => adapter.id === adapterId)) ??
    null;
}

/** The plan's adapters that ask anything, once each, in plan order. */
function askersOf(plan: readonly Adapter[]): readonly string[] {
  return [
    ...new Set(
      plan.filter((adapter) => (adapter.questions ?? []).length > 0).map((adapter) => adapter.id),
    ),
  ];
}
