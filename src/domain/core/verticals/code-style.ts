/**
 * The `code-style` vertical — the layout contract a team stops
 * arguing about, wired so nobody has to configure it.
 *
 * Three dimensions, and the split between them is the whole design:
 *
 *   - `editor-baseline` is **universal**. One adapter, empty
 *     predicate, emitting `.editorconfig` + `.gitattributes` from
 *     keel's style model. This is the part that genuinely is
 *     language-independent — charset, line endings, final newline,
 *     and the per-language indent facts every editor honours.
 *   - `formatter` is **per stack family**, because that half is
 *     irreducibly per-ecosystem: `gofmt` has no options at all,
 *     rustfmt and Java's mainstream formatters ignore
 *     `.editorconfig` outright, and only ktlint treats it as
 *     primary config. One adapter per family renders that family's
 *     own dialect from the same numbers — see `adapters/code-style.ts`
 *     for why generation-time fan-out beats a runtime meta-formatter.
 *   - `linter` is **also per stack family**, and deliberately
 *     narrower: naming case, wildcard imports, and doc comments on
 *     public API — the free-tier subset of static analysis that costs
 *     no new dependency for Rust and Go, rides inside the existing
 *     Spotless block for the JVM family, and needs ESLint for the one
 *     family with no zero-dependency subset at all (web). Checkstyle,
 *     detekt and golangci-lint would extend this further; they are a
 *     separately-argued follow-up, not shipped here. See
 *     `adapters/code-style.ts` for `linterCommandsFor` and why the
 *     check is CI-only — no hook wiring, unlike the formatter.
 *
 * Installed by every stack, and addable brownfield with
 * `keel add code-style`. The adapters contribute their config files
 * as sentinel-delimited patches with seeds, so an existing
 * `.editorconfig` is layered onto rather than clobbered.
 *
 * Ordered **after** `walking-skeleton` in every stack's list: the
 * formatter adapters patch the build files the bootstrap emits, so
 * those files have to exist first. The `style.managed` /
 * `style.lint-managed` tags the vertical promotes then travel on the
 * manifest, which is how a later `keel add ci` knows to emit a
 * format-check / lint-check step.
 */

import { editorBaselineAdapter } from '../adapters/editor-baseline.js';
import { FORMATTER_DIMENSION, LINTER_DIMENSION } from '../adapters/code-style.js';
import { goFormatAdapter } from '../adapters/go-format.js';
import { goLintAdapter } from '../adapters/go-lint.js';
import { jvmFormatAdapter } from '../adapters/jvm-format.js';
import { jvmLintAdapter } from '../adapters/jvm-lint.js';
import { rustFormatAdapter } from '../adapters/rust-format.js';
import { rustLintAdapter } from '../adapters/rust-lint.js';
import { webFormatAdapter } from '../adapters/web-format.js';
import { webLintAdapter } from '../adapters/web-lint.js';
import type { Vertical } from '../../contract/composition.js';

export const codeStyleVertical: Vertical = {
  id: 'code-style',
  description:
    'Editor layout contract, the stack’s own formatter, and its free-tier static checks — from one style model.',
  dimensions: ['editor-baseline', FORMATTER_DIMENSION, LINTER_DIMENSION],
  adapters: [
    editorBaselineAdapter,
    jvmFormatAdapter,
    goFormatAdapter,
    rustFormatAdapter,
    webFormatAdapter,
    jvmLintAdapter,
    goLintAdapter,
    rustLintAdapter,
    webLintAdapter,
  ],
};
