/**
 * `code-style/go-format` adapter — the Go family's formatter.
 *
 * Go is the one family that needs **no configuration file at all**,
 * and that is a property of the ecosystem rather than an omission
 * here: `gofmt` has never had a style option. The `-tabs` and
 * `-tabwidth` flags were removed outright, so tabs for indentation
 * and blanks for alignment are not negotiable and there is nothing
 * for keel to render.
 *
 * The adapter therefore contributes only the shared wiring — the
 * `gofmt -w .` step in the pre-commit hook — and the emitted
 * `.editorconfig` records the same facts (`indent_style = tab`, no
 * `max_line_length`) so editors agree with the formatter instead of
 * fighting it.
 *
 * Note what this deliberately is *not*: `gofumpt` and `golangci-lint`
 * are both defensible upgrades, and both are extra binaries the
 * project would have to provision. This vertical is about the layout
 * contract, not static analysis; `gofmt` ships with the toolchain the
 * project already requires, so the vertical costs a Go project
 * nothing.
 */

import { formatterAdapter } from './code-style.js';
import type { Adapter } from '../../contract/composition.js';

export const GO_FORMAT_ID = 'code-style/go-format';

export const goFormatAdapter: Adapter = formatterAdapter(GO_FORMAT_ID, ['lang.go'], () => ({}));
