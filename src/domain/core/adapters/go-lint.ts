/**
 * `code-style/go-lint` adapter — the Go family's `linter` dimension.
 *
 * `go vet` ships with the toolchain the project already requires, so
 * like `go-format` this costs the project nothing. It also makes the
 * naming-case and wildcard-import legs of this vertical's scope moot
 * for Go: the language has no import-wildcard syntax at all, and `go
 * vet` doesn't check naming case (that is `golangci-lint`'s
 * `revive`/`exported` territory, a separately-argued follow-up — see
 * `docs/verticals/code-style.md`). What `go vet` buys today is
 * suspicious-construct detection (format-string mismatches, unreachable
 * code, lock-by-value, …), which is in scope for "static checks a
 * scaffolded project should pass" even though it is not one of this
 * vertical's three named legs.
 *
 * No config file, no patch: `linterCommandsFor` in `code-style.ts`
 * names the command directly, and `ci/go-pipeline` wires it into CI.
 */

import { linterAdapter } from './code-style.js';
import type { Adapter } from '../../contract/composition.js';

export const GO_LINT_ID = 'code-style/go-lint';

export const goLintAdapter: Adapter = linterAdapter(GO_LINT_ID, ['lang.go'], () => ({}));
