/**
 * `code-style/jvm-lint` adapter — the JVM family's `linter` dimension,
 * in name only.
 *
 * The free-tier check this vertical adds for Java and Kotlin —
 * forbidding wildcard imports — already lives in `jvm-format.ts`'s
 * Spotless block, both for Kotlin (`ktlint`'s default ruleset ships
 * `standard:no-wildcard-imports`, true since #103, no change needed)
 * and for Java (`forbidWildcardImports()`, added alongside it). See
 * that module's docs for why: Spotless allows one `java`/`kotlin`
 * block per project, so a second lint-only block is not an option, and
 * folding the check into the existing one means it rides the build
 * `jvm-format` already patches at zero marginal cost — no second
 * `./gradlew`/`./mvnw` invocation, no new CI step, no risk of a lint
 * gate the hook doesn't already enforce.
 *
 * This adapter contributes no files or patches. It exists purely so
 * the resolver's dimension-coverage check — every entry in
 * `codeStyleVertical.dimensions` must be covered by a matching adapter
 * — sees `linter` satisfied for the JVM family, and so the manifest
 * records that this project went through the dimension at all.
 * `linterCommandsFor` in `code-style.ts` returns `undefined` for
 * `runtime.jvm` tags for the same reason: there is no command of its
 * own to gate CI on.
 */

import { linterAdapter } from './code-style.js';
import type { Adapter } from '../../contract/composition.js';

export const JVM_LINT_ID = 'code-style/jvm-lint';

export const jvmLintAdapter: Adapter = linterAdapter(JVM_LINT_ID, ['runtime.jvm'], () => ({}));
