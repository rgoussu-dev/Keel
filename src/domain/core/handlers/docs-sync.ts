/**
 * Handler for `keel.docs-sync` — recompute the navigation index and
 * write it into the regions the engine owns.
 *
 * The write path of the projection, and deliberately a narrow one:
 * every change lands between `keel:` sentinels the engine claimed
 * before any adapter could, so a document's prose, its user-authored
 * rows and every other contributor's section come back untouched. A
 * document the project does not have, or one whose slot predates the
 * index, is left alone rather than created — the projection fills a
 * slot, it never invents one.
 *
 * Same computation as `keel.docs-check`, which writes nothing. The
 * two share {@link projectDocs} so a green check after a sync is a
 * fact about one computation rather than a coincidence between two.
 */

import type { Action } from '../../kernel/action.js';
import type { Handler } from '../../kernel/handler.js';
import { DomainError, err, ok, type Result } from '../../kernel/result.js';
import type { DocsReport, DocsSyncCommand } from '../../contract/commands.js';
import { projectScopeRoot } from '../../contract/manifest.js';
import { newOwnership, projectDocsIndex } from '../apply.js';
import { docsIndexDrift } from '../docs-index.js';
import { projectDocs } from '../docs-projection.js';
import { harnessGenerationRefusal } from '../harness-generation.js';
import { docsReport } from './docs-report.js';
import type { InstallDeps } from './deps.js';

/** Executes {@link DocsSyncCommand}s. */
export class DocsSyncHandler implements Handler<DocsSyncCommand> {
  constructor(private readonly deps: InstallDeps) {}

  supports(action: Action): action is DocsSyncCommand {
    return action.kind === 'keel.docs-sync';
  }

  async handle(command: DocsSyncCommand): Promise<Result<DocsReport>> {
    const scopeRoot = projectScopeRoot(command.cwd);
    const manifest = await this.deps.manifests.read(scopeRoot);
    if (!manifest) {
      return err(
        new DomainError(
          `no project initialised at ${scopeRoot} — 'keel docs sync' projects the index of a keel project`,
          'keel.not-initialised',
        ),
      );
    }
    const stale = harnessGenerationRefusal(manifest, 'keel docs sync');
    if (stale !== null) return err(stale);

    const tree = this.deps.trees(command.cwd);
    const { regions, unindexed } = await projectDocs({
      ...this.deps,
      manifest,
      tree,
      now: () => this.deps.clock.nowIso(),
      cwd: command.cwd,
    });
    // Read before the write: the drift a sync reports is what it
    // just fixed, so a caller sees why the file changed.
    const drift = docsIndexDrift(regions, tree);
    projectDocsIndex(regions, tree, newOwnership(), { merge: false });
    const report = docsReport({
      regions,
      drift,
      unindexed,
      changes: tree.changes(),
      committed: !command.dryRun,
    });
    if (!command.dryRun) await tree.commit();
    return ok(report);
  }
}
