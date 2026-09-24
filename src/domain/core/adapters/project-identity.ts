/**
 * Where an adapter downstream of a walking-skeleton bootstrap reads the
 * project's identity — its base package, its name, its npm scope —
 * from: the answers the bootstrap this project ran recorded.
 *
 * "The bootstrap this project ran" is the one whose predicate the
 * manifest's tags match, not the first id in a list that has answers
 * at all. The two used to coincide only by luck: a manifest an older
 * keel wrote carries every answer supplied to `keel new`, another
 * family's bootstrap's included, and a reader scanning a fixed list
 * found a Quarkus package on a Spring project and split the package
 * in two. The tags cannot be wrong about which family this is.
 *
 * Where two candidates match — a project carrying both entrypoints
 * runs both of a pair of bootstraps — they share their answers
 * (`Adapter.sharesAnswersWith`), so which of the two is read makes no
 * difference; the first listed is.
 */

import type { Adapter, ManifestV2 } from '../../contract/composition.js';
import { effectiveTags } from '../../contract/manifest.js';
import { matches } from '../predicate.js';

/** What a reader needs of a bootstrap: its id, and where it runs. */
export type Bootstrap = Pick<Adapter, 'id' | 'predicate'>;

/**
 * The answers recorded by the first of `bootstraps` whose predicate
 * the manifest's effective tags match and that recorded any; undefined
 * when none did — the bootstrap has not run yet, or this project is not
 * one of theirs.
 */
export function bootstrapAnswers(
  manifest: ManifestV2,
  bootstraps: readonly Bootstrap[],
): Readonly<Record<string, string>> | undefined {
  const tags = new Set(effectiveTags(manifest));
  for (const bootstrap of bootstraps) {
    if (!matches(bootstrap.predicate, tags)) continue;
    const answers = manifest.answers[bootstrap.id];
    if (answers !== undefined && Object.keys(answers).length > 0) return answers;
  }
  return undefined;
}
