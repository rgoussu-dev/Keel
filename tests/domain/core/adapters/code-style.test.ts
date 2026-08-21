/**
 * Tests for the style model and the `editor-baseline` adapter.
 *
 * The assertions worth having here are the ones that catch a *lie*:
 * an `.editorconfig` claiming spaces for Go, or a width for a
 * language whose formatter has none. Those are the failure mode the
 * per-language model exists to prevent, so they are asserted
 * directly rather than through a snapshot.
 */

import { describe, expect, it } from 'vitest';
import {
  EDITORCONFIG_TARGET,
  GITATTRIBUTES_TARGET,
  LINT_MANAGED_TAG,
  STYLE_BEGIN,
  STYLE_END,
  STYLE_MANAGED_TAG,
  editorConfigSeed,
  linterAdapter,
  linterCommandsFor,
  renderEditorConfig,
  renderGitAttributes,
  styleFor,
  upsertStyleSection,
} from '../../../../src/domain/core/adapters/code-style.js';
import {
  EDITOR_BASELINE_ID,
  editorBaselineAdapter,
} from '../../../../src/domain/core/adapters/editor-baseline.js';
import type { Ctx } from '../../../../src/domain/contract/composition.js';

/** The adapter reads nothing off the ctx, so a cast keeps this honest. */
const noCtx = undefined as unknown as Ctx;

describe('style model', () => {
  it('gives Go hard tabs and no line width, because gofmt has neither knob', () => {
    const go = styleFor('go');
    expect(go.indentStyle).toBe('tab');
    expect(go.lineWidth).toBeUndefined();
  });

  it('matches the indentation keel’s templates already emit', () => {
    // Installing the vertical must reformat nothing; these are the
    // widths the emitted Java/Kotlin, Rust and TypeScript trees use.
    expect(styleFor('jvm').indentSize).toBe(4);
    expect(styleFor('rust').indentSize).toBe(4);
    expect(styleFor('web').indentSize).toBe(2);
  });
});

describe('renderEditorConfig', () => {
  const rendered = renderEditorConfig();

  it('emits tab_width (not indent_size) for the tab-indented language', () => {
    const goSection = rendered.slice(rendered.indexOf('[*.go]'));
    expect(goSection).toContain('indent_style = tab');
    expect(goSection).toContain('tab_width = 4');
    expect(goSection.slice(0, goSection.indexOf('[', 1))).not.toContain('indent_size');
  });

  it('never claims a max_line_length for Go', () => {
    const goSection = rendered.slice(rendered.indexOf('[*.go]'));
    expect(goSection.slice(0, goSection.indexOf('[', 1))).not.toContain('max_line_length');
  });

  it('keeps trailing whitespace in Markdown, where it is a hard break', () => {
    expect(rendered).toContain('[*.md]\ntrim_trailing_whitespace = false');
  });

  it('carries the cross-toolchain baseline every formatter agrees on', () => {
    expect(rendered).toContain('end_of_line = lf');
    expect(rendered).toContain('insert_final_newline = true');
    expect(rendered).toContain('charset = utf-8');
  });

  it('states the JVM width prince-of-space and ktlint are configured to', () => {
    const jvm = rendered.slice(rendered.indexOf('[{*.java,*.kt,*.kts}]'));
    expect(jvm).toContain('indent_size = 4');
    expect(jvm).toContain('max_line_length = 120');
  });
});

describe('upsertStyleSection', () => {
  const body = 'indent_size = 4';

  it('seeds a section into empty content without leading blank lines', () => {
    expect(upsertStyleSection('', body)).toBe(`${STYLE_BEGIN}\n${body}\n${STYLE_END}\n`);
  });

  it('appends after a user’s own rules rather than replacing them', () => {
    const existing = 'root = true\n\n[*]\nindent_size = 8\n';
    const out = upsertStyleSection(existing, body);
    expect(out).toContain('indent_size = 8');
    expect(out.indexOf('indent_size = 8')).toBeLessThan(out.indexOf(STYLE_BEGIN));
  });

  it('is idempotent — re-applying replaces only the managed section', () => {
    const once = upsertStyleSection('root = true\n', body);
    expect(upsertStyleSection(once, body)).toBe(once);
  });

  it('replaces a stale managed section in place, preserving the tail', () => {
    const existing = `head\n\n${STYLE_BEGIN}\nold = 1\n${STYLE_END}\ntail\n`;
    const out = upsertStyleSection(existing, body);
    expect(out).toContain('head');
    expect(out).toContain('tail');
    expect(out).toContain(body);
    expect(out).not.toContain('old = 1');
  });

  it('throws with the fix when the sentinels were hand-edited apart', () => {
    expect(() => upsertStyleSection(`${STYLE_BEGIN}\nno end marker\n`, body)).toThrow(
      /sentinels are broken/,
    );
  });
});

describe('renderGitAttributes', () => {
  it('normalises text to LF but keeps the batch wrappers CRLF', () => {
    const rendered = renderGitAttributes();
    expect(rendered).toContain('* text=auto eol=lf');
    expect(rendered).toContain('*.bat text eol=crlf');
    expect(rendered).toContain('gradlew text eol=lf');
  });

  it('marks the wrapper jar binary so git never line-ending-mangles it', () => {
    expect(renderGitAttributes()).toContain('*.jar binary');
  });
});

