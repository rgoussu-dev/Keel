/**
 * Tests for the EOL helpers adapter patches share: detection of a
 * patched file's dominant line ending and conversion of LF-authored
 * patch fragments to it, so brownfield CRLF files (e.g. Windows
 * checkouts under `core.autocrlf`) keep uniform endings.
 */

import { describe, expect, it } from 'vitest';
import { eolOf, withEol } from '../../../src/domain/core/util.js';

describe('eolOf', () => {
  it('detects CRLF when the file carries it', () => {
    expect(eolOf('a\r\nb\r\n')).toBe('\r\n');
  });

  it('defaults to LF', () => {
    expect(eolOf('a\nb\n')).toBe('\n');
    expect(eolOf('single line, no terminator')).toBe('\n');
  });
});

describe('withEol', () => {
  it('round-trips LF fragments byte-identical for LF targets', () => {
    const fragment = 'line one\nline two\n';
    expect(withEol(fragment, '\n')).toBe(fragment);
  });

  it('converts LF-authored fragments to CRLF', () => {
    expect(withEol('line one\nline two\n', '\r\n')).toBe('line one\r\nline two\r\n');
  });

  it('leaves single-line fragments untouched', () => {
    expect(withEol('no newline here', '\r\n')).toBe('no newline here');
  });
});
