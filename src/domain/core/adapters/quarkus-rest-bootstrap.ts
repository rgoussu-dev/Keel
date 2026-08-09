/**
 * `walking-skeleton/quarkus-rest-bootstrap` adapter — emits a runnable
 * multi-module Quarkus REST project: the binding-spec domain trisection
 * (`domain/kernel`, `domain/contract`, `domain/core`), the earned
 * application pair `application/rest/contract` (transport DTOs) +
 * `application/rest/executable` (Jakarta REST resource for
 * `GET /greet?name=…`, the domain-error → RFC 9457 Problem Details
 * mapper, and the CDI composition root), and a `@QuarkusTest` +
 * RestAssured test that drives the endpoint end to end.
 *
 * The REST sibling of `walking-skeleton/quarkus-cli-bootstrap`: both
 * cover the `entrypoint` dimension and the resolver picks whichever
 * predicate matches the project's tag set — this one fires on
 * `framework.quarkus + arch.server-http`.
 *
 * Asks the same sticky `basePackage` / `projectName` questions as the
 * CLI bootstrap so downstream adapters (e.g. `sample-port-fake`) read
 * them identically from the manifest.
 */

import { packageToPath, validateBasePackage, validateProjectName } from '../util.js';
import type { Adapter } from '../../contract/composition.js';

export const QUARKUS_REST_BOOTSTRAP_ID = 'walking-skeleton/quarkus-rest-bootstrap';

const TEMPLATE_ID = 'composition/walking-skeleton/quarkus-rest-bootstrap/templates';

export const quarkusRestBootstrapAdapter: Adapter = {
  id: QUARKUS_REST_BOOTSTRAP_ID,
  vertical: 'walking-skeleton',
  covers: ['entrypoint'],
  predicate: { requires: ['framework.quarkus', 'arch.server-http'] },
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
      doc: 'Used as the Gradle root project name. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ],
  async contribute(ctx) {
    const basePackage = validateBasePackage(
      ctx.answer('basePackage').trim(),
      'quarkus-rest-bootstrap',
    );
    const projectName = validateProjectName(
      ctx.answer('projectName').trim(),
      'quarkus-rest-bootstrap',
    );
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      basePackage,
      projectName,
      pkgPath: packageToPath(basePackage),
    });
    return { files };
  },
};
