/**
 * The **full projection** — the navigation index recomputed from
 * everything a project records, rather than from the contributors one
 * install happened to run.
 *
 * `keel docs sync|check` is this; so is the pass `keel add module`
 * runs after it scaffolds a bounded context, because the directory
 * the contexts live in is the family kit's declaration and the kit
 * does not run in that install. The motion is the one
 * `keel add agent-harness` already performs: replay every recorded
 * contributor non-interactively, from the answers the manifest holds,
 * and collect the declarations without applying a single domain file.
 *
 * The replay is the reason the index cannot be assembled from a walk
 * of the tree. A directory's row is its *declared* description, and a
 * skill's row is the description its spec carries — neither is
 * recoverable from a filename, and both must equal what the emitted
 * files say or the index is a second, quietly diverging source.
 */

import { AGENT_HARNESS_TAG, type ManifestV2, type Tree } from '../contract/composition.js';
import { DOC_FILENAME } from '../contract/doc.js';
import type { Logger } from '../contract/ports/logger.js';
import type { ProcessRunner } from '../contract/ports/process-runner.js';
import type { Prompt } from '../contract/ports/prompt.js';
import type { Registry } from '../contract/ports/registry.js';
import type { TemplateSource } from '../contract/ports/template-source.js';
import { computeDocsIndex, type DocsIndexRegion } from './docs-index.js';
import { retrofitHarness } from './harness-retrofit.js';
import type { HarnessContribution } from './apply.js';

/** Ports and state one full projection reads. */
export interface DocsProjectionInputs {
  readonly manifest: ManifestV2;
  readonly registry: Registry;
  /** The tree the replay is handed; nothing is written to it here. */
  readonly tree: Tree;
  readonly prompt: Prompt;
  readonly logger: Logger;
  readonly cwd: string;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
  readonly now: () => string;
}

/** What one full projection found. */
export interface DocsProjection {
  /** The regions the index would write, in write order. */
  readonly regions: readonly DocsIndexRegion[];
  /**
   * Documents the project carries — per the manifest's own provenance
   * — that no declaration names. Reported, never indexed and never
   * deleted.
   */
  readonly unindexed: readonly string[];
}

/**
 * Replays every recorded contributor and computes the index from what
 * they declare. A project with no harness projects nothing: there are
 * no slots to fill, and inventing them would install a harness by the
 * back door.
 */
export async function projectDocs(inputs: DocsProjectionInputs): Promise<DocsProjection> {
  if (!inputs.manifest.tags.includes(AGENT_HARNESS_TAG)) {
    return { regions: [], unindexed: [] };
  }
  const harness: HarnessContribution[] = [];
  await retrofitHarness({
    ...inputs,
    scope: 'complete',
    harness,
    mode: 'non-interactive',
    // Never realized: the buffer is read for its declarations and
    // dropped, so the replay stages nothing at all.
    harnessOnly: true,
  });
  const docs = harness.flatMap((c) => c.docs);
  const regions = computeDocsIndex({
    docs,
    skills: harness.flatMap((c) => c.skills),
    modules: inputs.manifest.modules,
    services: inputs.manifest.services,
  });
  return {
    regions,
    unindexed: unindexedDocs(
      inputs.manifest,
      docs.map((d) => d.directory),
    ),
  };
}

/**
 * Documents the project has that the declarations do not account for.
 * Read from the manifest's provenance entries rather than from a tree
 * walk: what keel staged is what keel can honestly speak about, and a
 * document a person wrote by hand is theirs — listed so the silence
 * is not mistaken for coverage, and left exactly where it is.
 */
function unindexedDocs(manifest: ManifestV2, indexed: readonly string[]): readonly string[] {
  const known = new Set(indexed);
  const suffix = `/${DOC_FILENAME}`;
  const found = new Set<string>();
  for (const entry of manifest.entries) {
    if (!entry.target.endsWith(suffix)) continue;
    const directory = entry.target.slice(0, -suffix.length);
    if (directory === '' || known.has(directory)) continue;
    found.add(entry.target);
  }
  return [...found].sort();
}
