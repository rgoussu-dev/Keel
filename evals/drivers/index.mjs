/**
 * The driver registry — the one list of agents the rig can drive.
 *
 * One list, because two would drift: `run.mjs` resolves `--driver`
 * from it, and the verify suites sweep it to hold every driver to the
 * port's rules (config isolation, capability manifests). A driver
 * added to the CLI and not to the sweep is exactly the driver that
 * would quietly measure the operator's home directory.
 */

import { claudeCodeDriver } from './claude-code.mjs';
import { codexDriver } from './codex.mjs';

/** Driver id → driver. Claude Code is the reference; Codex proves the seam. */
export const DRIVERS = Object.freeze({
  'claude-code': claudeCodeDriver,
  codex: codexDriver,
});
