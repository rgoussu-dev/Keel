/**
 * Canonical fake for the Logger port: records every line, prints
 * nothing. Tests assert on `entries` or ignore it entirely.
 */

import type { Logger } from '../../domain/contract/ports/logger.js';

/** A recorded log line. */
export interface LogEntry {
  readonly level: 'info' | 'success' | 'warn' | 'error' | 'debug';
  readonly message: string;
}

/** Logger fake that captures lines in memory. */
export class FakeLogger implements Logger {
  readonly entries: LogEntry[] = [];

  info(msg: string): void {
    this.entries.push({ level: 'info', message: msg });
  }
  success(msg: string): void {
    this.entries.push({ level: 'success', message: msg });
  }
  warn(msg: string): void {
    this.entries.push({ level: 'warn', message: msg });
  }
  error(msg: string): void {
    this.entries.push({ level: 'error', message: msg });
  }
  debug(msg: string): void {
    this.entries.push({ level: 'debug', message: msg });
  }

  /** Messages recorded at the given level, in order. */
  messages(level: LogEntry['level']): readonly string[] {
    return this.entries.filter((e) => e.level === level).map((e) => e.message);
  }
}
