/**
 * Predicate evaluation against a tag set.
 *
 * The grammar is intentionally minimal: AND-of-requires +
 * NOT-of-excludes, with optional glob suffixes. There is no OR — if a
 * vertical needs disjunction, ship two adapters with different
 * predicates and let the resolver pick whichever matches.
 *
 * Pattern rules:
 *   - A literal tag (no `*`) matches by exact string equality.
 *   - A pattern ending in `*` matches any tag whose prefix equals the
 *     part before the `*` (e.g. `runtime.jvm.*` matches
 *     `runtime.jvm.graalvm-native`). The dot is part of the literal
 *     prefix, not a separator — `runtime.jvm.*` does NOT match
 *     `runtime.jvm` itself; use both patterns if you need both.
 *   - A bare `*`, a pattern starting with `*`, or a pattern with a
 *     non-trailing `*` is rejected at validation time.
 */

import type { Predicate, Tag } from '../contract/composition.js';

/**
 * Returns true iff `tagSet` satisfies `predicate`. An empty predicate
 * (`{}` or one with empty arrays) trivially matches anything; this is
 * useful for the always-applies adapter case (e.g. an `arch.cli`
 * walking-skeleton bootstrap).
 */
export function matches(predicate: Predicate, tagSet: ReadonlySet<Tag>): boolean {
  for (const r of predicate.requires ?? []) {
    if (!matchesPattern(r, tagSet)) return false;
  }
  for (const e of predicate.excludes ?? []) {
    if (matchesPattern(e, tagSet)) return false;
  }
  return true;
}

/**
 * Returns true iff at least one tag in `tagSet` matches the pattern.
 * Exported so adapters can sanity-check their own tag arithmetic in
 * tests; not used by the resolver directly.
 */
export function matchesPattern(pattern: string, tagSet: ReadonlySet<Tag>): boolean {
  return tagsMatching(pattern, tagSet).length > 0;
}

/**
 * The tags of `tagSet` that match the pattern, in set order.
 *
 * {@link matchesPattern} asks whether any did; this asks which, which
 * is what a message naming the offending capabilities needs — a
 * refusal that says `layout.basic` beats one that says `layout.*`.
 * One walk of the grammar serves both, so a glob cannot mean two
 * things.
 */
export function tagsMatching(pattern: string, tagSet: ReadonlySet<Tag>): readonly Tag[] {
  validatePattern(pattern);
  if (!pattern.endsWith('*')) return tagSet.has(pattern) ? [pattern] : [];
  const prefix = pattern.slice(0, -1);
  return [...tagSet].filter((tag) => tag.startsWith(prefix));
}

/**
 * The first term of `predicate` that `tagSet` fails, or null when it
 * matches.
 *
 * {@link matches} answers whether a piece applies; this answers
 * **why it does not**, which is the half an error message needs. An
 * adapter silently dropped by the predicate filter is invisible in
 * "no adapter covers dimension 'entrypoint'" — the dimension is the
 * symptom, and the missing `framework.quarkus` is the cause.
 *
 * The first term rather than all of them: a predicate is a
 * conjunction, so one unmet term is a complete answer, and the
 * shortest one is the most readable.
 */
export function failingTerm(predicate: Predicate, tagSet: ReadonlySet<Tag>): FailingTerm | null {
  for (const pattern of predicate.requires ?? []) {
    if (!matchesPattern(pattern, tagSet)) return { kind: 'requires', pattern };
  }
  for (const pattern of predicate.excludes ?? []) {
    if (matchesPattern(pattern, tagSet)) return { kind: 'excludes', pattern };
  }
  return null;
}

/** Why a predicate did not match. @see failingTerm */
export interface FailingTerm {
  /** `requires` — the pattern was absent; `excludes` — it was present. */
  readonly kind: 'requires' | 'excludes';
  readonly pattern: string;
}

/**
 * Throws if a pattern is malformed. Callers should run this at
 * adapter-registration time so typos surface before any project
 * touches them.
 */
export function validatePattern(pattern: string): void {
  if (pattern.length === 0) {
    throw new Error('predicate pattern must not be empty');
  }
  if (pattern === '*') {
    throw new Error("predicate pattern '*' is not allowed; pin at least one literal segment");
  }
  if (pattern.startsWith('*')) {
    throw new Error(`predicate pattern '${pattern}' must not start with '*'`);
  }
  const star = pattern.indexOf('*');
  if (star !== -1 && star !== pattern.length - 1) {
    throw new Error(`predicate pattern '${pattern}' may only contain '*' at the end`);
  }
}
