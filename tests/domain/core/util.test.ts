/**
 * Tests for the helpers adapter patches share: detection of a patched
 * file's dominant line ending and conversion of LF-authored patch
 * fragments to it, so brownfield CRLF files (e.g. Windows checkouts
 * under `core.autocrlf`) keep uniform endings; and the reading of
 * source as code alone that the composition-root list readers scan.
 */

import { describe, expect, it } from 'vitest';
import { codeOnly, eolOf, withEol } from '../../../src/domain/core/util.js';

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

describe('codeOnly', () => {
  it('blanks the inside of each kind of literal, keeping its quotes and its length', () => {
    const source = [
      'listOf(Echo("https://a, b"), Tick(\'(\'), `x, ${y}`, Echo("say \\"hi\\", then"))',
      'val doc = """one, two"""',
    ].join('\n');
    const read = codeOnly(source);

    expect(read.code).toBe(
      [
        'listOf(Echo("            "), Tick(\' \'), `       `, Echo("                "))',
        'val doc = """        """',
      ].join('\n'),
    );
    expect(read.code).toHaveLength(source.length);
    expect(read.hasComment).toBe(false);
  });

  it('blanks each comment whole, line breaks kept, and says there was one', () => {
    const read = codeOnly('a(), // b, c\n/* d,\ne */ f()');

    expect(read.code).toBe('a(),        \n     \n     f()');
    expect(read.hasComment).toBe(true);
  });

  it('reads a comment opener inside a literal as the literal’s', () => {
    expect(codeOnly('Echo("https://example.com", "/*")').hasComment).toBe(false);
    expect(codeOnly("Echo('it\\'s') // it's").hasComment).toBe(true);
  });
});
