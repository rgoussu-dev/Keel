/**
 * The `code-style` vertical — the layout contract a team stops
 * arguing about, wired so nobody has to configure it.
 *
 * Two dimensions, and the split between them is the whole design:
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
 *
 * Installed by every stack, and addable brownfield with
 * `keel add code-style`. The adapters contribute their config files
 * as sentinel-delimited patches with seeds, so an existing
 * `.editorconfig` is layered onto rather than clobbered.
 *
 * Ordered **after** `walking-skeleton` in every stack's list: the
 * formatter adapters patch the build files the bootstrap emits, so
 * those files have to exist first. The `style.managed` tag the
 * vertical promotes then travels on the manifest, which is how a
 * later `keel add ci` knows to emit a format-check step.
 */

import { editorBaselineAdapter } from '../adapters/editor-baseline.js';
import { FORMATTER_DIMENSION } from '../adapters/code-style.js';
import { goFormatAdapter } from '../adapters/go-format.js';
import { jvmFormatAdapter } from '../adapters/jvm-format.js';
import { rustFormatAdapter } from '../adapters/rust-format.js';
import { webFormatAdapter } from '../adapters/web-format.js';
import type { Vertical } from '../../contract/composition.js';

export const codeStyleVertical: Vertical = {
  id: 'code-style',
  description: 'Editor layout contract plus the stack’s own formatter, from one style model.',
  dimensions: ['editor-baseline', FORMATTER_DIMENSION],
  adapters: [
    editorBaselineAdapter,
    jvmFormatAdapter,
    goFormatAdapter,
    rustFormatAdapter,
    webFormatAdapter,
  ],
};
