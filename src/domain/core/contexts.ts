/**
 * The bounded contexts a project records after its skeleton, read one
 * way wherever they are read: by growth (`./growth.ts`), which wires
 * each added one into a new assembly; by the converge reading
 * (`./converge.ts`), whose composition names them and whose `keel add
 * module` plan adds one more; and by the harness retrofit
 * (`./harness-retrofit.ts`), which replays each added one's harness
 * elements and none of the skeleton's or the peer's. A leaf all three
 * import, so growth and the reading need not import each other for it
 * (dependency-cruiser's `no-circular`).
 */

import type { Tag } from '../contract/composition.js';
import type { ManifestV2 } from '../contract/manifest.js';
import { CONTEXT_TAG, type AddedContext } from './adapters/added-context.js';
import { PEER_CONTEXT_TAG, PEER_MODULE } from './adapters/module-layout.js';

/**
 * A bounded context a project records after its skeleton: its name,
 * and the marker tag that selects its adapters — `modules.peer-context`
 * for the peer, `modules.context` for one `keel add module` added.
 */
export interface RecordedContext {
  readonly name: string;
  readonly marker: Tag;
}

/**
 * The contexts `manifest` records after its skeleton, in the order it
 * records them, each with the marker that selects its adapters: the
 * peer — the context recorded without a seam of its own, or by name
 * where the marker is on and no record says so — by
 * `modules.peer-context`, every other by `modules.context`.
 */
export function contextsOf(manifest: ManifestV2): readonly RecordedContext[] {
  const peer = manifest.tags.includes(PEER_CONTEXT_TAG);
  const contexts = manifest.modules.slice(1).map((module) => ({
    name: module.name,
    marker: peer && !module.seam ? PEER_CONTEXT_TAG : CONTEXT_TAG,
  }));
  if (!peer || contexts.some(({ marker }) => marker === PEER_CONTEXT_TAG)) return contexts;
  return [{ name: PEER_MODULE, marker: PEER_CONTEXT_TAG }, ...contexts];
}

/**
 * The contexts `keel add module` added to the project `manifest`
 * records — {@link contextsOf}'s `modules.context` ones — in the order
 * it records them, each consuming what its record says, or none.
 */
export function addedContextsOf(manifest: ManifestV2): readonly AddedContext[] {
  const consumed = new Map(manifest.modules.map(({ name, consumes }) => [name, consumes ?? null]));
  return contextsOf(manifest)
    .filter(({ marker }) => marker === CONTEXT_TAG)
    .map(({ name }) => ({ name, consumes: consumed.get(name) ?? null }));
}
