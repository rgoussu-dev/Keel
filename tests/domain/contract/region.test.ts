/**
 * The owned-region contract: the one section-replacing transform
 * every sentinel idiom in keel now runs through, the check the
 * engine runs on a patch that declares its regions, and the patch
 * builder that ties the two together.
 */

import { describe, expect, it } from 'vitest';
import {
  assertRegion,
  confinementOf,
  escapesRegions,
  hashRegion,
  locateRegion,
  markdownRegion,
  outsideRegions,
  regionPatch,
  upsertRegion,
} from '../../../src/domain/contract/region.js';

const md = markdownRegion('stack-runbook');
const sh = hashRegion('format-step');

describe('region markers', () => {
  it('spell keel:<owner> between the comment delimiters of the syntax', () => {
    expect(md).toEqual({
      begin: '<!-- keel:stack-runbook:begin -->',
      end: '<!-- keel:stack-runbook:end -->',
    });
    expect(sh).toEqual({ begin: '# keel:format-step:begin', end: '# keel:format-step:end' });
  });

  it('assertRegion refuses what a plugin could hand over in any shape', () => {
    expect(() => assertRegion(null, 'x')).toThrow(/needs a non-empty 'begin' and 'end'/);
    expect(() => assertRegion({ begin: 'a' }, 'x')).toThrow(/needs a non-empty/);
    expect(() => assertRegion({ begin: ' ', end: 'b' }, 'x')).toThrow(/needs a non-empty/);
    expect(() => assertRegion({ begin: 'a', end: 'a' }, "adapter 'p'")).toThrow(
      /adapter 'p': a region's 'begin' and 'end' markers must differ/,
    );
    expect(assertRegion({ begin: 'a', end: 'b', extra: 1 }, 'x')).toEqual({ begin: 'a', end: 'b' });
  });
});

describe('locateRegion', () => {
  it('is null without markers and a span over both with them', () => {
    expect(locateRegion('plain\n', md, 'f')).toBeNull();
    const text = `head\n${md.begin}\nbody\n${md.end}\ntail\n`;
    const span = locateRegion(text, md, 'f')!;
    expect(text.slice(span.begin, span.end)).toBe(`${md.begin}\nbody\n${md.end}`);
  });

  it('throws with the fix, naming the file, on a broken or reversed pair', () => {
    expect(() => locateRegion(`${md.begin}\norphan\n`, md, 'AGENTS.md')).toThrow(
      /^AGENTS\.md: the sentinels are broken — expected '<!-- keel:stack-runbook:begin -->' followed by/,
    );
    expect(() => locateRegion(`${md.end}\n${md.begin}\n`, md, 'AGENTS.md')).toThrow(
      /sentinels are broken/,
    );
  });
});

