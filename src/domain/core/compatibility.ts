/**
 * Compatibility: **one declaration, read twice**.
 *
 * A {@link Conflict} says a combination of capabilities must never be
 * assembled. The engine reads every declaration from both ends:
 *
 *   - {@link violatedBy} — the assembly in hand is illegal, so refuse
 *     it and name the rule, the reason, and the tags that matched.
 *   - {@link wouldViolate} — the choice about to be *offered* would
 *     make it illegal, so keep it off the menu.
 *
 * That pairing is not new here. It is exactly the shape
 * `resolveVertical` (throws) and `coversFor` (answers) already have
 * for dimension coverage, and `coversFor`'s own doc gives the reason:
 * a choice whose only outcome is a refusal eight questions later is a
 * dead end an interactive flow must not walk the user into. What is
 * new is that the rule lives in a **declaration** rather than in the
 * shape of a hand-written check, so the refusal and the filter cannot
 * disagree, and a piece supplied from outside this repository can
 * bring its own rules.
 *
 * **Why not `Predicate`.** It is the same evaluation — `violatedBy`
 * is `matches` with the fields renamed — but the polarity is
 * opposite, and conflating them makes both unreadable: `matches`
 * returning false means "this piece does not apply here", which is
 * ordinary, while a conflict matching means "this must not be built",
 * which is an error. Same grammar, two names, no second matcher.
 *
 * **Where rules come from.** The pieces themselves, gathered by
 * {@link conflictsOf}. Nothing here holds a registry: a central table
 * of incompatibilities is precisely what a plugin cannot extend.
 */

import { matches, tagsMatching, validatePattern } from './predicate.js';
import type { Conflict, Tag } from '../contract/composition.js';

/**
 * Anything that can declare rules — a stack, a vertical, or whatever
 * a plugin ships. Structural on purpose: this module knows nothing
 * about either type, which is what keeps the vocabulary open.
 */
export interface ConflictSource {
  readonly conflicts?: readonly Conflict[];
}

/**
 * Every rule the given pieces declare, de-duplicated by id and in
 * declaration order.
 *
 * De-duplicated because a rule reaches an assembly by however many
 * paths the pieces take — a vertical named by the stack *and* by
 * `--with` declares its conflicts once, not twice — and a refusal
 * that listed the same rule twice would read like two problems.
 */
export function conflictsOf(pieces: Iterable<ConflictSource>): readonly Conflict[] {
  const byId = new Map<string, Conflict>();
  for (const piece of pieces) {
    for (const conflict of piece.conflicts ?? []) {
      if (!byId.has(conflict.id)) byId.set(conflict.id, conflict);
    }
  }
  return [...byId.values()];
}

/**
 * The rules `tags` violates, in declaration order.
 *
 * A rule bites when every pattern in `when` matches and none in
 * `unless` does — which is `matches({ requires: when, excludes:
 * unless })`, evaluated by the engine's one pattern matcher.
 */
export function violatedBy(
  conflicts: readonly Conflict[],
  tags: Iterable<Tag>,
): readonly Conflict[] {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  return conflicts.filter((conflict) => {
    validateConflict(conflict);
    return matches(
      { requires: conflict.when, ...(conflict.unless && { excludes: conflict.unless }) },
      tagSet,
    );
  });
}

/**
 * The rules that folding `added` into `tags` would **newly** violate.
 *
 * Newly, because a menu whose base assembly is already illegal must
 * not hide every remaining choice: the answer to "is this option a
 * dead end?" is about the option, not about the mess it is being
 * offered into. What is already broken is {@link violatedBy}'s to
 * report, once, rather than every menu's to repeat.
 */
export function wouldViolate(
  conflicts: readonly Conflict[],
  tags: Iterable<Tag>,
  added: Iterable<Tag>,
): readonly Conflict[] {
  const base = [...tags];
  const already = new Set(violatedBy(conflicts, base).map((conflict) => conflict.id));
  return violatedBy(conflicts, [...base, ...added]).filter((conflict) => !already.has(conflict.id));
}

/**
 * Whether `added` is legal on top of `tags` — {@link wouldViolate}
 * read as the predicate a menu filters with.
 */
export function legalWith(
  conflicts: readonly Conflict[],
  tags: Iterable<Tag>,
  added: Iterable<Tag>,
): boolean {
  return wouldViolate(conflicts, tags, added).length === 0;
}

/**
 * The refusal, as the user reads it: the rule's own sentence, then
 * the evidence — which tags matched, and which rule said so.
 *
 * The evidence is the half a hand-written check keeps losing. "no
 * adapter covers dimension 'bootstrap'" names the symptom; this names
 * the two capabilities that cannot sit together and the id to search
 * for.
 */
export function violationMessage(conflict: Conflict, tags: Iterable<Tag>): string {
  const tagSet: ReadonlySet<Tag> = tags instanceof Set ? tags : new Set(tags);
  const matched = conflict.when.flatMap((pattern) => [...tagsMatching(pattern, tagSet)]);
  return `${conflict.reason} (incompatible: ${matched.join(' + ')}; rule '${conflict.id}')`;
}

/**
 * Throws if a rule is malformed. Called on every evaluation rather
 * than at registration, because a rule can arrive from a plugin that
 * never ran this repository's tests.
 *
 * An empty `when` is the one that matters: it matches every tag set,
 * so it would forbid every assembly — and it is what an author who
 * meant `unless` writes by mistake.
 */
export function validateConflict(conflict: Conflict): void {
  if (conflict.id.length === 0) throw new Error('conflict must have an id');
  if (conflict.when.length === 0) {
    throw new Error(
      `conflict '${conflict.id}': 'when' must name at least one tag — an empty 'when' forbids every assembly`,
    );
  }
  for (const pattern of [...conflict.when, ...(conflict.unless ?? [])]) {
    validatePattern(pattern);
  }
}
