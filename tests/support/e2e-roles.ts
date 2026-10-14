/**
 * The e2e suites that prove no dial cell, and why each does not.
 *
 * Every suite under `tests/e2e/` either builds a cell as keel
 * scaffolds it, and is a row of `src/domain/core/support-tier.json`,
 * or has a role here — never both, which `tests/support-tier.test.ts`
 * holds. The roles live with the tests rather than with keel: they say
 * how this repository's suites are organised, which nothing at run
 * time reads.
 *
 * - `variant`: builds a cell only after changing it — `keel add module`
 *   rewrites three or four of its build and wiring files, or a vertical
 *   is added first. The pristine cell is never compiled, so the suite
 *   proves it no more than any other variant (roadmap T, DT8).
 * - `aspect`: checks one property of a cell another suite builds.
 * - `no-build`: compiles nothing.
 * - `browser`: drives `keel ui` in a browser, and runs no toolchain.
 */

/** Why a suite proves no cell. */
export type E2eRole = 'variant' | 'aspect' | 'no-build' | 'browser';

/** A suite's role, and the one line that says what it does instead. */
export interface SuiteRole {
  readonly role: E2eRole;
  readonly why: string;
}

const ADD_MODULE: SuiteRole = {
  role: 'variant',
  why: '`keel add module` rewrites the build and wiring files before the only build',
};

const PERSISTENCE: SuiteRole = {
  role: 'variant',
  why: 'persistence is added to the scaffold before it builds',
};

/** Each suite that proves no cell, by its file's name less `.test.ts`. */
export const E2E_ROLES: Readonly<Record<string, SuiteRole>> = {
  'add-module-quarkus-rest-gradle': ADD_MODULE,
  'add-module-quarkus-rest-maven': ADD_MODULE,
  'add-module-quarkus-rest-kotlin-gradle': ADD_MODULE,
  'add-module-quarkus-rest-kotlin-maven': ADD_MODULE,
  'add-module-quarkus-cli-gradle': ADD_MODULE,
  'add-module-quarkus-cli-maven': ADD_MODULE,
  'add-module-quarkus-cli-kotlin-gradle': ADD_MODULE,
  'add-module-quarkus-cli-kotlin-maven': ADD_MODULE,
  'add-module-spring-rest-gradle': ADD_MODULE,
  'add-module-spring-rest-maven': ADD_MODULE,
  'add-module-spring-rest-kotlin-gradle': ADD_MODULE,
  'add-module-spring-rest-kotlin-maven': ADD_MODULE,
  'add-module-spring-cli-gradle': ADD_MODULE,
  'add-module-spring-cli-maven': ADD_MODULE,
  'add-module-spring-cli-kotlin-gradle': ADD_MODULE,
  'add-module-spring-cli-kotlin-maven': ADD_MODULE,
  'add-module-micronaut-rest-gradle': ADD_MODULE,
  'add-module-micronaut-rest-maven': ADD_MODULE,
  'add-module-micronaut-rest-kotlin-gradle': ADD_MODULE,
  'add-module-micronaut-rest-kotlin-maven': ADD_MODULE,
  'add-module-micronaut-cli-gradle': ADD_MODULE,
  'add-module-micronaut-cli-maven': ADD_MODULE,
  'add-module-micronaut-cli-kotlin-gradle': ADD_MODULE,
  'add-module-micronaut-cli-kotlin-maven': ADD_MODULE,
  'add-module-go': ADD_MODULE,
  'add-module-rust': ADD_MODULE,
  'add-module-ts': ADD_MODULE,
  'add-module-wc': ADD_MODULE,
  'modulith-persistence': PERSISTENCE,
  'modulith-persistence-mariadb': PERSISTENCE,
  'modulith-go-persistence': PERSISTENCE,
  'modulith-go-persistence-liquibase': PERSISTENCE,
  'modulith-rust-persistence': PERSISTENCE,
  'code-style-jvm': {
    role: 'aspect',
    why: "the `code-style` format pass on `walking-skeleton`'s cell, which that suite builds",
  },
  'dev-compose': {
    role: 'no-build',
    why: 'fakes every deferred action and boots the dev database alone',
  },
  'ui-stack-finder': { role: 'browser', why: 'the greenfield stepper, in an empty directory' },
  'ui-plugin-stack': { role: 'browser', why: 'a stack a keel plugin on disk registers' },
  'ui-refusal': { role: 'browser', why: 'what a scaffolded project cannot carry' },
  'ui-compose': { role: 'browser', why: 'the Options step and the Project step' },
};
