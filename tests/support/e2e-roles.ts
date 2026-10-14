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
 *
 * A suite with a role that scaffolds through `e2eMediator` names the
 * cells it seeds, as the paths golden keys them, and the e2e job holds
 * it to them as it holds a proving suite to its rows (roadmap T.2c).
 */

/** Why a suite proves no cell. */
export type E2eRole = 'variant' | 'aspect' | 'no-build' | 'browser';

/** A suite's role, and the one line that says what it does instead. */
export interface SuiteRole {
  readonly role: E2eRole;
  readonly why: string;
  /**
   * The cells the suite scaffolds in-process, as the paths golden keys
   * them, though it proves none. Absent where it scaffolds none that
   * way, as in `ui-stack-finder` and `ui-plugin-stack`, whose Generate
   * runs in the `keel ui` they spawn.
   */
  readonly seeds?: readonly string[];
}

const modulith = (stack: string, buildSystem?: string): string =>
  `keel new --stack ${stack}${buildSystem === undefined ? '' : ` --build-system ${buildSystem}`} --module-layout modulith`;

const addModule = (stack: string, buildSystem?: string): SuiteRole => ({
  role: 'variant',
  why: '`keel add module` rewrites the build and wiring files before the only build',
  seeds: [modulith(stack, buildSystem)],
});

const persistence = (stack: string, buildSystem?: string): SuiteRole => ({
  role: 'variant',
  why: 'persistence is added to the scaffold before it builds',
  seeds: [modulith(stack, buildSystem)],
});

/** Each suite that proves no cell, by its file's name less `.test.ts`. */
export const E2E_ROLES: Readonly<Record<string, SuiteRole>> = {
  'add-module-quarkus-rest-gradle': addModule('quarkus-rest', 'gradle'),
  'add-module-quarkus-rest-maven': addModule('quarkus-rest', 'maven'),
  'add-module-quarkus-rest-kotlin-gradle': addModule('quarkus-rest-kotlin', 'gradle'),
  'add-module-quarkus-rest-kotlin-maven': addModule('quarkus-rest-kotlin', 'maven'),
  'add-module-quarkus-cli-gradle': addModule('quarkus-cli', 'gradle'),
  'add-module-quarkus-cli-maven': addModule('quarkus-cli', 'maven'),
  'add-module-quarkus-cli-kotlin-gradle': addModule('quarkus-cli-kotlin', 'gradle'),
  'add-module-quarkus-cli-kotlin-maven': addModule('quarkus-cli-kotlin', 'maven'),
  'add-module-spring-rest-gradle': addModule('spring-rest', 'gradle'),
  'add-module-spring-rest-maven': addModule('spring-rest', 'maven'),
  'add-module-spring-rest-kotlin-gradle': addModule('spring-rest-kotlin', 'gradle'),
  'add-module-spring-rest-kotlin-maven': addModule('spring-rest-kotlin', 'maven'),
  'add-module-spring-cli-gradle': addModule('spring-cli', 'gradle'),
  'add-module-spring-cli-maven': addModule('spring-cli', 'maven'),
  'add-module-spring-cli-kotlin-gradle': addModule('spring-cli-kotlin', 'gradle'),
  'add-module-spring-cli-kotlin-maven': addModule('spring-cli-kotlin', 'maven'),
  'add-module-micronaut-rest-gradle': addModule('micronaut-rest', 'gradle'),
  'add-module-micronaut-rest-maven': addModule('micronaut-rest', 'maven'),
  'add-module-micronaut-rest-kotlin-gradle': addModule('micronaut-rest-kotlin', 'gradle'),
  'add-module-micronaut-rest-kotlin-maven': addModule('micronaut-rest-kotlin', 'maven'),
  'add-module-micronaut-cli-gradle': addModule('micronaut-cli', 'gradle'),
  'add-module-micronaut-cli-maven': addModule('micronaut-cli', 'maven'),
  'add-module-micronaut-cli-kotlin-gradle': addModule('micronaut-cli-kotlin', 'gradle'),
  'add-module-micronaut-cli-kotlin-maven': addModule('micronaut-cli-kotlin', 'maven'),
  'add-module-go': addModule('go-cli'),
  'add-module-rust': addModule('rust-cli'),
  'add-module-ts': addModule('ts-http', 'npm'),
  'add-module-wc': addModule('web-components', 'npm'),
  'modulith-persistence': persistence('quarkus-rest', 'gradle'),
  'modulith-persistence-mariadb': persistence('quarkus-rest', 'gradle'),
  'modulith-go-persistence': persistence('go-http'),
  'modulith-go-persistence-liquibase': persistence('go-http'),
  'modulith-rust-persistence': persistence('rust-http'),
  'code-style-jvm': {
    role: 'aspect',
    why: "the `code-style` format pass on `walking-skeleton`'s cell, which that suite builds",
    seeds: ['keel new --stack quarkus-cli --build-system gradle --module-layout basic'],
  },
  'dev-compose': {
    role: 'no-build',
    why: 'fakes every deferred action and boots the dev database alone',
    seeds: [modulith('quarkus-cli-rest', 'gradle')],
  },
  'ui-stack-finder': { role: 'browser', why: 'the greenfield stepper, in an empty directory' },
  'ui-plugin-stack': { role: 'browser', why: 'a stack a keel plugin on disk registers' },
  'ui-refusal': {
    role: 'browser',
    why: 'what a scaffolded project cannot carry',
    seeds: ['keel new --stack ts-cli --build-system npm --module-layout basic'],
  },
  'ui-compose': {
    role: 'browser',
    why: 'the Options step and the Project step',
    seeds: [
      'keel new --stack ts-http --build-system npm --module-layout basic',
      'keel new --stack quarkus-cli --build-system gradle --module-layout basic',
      'keel new --stack fullstack-ts --build-system backend=npm,frontend=npm --layout monorepo',
      // The page's own Generate, answered in-process from the body it posts.
      'keel new --stack fullstack-ts --build-system backend=npm,frontend=npm --layout polyrepo',
    ],
  },
};
