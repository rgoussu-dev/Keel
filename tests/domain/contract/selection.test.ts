/**
 * The `multi-select` answer encoding.
 *
 * A set question answers with a *string* — its chosen values joined
 * by `SELECTION_SEPARATOR` — so that `Prompt.ask` keeps returning
 * one, and every downstream consumer of an answer (sticky memory,
 * `--set`, the wizard's replay, `keel ui`'s form) stays untouched.
 * That only holds while the two ends agree, which is what this pins.
 */

import { describe, expect, it } from 'vitest';
import {
  SELECTION_SEPARATOR,
  decodeSelection,
  encodeSelection,
} from '../../../src/domain/contract/composition.js';

describe('multi-select answer encoding', () => {
  it('round-trips a chosen set through a single string', () => {
    expect(decodeSelection(encodeSelection(['cli', 'server-http']))).toEqual([
      'cli',
      'server-http',
    ]);
  });

  it('encodes the empty set as the empty string, which decodes back to nothing', () => {
    expect(encodeSelection([])).toBe('');
    expect(decodeSelection('')).toEqual([]);
  });

  it('drops blank entries rather than reading a stray separator as a value', () => {
    expect(decodeSelection(`${SELECTION_SEPARATOR}cli${SELECTION_SEPARATOR}`)).toEqual(['cli']);
  });

  it('tolerates the spacing a hand-typed --set answer arrives with', () => {
    expect(decodeSelection('persistence, iac ,distribution')).toEqual([
      'persistence',
      'iac',
      'distribution',
    ]);
  });

  it('preserves the order it was given, so the same set encodes the same way', () => {
    expect(encodeSelection(['a', 'b'])).not.toBe(encodeSelection(['b', 'a']));
    expect(decodeSelection(encodeSelection(['a', 'b']))).toEqual(['a', 'b']);
  });
});
