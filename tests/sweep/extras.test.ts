/**
 * The weekly composition sweep's `extras` suite over every family no
 * file beside this one takes — Go, Rust, TypeScript and the web
 * components today — and the products whose backend is one of them.
 * A file `extras.<family>.test.ts` beside it takes its family away
 * into a file of its own, with no edit here
 * (`support/composition-sweep.ts`' `sweptBy`). This file alone holds
 * the guard on `KEEL_SWEEP_STACKS`. What each preset is held to is
 * `support/extras-sweep.ts`'.
 */

import { describeExtrasSweep } from '../support/extras-sweep.js';

await describeExtrasSweep(import.meta.url);
