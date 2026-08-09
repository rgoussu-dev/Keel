/**
 * `walking-skeleton/quarkus-cli-bootstrap` adapter — emits a runnable
 * single-module Quarkus picocli project: build files, application
 * properties, a top-level `Main` with one sample subcommand, and a
 * `QuarkusMainTest` that drives it end-to-end.
 *
 * This is the seed of the `walking-skeleton` vertical. It covers the
 * `entrypoint` dimension and is predicated on
 * `framework.quarkus + arch.cli`. A REST sibling adapter will cover
 * the same dimension under `arch.server-http`; the resolver picks
 * whichever predicate matches the project's tag set.
 *
 * Hexagonal split (separate `domain/core`, `domain/contract`,
 * `infrastructure/cli`) is intentionally NOT done in this seed —
 * later adapters layer it on top via patches against `build.gradle.kts`
 * and `settings.gradle.kts`.
 */

import { packageToPath, validateBasePackage, validateProjectName } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const QUARKUS_CLI_BOOTSTRAP_ID = 'walking-skeleton/quarkus-cli-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/quarkus-cli-bootstrap/templates';

export const quarkusCliBootstrapAdapter: Adapter = {
  id: QUARKUS_CLI_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['framework.quarkus', 'arch.cli'] },
  questions: [
    {
      id: 'basePackage',
      prompt: 'Base Java package',
      doc: 'Used as the root Java package and Gradle group, e.g. com.example.',
      default: 'com.example',
      memory: 'sticky',
    },
    {
      id: 'projectName',
      prompt: 'Project name',
      doc: 'Used as the Gradle root project name and the CLI binary name. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const basePackage = validateBasePackage(
      ctx.answer('basePackage').trim(),
      'quarkus-cli-bootstrap',
    );
    const projectName = validateProjectName(
      ctx.answer('projectName').trim(),
      'quarkus-cli-bootstrap',
    );
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      basePackage,
      projectName,
      pkgPath: packageToPath(basePackage),
    });
    return { files };
  },
};
