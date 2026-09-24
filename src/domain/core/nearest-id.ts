/**
 * The registered id a mistyped one most likely meant — what an
 * unknown `--stack` or vertical id is answered with, beside the list
 * of every id there is.
 *
 * Preset ids grew family by family, so the spelling a user guesses is
 * often a real facet in the wrong word: `quarkus-cli-http` (the JVM
 * presets say `rest` where Go, Rust and TypeScript say `http`),
 * `fullstack-quarkus` (the Quarkus product is plain `fullstack`),
 * `go-rest`. Edit distance alone reads those as far from everything,
 * and a list of 34 ids leaves the user to spot the one they meant. So
 * the reading is by **facet words first**: what a candidate's id
 * spells, then what its own tags and the words the finder offers them
 * in say (`arch.server-http` is an "HTTP server — a REST endpoint"),
 * then what a product's services say — each typed word counted once,
 * where it weighs most. Edit distance breaks a tie, and is the whole
 * reading only when no word matches at all — `quarkuscli`,
 * `persistance` — where it must be close for anything to be named.
 *
 * Words, never tags: nothing here is printed but an id the registry
 * holds, and the words come from what the registry already says about
 * its pieces, so a plugin's stack or vertical is suggested by the same
 * reading as keel's own. A word every candidate answers to
 * (`hexagonal`) tells them apart by nothing, and is not counted.
 */

import type { Tag, Vertical } from '../contract/composition.js';
import type { Registry } from '../contract/ports/registry.js';
import type { Stack } from '../contract/stack.js';
import { ENTRYPOINTS } from './stack-wizard.js';

/**
 * An id that may be suggested, and the words it answers to beyond its
 * own spelling — `own` what the piece says of itself, `related` what
 * the pieces it is made of say (a product's services).
 */
export interface IdCandidate {
  readonly id: string;
  readonly own: readonly string[];
  readonly related: readonly string[];
}

/** How much a typed word counts, by where the candidate answers to it. */
const WEIGHT = { id: 3, own: 2, related: 1 } as const;

/**
 * The candidate `typed` most likely meant, or null when none is near
 * enough to name. See the module note for the reading.
 */
export function nearestId(typed: string, candidates: readonly IdCandidate[]): string | null {
  const spelled = typed.trim().toLowerCase();
  const read = candidates.map((candidate) => ({
    id: candidate.id,
    spelling: wordsOf(candidate.id),
    own: candidate.own.flatMap(wordsOf),
    related: candidate.related.flatMap(wordsOf),
  }));
  const wanted = telling([...new Set(wordsOf(spelled))], read);
  const scored = read.map((candidate) => {
    let score = 0;
    let onId = 0;
    for (const word of wanted) {
      if (answers(word, candidate.spelling)) {
        score += WEIGHT.id;
        onId += 1;
      } else if (answers(word, candidate.own)) score += WEIGHT.own;
      else if (answers(word, candidate.related)) score += WEIGHT.related;
    }
    return {
      id: candidate.id,
      score,
      onId,
      untyped: candidate.spelling.filter((word) => !wanted.some((w) => answers(w, [word]))).length,
      distance: editDistance(spelled, candidate.id.toLowerCase()),
    };
  });
  const matched = scored.filter((candidate) => candidate.score > 0);
  if (matched.length > 0) {
    matched.sort(
      (a, b) =>
        b.score - a.score ||
        b.onId - a.onId ||
        a.untyped - b.untyped ||
        a.distance - b.distance ||
        a.id.localeCompare(b.id),
    );
    return matched[0]?.id ?? null;
  }
  const [closest] = [...scored].sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  if (closest === undefined) return null;
  // A third of what was typed, and never less than one slip: two edits
  // turn any two letters into `ci` — `db`, `git` — which is a guess,
  // not a nearest id.
  return closest.distance <= Math.max(1, Math.floor(spelled.length / 3)) ? closest.id : null;
}

/** The registered stack `typed` most likely meant, or null. */
export function nearestStack(registry: Registry, typed: string): string | null {
  return nearestId(
    typed,
    registry.stacks().map((stack) => ({
      id: stack.id,
      own: stackWords(stack),
      related: (stack.services ?? []).flatMap((service) => {
        const named = registry.stack(service.stack);
        return named === null ? [service.stack] : [named.id, ...stackWords(named)];
      }),
    })),
  );
}

/**
 * The vertical of `verticals` `typed` most likely meant, or null — by
 * its id and its title's words (`container` is the Container image).
 */
export function nearestVertical(
  verticals: readonly Pick<Vertical, 'id' | 'title'>[],
  typed: string,
): string | null {
  return nearestId(
    typed,
    verticals.map((vertical) => ({ id: vertical.id, own: [vertical.title ?? ''], related: [] })),
  );
}

/**
 * The sentence an unknown id is refused with: `unknown stack
 * 'go-rest' — did you mean 'go-http'? Available: …` where one is near
 * enough to name, `unknown stack 'nope'; available: …` where none is.
 * `available` is the list's own clause, lowercase (`available: a, b`).
 */
export function unknownIdSentence(
  noun: string,
  typed: string,
  nearest: string | null,
  available: string,
): string {
  if (nearest === null) return `unknown ${noun} '${typed}'; ${available}`;
  return `unknown ${noun} '${typed}' — did you mean '${nearest}'? ${available.charAt(0).toUpperCase()}${available.slice(1)}`;
}

/**
 * What a single stack says of itself: each tag's words after its
 * namespace (`lang.java` is `java`), and each entrypoint in the words
 * the finder offers it in.
 */
function stackWords(stack: Stack): readonly string[] {
  return stack.tags.flatMap((tag: Tag) => [
    tag.slice(tag.indexOf('.') + 1),
    ...ENTRYPOINTS.filter((entry) => entry.tag === tag).map((entry) => entry.label),
  ]);
}

/** The words of `wanted` that tell the candidates apart: not one every candidate answers to. */
function telling(
  wanted: readonly string[],
  read: readonly {
    readonly spelling: readonly string[];
    readonly own: readonly string[];
    readonly related: readonly string[];
  }[],
): readonly string[] {
  if (read.length < 2) return wanted;
  return wanted.filter(
    (word) =>
      !read.every((candidate) =>
        answers(word, [...candidate.spelling, ...candidate.own, ...candidate.related]),
      ),
  );
}

/**
 * Whether a typed word names one of `words`: the same word, the start
 * of one (`infra`, `container`), or one a slip away (`kotin`,
 * `persistance`) — only for words long enough that a slip is not
 * another word.
 */
function answers(typed: string, words: readonly string[]): boolean {
  return words.some(
    (word) =>
      word === typed ||
      (typed.length >= 3 && word.startsWith(typed)) ||
      (Math.min(typed.length, word.length) >= 5 &&
        editDistance(typed, word) <= (Math.max(typed.length, word.length) >= 8 ? 2 : 1)),
  );
}

/** Lowercase words of two characters or more; a lone letter names nothing. */
function wordsOf(text: string): readonly string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((word) => word.length > 1);
}

/**
 * Edit distance: single-character insertions, deletions and
 * substitutions, and two neighbours swapped counted as one slip
 * (`vsc` is one from `vcs`, as a hand types it, not two).
 */
function editDistance(a: string, b: string): number {
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1);
      let best = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, substitution);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, (before[j - 2] ?? 0) + 1);
      }
      current.push(best);
    }
    before = previous;
    previous = current;
  }
  return previous[b.length] ?? 0;
}