describe('editor-baseline adapter', () => {
  it('declares the right vertical, coverage, and universal predicate', () => {
    expect(editorBaselineAdapter.id).toBe(EDITOR_BASELINE_ID);
    expect(editorBaselineAdapter.vertical).toBe('code-style');
    expect(editorBaselineAdapter.covers).toEqual(['editor-baseline']);
    expect(editorBaselineAdapter.predicate).toEqual({});
    expect(editorBaselineAdapter.questions ?? []).toEqual([]);
  });

  it('contributes both files as seeded patches, so brownfield never clobbers', async () => {
    const contribution = await editorBaselineAdapter.contribute(noCtx);
    expect(contribution.files ?? []).toEqual([]);
    expect(contribution.actions ?? []).toEqual([]);
    const targets = (contribution.patches ?? []).map((p) => p.target);
    expect(targets).toEqual([EDITORCONFIG_TARGET, GITATTRIBUTES_TARGET]);
    for (const patch of contribution.patches ?? []) {
      expect(patch.seed, `${patch.target} must seed`).toBeDefined();
    }
  });

  it('promotes the tag the hook and pipeline wiring key on', async () => {
    const contribution = await editorBaselineAdapter.contribute(noCtx);
    expect(contribution.tagsAdd).toEqual([STYLE_MANAGED_TAG]);
  });

  it('seeds an .editorconfig whose root declaration precedes every section', async () => {
    const seed = editorConfigSeed();
    expect(seed.startsWith('root = true')).toBe(true);
    expect(seed.indexOf('root = true')).toBeLessThan(seed.indexOf('['));
  });

  it('applies onto a CRLF file without rewriting its line endings', async () => {
    const contribution = await editorBaselineAdapter.contribute(noCtx);
    const patch = (contribution.patches ?? [])[0];
    const out = patch?.apply('root = true\r\n');
    expect(out).toContain('\r\n');
    expect(out).not.toMatch(/[^\r]\n/);
  });
});

describe('linterCommandsFor', () => {
  it('returns undefined for the JVM family — the check rides inside spotlessCheck', () => {
    expect(linterCommandsFor(['lang.java', 'runtime.jvm', 'pkg.gradle'])).toBeUndefined();
    expect(linterCommandsFor(['lang.kotlin', 'runtime.jvm', 'pkg.maven'])).toBeUndefined();
  });

  it('gives Go a plain go vet, no new dependency', () => {
    expect(linterCommandsFor(['lang.go', 'pkg.go-modules'])).toEqual({ check: 'go vet ./...' });
  });

  it('promotes clippy’s allow-by-default lints to hard errors for Rust', () => {
    // wildcard_imports (pedantic group) and missing_docs are both
    // allow-by-default — verified against real clippy 0.1.94, where
    // `-D warnings` alone let both straight through.
    expect(linterCommandsFor(['lang.rust', 'pkg.cargo'])).toEqual({
      check:
        'cargo clippy --workspace --all-targets -- -D warnings -D missing_docs -D clippy::wildcard_imports',
    });
  });

  it('runs ESLint directly rather than through a package.json script', () => {
    // "lint" is already the depcruise architecture-lint script on the
    // modulith layouts; a same-named script would silently never run.
    expect(linterCommandsFor(['lang.typescript', 'pkg.npm'])).toEqual({
      check: 'npm exec eslint .',
    });
    expect(linterCommandsFor(['lang.typescript', 'pkg.pnpm'])).toEqual({
      check: 'pnpm exec eslint .',
    });
  });

  it('returns undefined for a tag set no family matches', () => {
    expect(linterCommandsFor(['lang.cobol'])).toBeUndefined();
  });
});

describe('linterAdapter', () => {
  const noopAdapter = linterAdapter('test/lint', ['lang.go'], () => ({}));

  it('declares the linter dimension, the given predicate, and no hook wiring', () => {
    expect(noopAdapter.vertical).toBe('code-style');
    expect(noopAdapter.covers).toEqual(['linter']);
    expect(noopAdapter.predicate).toEqual({ requires: ['lang.go'] });
  });

  it('promotes style.lint-managed even when the spec contributes nothing', async () => {
    const contribution = await noopAdapter.contribute(noCtx);
    expect(contribution.files).toEqual([]);
    expect(contribution.patches).toEqual([]);
    expect(contribution.tagsAdd).toEqual([LINT_MANAGED_TAG]);
  });

  it('passes through files and patches the spec returns', async () => {
    const withContent = linterAdapter('test/lint-files', ['lang.typescript'], () => ({
      files: [{ path: 'eslint.config.js', content: '// x' }],
      patches: [{ target: 'package.json', apply: (e: string) => e }],
    }));
    const contribution = await withContent.contribute(noCtx);
    expect(contribution.files).toHaveLength(1);
    expect(contribution.patches).toHaveLength(1);
    expect(contribution.tagsAdd).toEqual([LINT_MANAGED_TAG]);
  });
});
