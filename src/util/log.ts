import chalk from 'chalk';
import type { Logger } from '../domain/contract/ports/logger.js';

/**
 * Re-export of the Logger port so existing importers of this module
 * keep compiling while the implementation migrates to
 * `infrastructure/`.
 */
export type { Logger };

const DEBUG = process.env['KEEL_DEBUG'] === '1';

export const logger: Logger = {
  info: (m) => console.error(chalk.cyan('info'), m),
  success: (m) => console.error(chalk.green('ok  '), m),
  warn: (m) => console.error(chalk.yellow('warn'), m),
  error: (m) => console.error(chalk.red('err '), m),
  debug: (m) => {
    if (DEBUG) console.error(chalk.gray('dbg '), m);
  },
};
