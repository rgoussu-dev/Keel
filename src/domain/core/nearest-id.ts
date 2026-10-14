/**
 * The registered id a mistyped one most likely meant — what an
 * unknown `--stack` or vertical id is answered with, beside the list
 * of every id there is.
 *
 * A guess is usually made of real facet words that, together, name no
 * preset: `java-cli` (every JVM id says its framework), `go-spa` (Go
 * has no front end; its product does). Edit distance alone reads those
 * as far from everything, and a list of 46 ids leaves the user to spot
 * the one they meant. So the reading is by **facet words first**: what
 * a candidate's id spells, then what its own tags and the words the
 * finder offers them in say (`arch.server-http` is an "HTTP server —
 * a REST endpoint"), then what a product's services say — each typed
 * word counted once, where it weighs most. A typed word that runs
 * several of the candidates' id words together is read as those words
 * first: `quarkuscli` is `quarkus cli`, and `gocli-http` is
 * `go cli http`. Edit distance breaks a tie, and is the whole reading
 * only when no word matches at all, even split — `qurkuscli` is
 * `quarkus-cli` by spelling alone — where it must be close for
 * anything to be named: `nope` names nothing.
 *
 * Words, never tags: nothing here is printed but an id the registry
 * holds, and the words come from what the registry already says about
 * its pieces, so a plugin's stack or vertical is suggested by the same
 * reading as keel's own. A word every candidate answers to
 * (`hexagonal`) tells them apart by nothing, and is not counted.
 *
 * It suggests and never resolves. A `--stack` whose words name exactly
 * one preset by its facets is that preset (`./stack-spelling.ts`), so a
 * stack id reaches this reading only once the facets name none, or
 * more than one.
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
  const vocabulary = new Set(read.flatMap((candidate) => candidate.spelling));
  const wanted = telling(
    [...new Set(wordsOf(spelled).flatMap((word) => split(word, vocabulary)))],
    read,
  );
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
  // A list typed as one id (`ci,persistence`, or the ids spelled whole
  // and run together, `ci-persistence`, `vcsci`) is several: naming one
  // of them as what was meant would drop the others.
  if (typed.includes(',')) return null;
  const ids = new Set(verticals.map((vertical) => wordsOf(vertical.id).join('')));
  if (split(wordsOf(typed).join(''), ids).length > 1) return null;
  return nearestId(
    typed,
    verticals.map((vertical) => ({ id: vertical.id, own: [vertical.title ?? ''], related: [] })),
  );
}

/**
 * The sentence an unknown id is refused with: `unknown stack
 * 'java-cli' — did you mean 'quarkus-cli'? Available: …` where one is near
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

/**
 * A word typed run together as the fewest words of `vocabulary` it is
 * made of, end to end (`quarkuscli` is `quarkus`, `cli`), or the word
 * itself where it is one of them or nothing splits it.
 */
function split(word: string, vocabulary: ReadonlySet<string>): readonly string[] {
  if (vocabulary.has(word)) return [word];
  const longest = Math.max(0, ...[...vocabulary].map((known) => known.length));
  // fewest[i]: how few words make up word.slice(i), Infinity where none
  // do; next[i]: where the first of them ends.
  const fewest = Array.from({ length: word.length + 1 }, () => Infinity);
  const next = Array.from({ length: word.length + 1 }, () => 0);
  fewest[word.length] = 0;
  for (let start = word.length - 1; start >= 0; start -= 1) {
    for (let end = Math.min(word.length, start + longest); end > start; end -= 1) {
      const count = (fewest[end] ?? Infinity) + 1;
      if (count < (fewest[start] ?? Infinity) && vocabulary.has(word.slice(start, end))) {
        fewest[start] = count;
        next[start] = end;
      }
    }
  }
  if (fewest[0] === Infinity) return [word];
  const parts: string[] = [];
  for (let start = 0; start < word.length; start = next[start] ?? word.length) {
    parts.push(word.slice(start, next[start]));
  }
  // A word typed twice over (`gogo`) is a stutter, not two facets.
  return new Set(parts).size === parts.length ? parts : [word];
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