describe('upsertRegion', () => {
  it('lands a tight region after the existing content, and alone in empty content', () => {
    expect(upsertRegion('', sh, 'step')).toBe(`${sh.begin}\nstep\n${sh.end}\n`);
    expect(upsertRegion('   \n', sh, 'step')).toBe(`${sh.begin}\nstep\n${sh.end}\n`);
    expect(upsertRegion('root = true\n', sh, 'step')).toBe(
      `root = true\n\n${sh.begin}\nstep\n${sh.end}\n`,
    );
  });

  it('pads a Markdown region with blank lines, and prepends when told to', () => {
    expect(upsertRegion('# Spec\n', md, 'body', { padding: 'blank' })).toBe(
      `# Spec\n\n${md.begin}\n\nbody\n\n${md.end}\n`,
    );
    expect(upsertRegion('jobs:\n', sh, 'image: x', { whenAbsent: 'prepend' })).toBe(
      `${sh.begin}\nimage: x\n${sh.end}\n\njobs:\n`,
    );
  });

  it('keeps a markerless text untouched when the slot must already exist', () => {
    expect(upsertRegion('no slot\n', sh, 'step', { whenAbsent: 'keep' })).toBe('no slot\n');
  });

  it('replaces exactly the span between the markers and nothing around it', () => {
    const before = `head\n${sh.begin}\nold\n${sh.end}\ntail`;
    expect(upsertRegion(before, sh, 'new')).toBe(`head\n${sh.begin}\nnew\n${sh.end}\ntail`);
    const glued = `head\n${sh.begin}\nold\n${sh.end}`;
    expect(upsertRegion(glued, sh, 'new')).toBe(`head\n${sh.begin}\nnew\n${sh.end}`);
  });

  it('is its own fixed point', () => {
    const once = upsertRegion('# Spec\n', md, 'stable', { padding: 'blank' });
    expect(upsertRegion(once, md, 'stable', { padding: 'blank' })).toBe(once);
  });

  it('round-trips CRLF text with one line ending', () => {
    const out = upsertRegion('# Spec\r\n\r\nBody.\r\n', md, 'a\nb', { padding: 'blank' });
    expect(out).toBe(`# Spec\r\n\r\nBody.\r\n\r\n${md.begin}\r\n\r\na\r\nb\r\n\r\n${md.end}\r\n`);
    expect(out).not.toMatch(/[^\r]\n/);
  });

  it('gives a CRLF-authored body the file’s line ending, never a doubled one', () => {
    const crlfBody = 'a\r\nb';
    expect(upsertRegion('# Spec\r\n', md, crlfBody, { padding: 'blank' })).toBe(
      `# Spec\r\n\r\n${md.begin}\r\n\r\na\r\nb\r\n\r\n${md.end}\r\n`,
    );
    expect(upsertRegion('# Spec\n', md, crlfBody, { padding: 'blank' })).toBe(
      `# Spec\n\n${md.begin}\n\na\nb\n\n${md.end}\n`,
    );
  });

  it('names the caller’s location in the broken-pair message', () => {
    expect(() => upsertRegion(`${sh.begin}\n`, sh, 'x', { where: 'code-style' })).toThrow(
      /^code-style: the sentinels are broken/,
    );
  });
});

