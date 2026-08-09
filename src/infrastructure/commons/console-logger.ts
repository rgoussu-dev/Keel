/**
 * Console adapter for the Logger port. Writes to stderr so stdout
 * stays clean for structured output; colors via chalk. Debug lines
 * appear only when `KEEL_DEBUG=1`.
 */

import chalk from 'chalk';
import type { Logger } from '../../domain/contract/ports/logger.js';

const DEBUG = process.env['KEEL_DEBUG'] === '1';

/** The stderr logger the CLI wires by default. */
export const consoleLogger: Logger = {
  info: (m) => console.error(chalk.cyan('info'), m),
  success: (m) => console.error(chalk.green('ok  '), m),
  warn: (m) => console.error(chalk.yellow('warn'), m),
  error: (m) => console.error(chalk.red('err '), m),
  debug: (m) => {
    if (DEBUG) console.error(chalk.gray('dbg '), m);
  },
};
