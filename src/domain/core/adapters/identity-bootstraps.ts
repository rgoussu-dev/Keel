/**
 * Every shipped walking-skeleton bootstrap that asks the project's
 * identity (`Question.shared`): the adapters a reader chooses among
 * when it needs the project's name or package and cannot know its
 * family in advance — the deploy descriptors, which every family's
 * image shares. `./project-identity.ts` picks the one whose predicate
 * the project's tags match.
 *
 * A list, because an adapter has no registry to ask; kept in step with
 * the shipped registry by `tests/domain/core/adapters/project-identity.test.ts`,
 * which derives it from the questions that declare `shared`.
 */

import type { Adapter } from '../../contract/composition.js';
import { goBootstrapAdapter } from './go-bootstrap.js';
import { micronautCliBootstrapAdapter } from './micronaut-cli-bootstrap.js';
import { micronautCliKotlinBootstrapAdapter } from './micronaut-cli-kotlin-bootstrap.js';
import { micronautRestBootstrapAdapter } from './micronaut-rest-bootstrap.js';
import { micronautRestKotlinBootstrapAdapter } from './micronaut-rest-kotlin-bootstrap.js';
import { quarkusCliBootstrapAdapter } from './quarkus-cli-bootstrap.js';
import { quarkusCliKotlinBootstrapAdapter } from './quarkus-cli-kotlin-bootstrap.js';
import { quarkusRestBootstrapAdapter } from './quarkus-rest-bootstrap.js';
import { quarkusRestKotlinBootstrapAdapter } from './quarkus-rest-kotlin-bootstrap.js';
import { rustBootstrapAdapter } from './rust-bootstrap.js';
import { springCliBootstrapAdapter } from './spring-cli-bootstrap.js';
import { springCliKotlinBootstrapAdapter } from './spring-cli-kotlin-bootstrap.js';
import { springRestBootstrapAdapter } from './spring-rest-bootstrap.js';
import { springRestKotlinBootstrapAdapter } from './spring-rest-kotlin-bootstrap.js';
import { tsCliBootstrapAdapter } from './ts-cli-bootstrap.js';
import { tsHttpBootstrapAdapter } from './ts-http-bootstrap.js';
import { wcSpaBootstrapAdapter } from './wc-spa-bootstrap.js';

/** The shipped bootstraps asking a project's identity, one family after another. */
export const IDENTITY_BOOTSTRAPS: readonly Adapter[] = [
  quarkusCliBootstrapAdapter,
  quarkusRestBootstrapAdapter,
  quarkusCliKotlinBootstrapAdapter,
  quarkusRestKotlinBootstrapAdapter,
  springCliBootstrapAdapter,
  springRestBootstrapAdapter,
  springCliKotlinBootstrapAdapter,
  springRestKotlinBootstrapAdapter,
  micronautCliBootstrapAdapter,
  micronautRestBootstrapAdapter,
  micronautCliKotlinBootstrapAdapter,
  micronautRestKotlinBootstrapAdapter,
  goBootstrapAdapter,
  rustBootstrapAdapter,
  tsHttpBootstrapAdapter,
  tsCliBootstrapAdapter,
  wcSpaBootstrapAdapter,
];