describe('outsideRegions / escapesRegions', () => {
  const other = hashRegion('other');

  it('cuts every located region out, markers included, and leaves the rest', () => {
    const text = `a\n${sh.begin}\nx\n${sh.end}\nb\n${other.begin}\ny\n${other.end}\nc\n`;
    expect(outsideRegions(text, [sh, other], 'f')).toBe('a\n\nb\n\nc\n');
    expect(outsideRegions('a\nb\n', [sh], 'f')).toBe('a\nb\n');
  });

  it('a transform confined to its region does not escape — replacing, landing or prepending it', () => {
    const base = `a\n${sh.begin}\nx\n${sh.end}\nb\n`;
    expect(escapesRegions(base, upsertRegion(base, sh, 'changed'), [sh], 'f')).toBe(false);
    expect(escapesRegions('a\nb\n', upsertRegion('a\nb\n', sh, 'new'), [sh], 'f')).toBe(false);
    expect(
      escapesRegions('a\nb', upsertRegion('a\nb', sh, 'new', { whenAbsent: 'prepend' }), [sh], 'f'),
    ).toBe(false);
    expect(escapesRegions('', upsertRegion('', sh, 'new'), [sh], 'f')).toBe(false);
  });

  it('a transform that touched prose outside its region escapes', () => {
    const base = `a\n${sh.begin}\nx\n${sh.end}\nb\n`;
    const escaped = upsertRegion(base, sh, 'changed').replace('b\n', 'B\n');
    expect(escapesRegions(base, escaped, [sh], 'f')).toBe(true);
    expect(escapesRegions(base, `${base}appended\n`, [sh], 'f')).toBe(true);
    // Indentation is content too — only the file's own edges are forgiven.
    const inner = `a\nz\n${sh.begin}\nx\n${sh.end}\nb\n`;
    expect(escapesRegions(inner, inner.replace('z\n', '  z\n'), [sh], 'f')).toBe(true);
    // The file's edges are forgiven only for a region the transform landed.
    expect(escapesRegions('a\nb', `\n${upsertRegion('a\nb', sh, 'new')}\n`, [sh], 'f')).toBe(false);
    expect(confinementOf(inner, `\n${inner}\n`, [sh], 'f')).toBe('outside');
  });

  it('holds whitespace beside a region at the file edge as content when the region was already there', () => {
    const atEnd = `user\n${sh.begin}\nx\n${sh.end}\n`;
    expect(confinementOf(atEnd, atEnd.replace('user\n', 'user \n'), [sh], 'f')).toBe('outside');
    expect(confinementOf(atEnd, `${atEnd}\n`, [sh], 'f')).toBe('outside');
    const atStart = `${sh.begin}\nx\n${sh.end}\nuser\n`;
    expect(confinementOf(atStart, atStart.replace('\nuser', '\n user'), [sh], 'f')).toBe('outside');
    expect(confinementOf(atStart, `\n${atStart}`, [sh], 'f')).toBe('outside');
    expect(confinementOf(atEnd, upsertRegion(atEnd, sh, 'y'), [sh], 'f')).toBeNull();
  });

  it('a region the file carried that the transform removed escapes; a markerless file kept markerless does not', () => {
    const base = `a\n${sh.begin}\nx\n${sh.end}\nb\n`;
    expect(confinementOf(base, 'a\nb\n', [sh], 'f')).toBe('removed');
    expect(confinementOf(`${sh.begin}\nx\n${sh.end}\n`, '', [sh], 'f')).toBe('removed');
    const markerless = 'set -e\n';
    const kept = upsertRegion(markerless, sh, 'fmt', { whenAbsent: 'keep' });
    expect(confinementOf(markerless, kept, [sh], 'f')).toBeNull();
  });

  it('a pair the transform broke is its escape; a pair broken in the base is the file’s fix-it', () => {
    const base = `a\n${sh.begin}\nx\n${sh.end}\n`;
    expect(confinementOf(base, base.replace(sh.end, ''), [sh], 'f')).toBe('broken');
    expect(() => confinementOf(`a\n${sh.begin}\n`, 'a\n', [sh], 'f')).toThrow(
      /sentinels are broken/,
    );
  });

  it('a second region on the same file is its own boundary', () => {
    const base = `${sh.begin}\nx\n${sh.end}\n${other.begin}\ny\n${other.end}\n`;
    const next = upsertRegion(base, other, 'changed');
    expect(escapesRegions(base, next, [sh], 'f')).toBe(true);
    expect(escapesRegions(base, next, [other], 'f')).toBe(false);
    expect(escapesRegions(base, next, [sh, other], 'f')).toBe(false);
  });
});

describe('regionPatch', () => {
  it('declares its region and carries seed and mode through', () => {
    const patch = regionPatch({
      target: '.claude/hooks/x.sh',
      region: sh,
      body: 'step',
      seed: '#!/bin/sh\n',
      mode: 0o755,
    });
    expect(patch.target).toBe('.claude/hooks/x.sh');
    expect(patch.regions).toEqual([sh]);
    expect(patch.seed).toBe('#!/bin/sh\n');
    expect(patch.mode).toBe(0o755);
    expect(patch.apply(patch.seed!)).toBe(`#!/bin/sh\n\n${sh.begin}\nstep\n${sh.end}\n`);
  });

  it('leaves seed and mode absent rather than undefined when unset', () => {
    const patch = regionPatch({ target: 'f', region: sh, body: 'b' });
    expect('seed' in patch).toBe(false);
    expect('mode' in patch).toBe(false);
  });

  it('names the target in the broken-pair message unless told where', () => {
    const patch = regionPatch({ target: 'AGENTS.md', region: md, body: 'b' });
    expect(() => patch.apply(`${md.begin}\n`)).toThrow(/^AGENTS\.md: the sentinels are broken/);
    const named = regionPatch({ target: 'AGENTS.md', region: md, body: 'b', where: 'kit' });
    expect(() => named.apply(`${md.begin}\n`)).toThrow(/^kit: the sentinels are broken/);
  });
});
