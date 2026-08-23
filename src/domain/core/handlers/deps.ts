/**
 * The dependency bundle shared by the install-shaped handlers
 * (`keel new` / `keel add`). Every entry is a port from
 * `domain/contract`; the composition root
 * (`application/cli/executable`) supplies the real adapters, test
 * factories supply the shipped fakes.
 */

import type { Clock } from '../../contract/ports/clock.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ManifestStore } from '../../contract/ports/manifest-store.js';
import type { ProcessRunner } from '../../contract/ports/process-runner.js';
import type { Registry } from '../../contract/ports/registry.js';
import type { Prompt } from '../../contract/ports/prompt.js';
import type { TemplateSource } from '../../contract/ports/template-source.js';
import type { TreeFactory } from '../../contract/ports/tree.js';
import type { RunActionsInputs } from '../actions.js';

/** Ports and configuration the install handlers are wired with. */
export interface InstallDeps {
  readonly trees: TreeFactory;
  readonly manifests: ManifestStore;
  readonly prompt: Prompt;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly templates: TemplateSource;
  readonly processes: ProcessRunner;
  /**
   * The stacks and verticals this run may compose from — keel's own,
   * plus whatever a plugin registered. Injected rather than imported
   * so the catalog is a property of the run; see the port's doc.
   */
  readonly registry: Registry;
  /** keel version recorded into new manifests. */
  readonly keelVersion: string;
  /**
   * Deferred-action runner — overridable so tests can filter or wrap
   * individual actions (e.g. skip `gradle wrapper`, retry flaky CDN
   * downloads) while the rest run for real. Defaults to `runActions`.
   */
  readonly runDeferred?: (inputs: RunActionsInputs) => Promise<void>;
}
