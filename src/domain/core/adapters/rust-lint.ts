/**
 * `code-style/rust-lint` adapter — the Rust family's `linter`
 * dimension.
 *
 * All three legs of this vertical's scope are free on Rust, and all
 * three needed verifying against real clippy 0.1.94 rather than
 * assumed:
 *
 *   - **naming case**: `non_snake_case` / `non_camel_case_types` are
 *     warn-by-default rustc lints, so plain `-D warnings` already
 *     promotes them.
 *   - **wildcard imports**: `clippy::wildcard_imports` is *not*
 *     warn-by-default — it lives in clippy's allow-by-default
 *     `pedantic` group. `-D warnings` alone let `use x::*` straight
 *     through; it needs its own explicit `-D`.
 *   - **doc comments on public API**: `missing_docs` is a rustc lint,
 *     also allow-by-default. Same fix, same reason.
 *
 * Both gaps are closed with command-line `-D` flags rather than a
 * `#![warn(...)]` attribute in the emitted `lib.rs` — functionally
 * equivalent, verified on the same scratch crate, and it keeps the
 * lint dimension from having to patch source `keel add module` may
 * rewrite later, the trap `jvm-format`'s module docs already name for
 * the JVM side. It costs the project no new dependency: clippy ships
 * with the toolchain, and the emitted devcontainer already installs
 * it.
 *
 * No config file, no patch: `linterCommandsFor` in `code-style.ts`
 * names the command directly, and `ci/rust-pipeline` wires it into CI.
 */

import { linterAdapter } from './code-style.js';
import type { Adapter } from '../../contract/composition.js';

export const RUST_LINT_ID = 'code-style/rust-lint';

export const rustLintAdapter: Adapter = linterAdapter(RUST_LINT_ID, ['lang.rust'], () => ({}));
