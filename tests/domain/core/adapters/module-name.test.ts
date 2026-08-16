/**
 * Tests for the module-name front door.
 *
 * The point of `parseModuleName` is that it is the *only* place a
 * bounded-context name is judged, so these tests are written as the
 * six spellings the name has to survive rather than as regex
 * exercises: each rejection case names the family that would have
 * broken, so a future widening has to argue with the family rather
 * than with the pattern.
 */

import { describe, expect, it } from 'vitest';
import {
  parseModuleName,
  toContextKey,
  toElementTag,
  type ModuleName,
} from '../../../../src/domain/core/adapters/module-name.js';
import {
  toCrateIdent,
  toCrateName,
} from '../../../../src/domain/core/adapters/rust-module-layout.js';

/** Unwraps an accepted name, failing loudly when it was rejected. */
function accepted(raw: string): ModuleName {
  const result = parseModuleName(raw);
  if (!result.ok) throw new Error(`expected '${raw}' to be accepted: ${result.error.message}`);
  return result.value;
}

/** Unwraps the rejection message, failing loudly when it was accepted. */
function rejected(raw: string): string {
  const result = parseModuleName(raw);
  if (result.ok) throw new Error(`expected '${raw}' to be rejected, got '${result.value}'`);
  expect(result.error.code).toBe('keel.invalid-module-name');
  return result.error.message;
}

describe('parseModuleName', () => {
  it('accepts a lowercase word and returns it unchanged', () => {
    expect(accepted('ordering')).toBe('ordering');
  });

  it('accepts digits after the first character', () => {
    expect(accepted('billing2')).toBe('billing2');
  });

  it('trims surrounding whitespace rather than rejecting it', () => {
    expect(accepted('  ordering  ')).toBe('ordering');
  });

  it('rejects an empty name with the usage line', () => {
    expect(rejected('   ')).toContain('keel add module <name>');
  });

  it('rejects a dash, which is illegal in a Go package clause', () => {
    expect(rejected('order-taking')).toContain('Go package clause');
  });

  it('suggests the squeezed form rather than applying it', () => {
    expect(rejected('order-taking')).toContain("Try 'ordertaking'");
  });

  it('rejects an underscore, which is illegal in a custom-element tag', () => {
    expect(rejected('order_taking')).toContain('element tag');
  });

  it('rejects uppercase, which is illegal in an npm package name', () => {
    expect(rejected('Ordering')).toContain('npm package name');
  });

  it('rejects a leading digit, which is illegal in every identifier spelling', () => {
    expect(rejected('2ordering')).toContain('digit');
  });

  it('rejects a name longer than the limit, naming the per-file cost', () => {
    expect(rejected('a'.repeat(33))).toContain('once per file');
  });

  it('accepts a name exactly at the limit', () => {
    expect(accepted('a'.repeat(32))).toHaveLength(32);
  });

  it.each(['main', 'type', 'object', 'impl', 'record'])(
    'rejects %s, a keyword in at least one target language',
    (name) => {
      expect(rejected(name)).toContain('reserved');
    },
  );

  it('rejects internal, whose Go meaning would hide the context from itself', () => {
    expect(rejected('internal')).toContain('reserved');
  });

  it.each(['modules', 'platform', 'application', 'domain', 'service', 'kernel'])(
    'rejects %s, a directory the layouts already own',
    (name) => {
      expect(rejected(name)).toContain('reserved');
    },
  );

  it('offers no suggestion when the squeezed form would itself be reserved', () => {
    expect(rejected('Main')).not.toContain('Try');
  });

  it('offers no suggestion when nothing survives the squeeze', () => {
    expect(rejected('---')).not.toContain('Try');
  });
});

describe('the accepted name in each of its six spellings', () => {
  const name = accepted('ordering');

  it('is a directory segment', () => {
    expect(`modules/${name}`).toBe('modules/ordering');
  });

  it('is a legal Go package clause — no dash survives validation', () => {
    expect(name).toMatch(/^[a-z][a-z0-9]*$/);
  });

  it('is a Cargo package name and its use identifier, via the existing helpers', () => {
    expect(toCrateName(`modules/${name}/domain/contract`)).toBe('ordering-domain-contract');
    expect(toCrateIdent(toCrateName(`modules/${name}/domain/contract`))).toBe(
      'ordering_domain_contract',
    );
  });

  it('is an npm package name under a scope', () => {
    expect(`@acme/${name}`).toBe('@acme/ordering');
  });

  it('is a JVM package segment', () => {
    expect(`com.acme.${name}`).toBe('com.acme.ordering');
  });

  it('is a custom-element tag prefix', () => {
    expect(toElementTag('acme', name, 'view')).toBe('acme-ordering-view');
  });

  it('is a context-key string', () => {
    expect(toContextKey('acme', name, 'service')).toBe('acme.ordering.service');
  });
});
