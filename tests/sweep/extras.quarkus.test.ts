/**
 * The weekly composition sweep's `extras` suite over the Quarkus family:
 * its presets, Kotlin's included, and the products whose backend is
 * one. The file's name is the family it takes, read off each preset's
 * catalog tags (`support/composition-sweep.ts`' `sweptBy`). What each
 * preset is held to is `support/extras-sweep.ts`'.
 */

import { describeExtrasSweep } from '../support/extras-sweep.js';

await describeExtrasSweep(import.meta.url);
