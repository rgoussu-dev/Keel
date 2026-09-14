/**
 * Handler for `keel.docs-check` — the read half of `keel docs`.
 *
 * Same projection as `keel.docs-sync`, nothing written: the report
 * carries every way the project's documents and the recomputed index
 * disagree, and the CLI turns a non-empty list into a non-zero exit.
 * Wireable into a pipeline, and into the pre-commit hook behind a
 * `command -v keel` probe, precisely because it cannot dirty the
 * working tree it is judging.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { DocsReport } from '../../contract/commands.js';
import type { DocsCheckQuery } from '../../contract/queries.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { docsIndexDrift } from '../docs-index.js';
import { projectDocs } from '../docs-projection.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { docsReport } from './docs-report.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link DocsCheckQuery}s. */
export class DocsCheckHandler implements Handler<DocsCheckQuery> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is DocsCheckQuery {
    return action.kind === 'keel.docs-check';
  }

  async handle(query: DocsCheckQuery): Promise<Result<DocsReport>> {
    const scopeRoot = projectScopeRoot(query.cwd);
    const manifest = await this.deps.manifests.read(scopeRoot);
    if (!manifest) {
      return err(
        new DomainError(
          `no project initialised at ${scopeRoot} — 'keel docs check' judges the index of a keel project`,
          'keel.not-initialised',
        ),
      );
    }
    const stale = harnessGenerationRefusal(manifest, 'keel docs check');
    if (stale !== null) return err(stale);

    const tree = this.deps.trees(query.cwd);
    const { regions, unindexed } = await projectDocs({
      ...this.deps,
      manifest,
      tree,
      now: () => this.deps.clock.nowIso(),
      cwd: query.cwd,
    });
    return ok(
      docsReport({
        regions,
        drift: docsIndexDrift(regions, tree),
        unindexed,
        changes: [],
        committed: false,
      }),
    );
  }
}
