/**
 * Shared machinery of the `code-style` vertical — keel's **single
 * source of style truth**.
 *
 * The honest reading of the 2026 landscape is that there is no
 * runtime "one config to rule them all": `.editorconfig` reaches the
 * actual formatter in only two of the five stack families keel emits
 * (Kotlin, where ktlint treats it as its *primary* config, and the
 * web family, where Prettier reads a five-property subset natively).
 * Java's mainstream formatters, `gofmt` and `rustfmt` all ignore it
 * outright — `gofmt` has no options at all, and rustfmt closed the
 * request unimplemented.
 *
 * A scaffolder does not need the runtime layer. keel holds one style
 * model here and **fans it out at generation time** into every
 * dialect that matters: `.editorconfig` for the editors, and each
 * family's own formatter config rendered from the same numbers. That
 * yields a genuine single source of truth with zero extra runtime
 * dependency in the scaffolded project and zero added CI time.
 *
 * The consequence worth stating plainly, because it is the one thing
 * a reader will get wrong: for **Kotlin** the emitted `.editorconfig`
 * is live input — ktlint reads the file itself, so editing it moves
 * the formatter. For **Java, Go and Rust** it is a *co-render*: the
 * same numbers reach the formatter through its own config, and
 * hand-editing `.editorconfig` alone will drift the two apart.
 * `keel add code-style --reapply` re-syncs them.
 *
 * The values below are not aspirational — they are what keel's
 * templates already emit, so installing the vertical reformats
 * nothing.
 */

import { eolAware } from '../util.js';
import { upsertFormatStep } from './claude-kit.js';
import type {
  Adapter,
  Contribution,
  ContributionFile,
  ContributionPatch,
  Ctx,
  Tag,
} from '../../contract/composition.js';

/** Promoted by every `code-style` adapter; gates the hook + CI wiring. */
export const STYLE_MANAGED_TAG: Tag = 'style.managed';

/** Whether a language indents with spaces or hard tabs. */
export type IndentStyle = 'space' | 'tab';

/** The language groups keel renders style for. */
export type StyleLanguage = 'jvm' | 'go' | 'rust' | 'web' | 'shell';

/** One language group's layout facts. */
export interface LanguageStyle {
  /**
   * EditorConfig section globs, in the brace form the spec defines.
   * Ordered so later sections override earlier ones the way
   * EditorConfig resolves them.
   */
  readonly globs: readonly string[];
  readonly indentStyle: IndentStyle;
  /**
   * Columns per indent level. Emitted as `indent_size` for spaces and
   * as `tab_width` for tabs, which is what the property means there.
   */
  readonly indentSize: number;
  /**
   * Preferred maximum line length, or `undefined` where the
   * ecosystem has no such notion — Go being the case that matters:
   * `gofmt` has never had a width setting, so emitting
   * `max_line_length` for `*.go` would assert a rule nothing
   * enforces.
   */
  readonly lineWidth?: number;
}

/**
 * The style model. Per-language rather than uniform, deliberately: a
 * repo-wide `indent_style = space` is factually wrong for Go, and a
 * single `max_line_length` is wrong for every language at once
 * (gofmt has none, rustfmt says 100, prince-of-space is what we set
 * it to). A uniform block would be a trap — every editor would show
 * one layout and every formatter would impose another.
 */
export const STYLE_MODEL: Readonly<Record<StyleLanguage, LanguageStyle>> = {
  /** Java, Kotlin, and the Kotlin DSL build scripts alongside them. */
  jvm: { globs: ['*.java', '*.kt', '*.kts'], indentStyle: 'space', indentSize: 4, lineWidth: 120 },
  /** `gofmt` indents with tabs and offers no knobs; this records that. */
  go: { globs: ['*.go'], indentStyle: 'tab', indentSize: 4 },
  /** rustfmt's own defaults, spelled out so they are legible. */
  rust: { globs: ['*.rs'], indentStyle: 'space', indentSize: 4, lineWidth: 100 },
  /**
   * Everything the web toolchain formats, backend and browser alike.
   *
   * One flat brace list rather than several nested ones: EditorConfig
   * implementations agree on a top-level `{a,b,c}` alternation, but
   * nesting braces inside it is not portable.
   */
  web: {
    globs: ['*.{ts,tsx,js,jsx,mjs,cjs,json,jsonc,css,scss,html,yml,yaml}'],
    indentStyle: 'space',
    indentSize: 2,
    lineWidth: 100,
  },
  /** Hook scripts and CI helpers. */
  shell: { globs: ['*.{sh,bash}'], indentStyle: 'space', indentSize: 2 },
};

/** Returns the layout facts for one language group. */
export function styleFor(language: StyleLanguage): LanguageStyle {
  return STYLE_MODEL[language];
}

/** Target path of the emitted EditorConfig file. */
export const EDITORCONFIG_TARGET = '.editorconfig';

/** Target path of the emitted git attributes file. */
export const GITATTRIBUTES_TARGET = '.gitattributes';

/** Opens the keel-managed section of a generated config file. */
export const STYLE_BEGIN = '# keel:code-style:begin';

/** Closes the keel-managed section of a generated config file. */
export const STYLE_END = '# keel:code-style:end';

/**
 * Upserts the keel-managed section into a config file's content:
 * replaces the sentinel-delimited section when both markers are
 * present, appends it after the existing content when neither is.
 *
 * This is what makes the vertical safe to install onto a project
 * that already has an `.editorconfig` — the user's own sections
 * survive untouched, and keel's land after them, which is the half
 * EditorConfig resolution lets win. It is also what makes
 * `--reapply` idempotent.
 *
 * One marker without the other means the pair was hand-edited apart;
 * that throws with the fix rather than guessing where the user's own
 * rules end. Mirrors `upsertRunbook` in `claude-kit.ts`.
 */
export function upsertStyleSection(existing: string, body: string): string {
  const section = `${STYLE_BEGIN}\n${body.trim()}\n${STYLE_END}\n`;
  const begin = existing.indexOf(STYLE_BEGIN);
  const end = existing.indexOf(STYLE_END);
  if (begin === -1 && end === -1) {
    return existing.trim() === '' ? section : `${existing.trimEnd()}\n\n${section}`;
  }
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `code-style: the sentinels are broken — expected '${STYLE_BEGIN}' followed by '${STYLE_END}'. Restore the pair (or delete both) and re-run.`,
    );
  }
  const tail = existing.slice(end + STYLE_END.length).replace(/^\n/, '');
  return `${existing.slice(0, begin)}${section}${tail}`;
}

/** Renders one `[glob]` section from a language's layout facts. */
function renderSection(style: LanguageStyle): string {
  const lines = [`[${sectionGlob(style.globs)}]`, `indent_style = ${style.indentStyle}`];
  // `indent_size` is the spaces-per-level property; under hard tabs
  // the meaningful property is how wide the editor renders a tab.
  lines.push(
    style.indentStyle === 'tab'
      ? `tab_width = ${style.indentSize}`
      : `indent_size = ${style.indentSize}`,
  );
  if (style.lineWidth !== undefined) lines.push(`max_line_length = ${style.lineWidth}`);
  return lines.join('\n');
}

/**
 * Collapses a language's globs into one section header. EditorConfig
 * takes a comma-separated brace list for multiple patterns, and a
 * bare pattern when there is only one.
 *
 * Callers must supply patterns that are not themselves brace lists —
 * wrapping `*.{a,b}` in another `{…}` nests braces, which is outside
 * the portable subset. {@link STYLE_MODEL} keeps to that rule and
 * the guard below makes a future violation loud rather than silent.
 */
function sectionGlob(globs: readonly string[]): string {
  if (globs.length === 1) return globs[0] ?? '*';
  const nested = globs.find((g) => g.includes('{'));
  if (nested !== undefined) {
    throw new Error(
      `code-style: '${nested}' is a brace list and cannot be combined with siblings — EditorConfig does not portably nest braces. Flatten it into one pattern.`,
    );
  }
  return `{${globs.join(',')}}`;
}

/**
 * Renders the project's `.editorconfig` from {@link STYLE_MODEL}.
 *
 * The `[*]` baseline carries only what every editor and very nearly
 * every formatter agrees on — charset, line endings, a final newline,
 * no trailing whitespace. Per-language sections then state the
 * layout each ecosystem actually enforces.
 *
 * Markdown is the one deliberate exception to the baseline: two
 * trailing spaces are a hard line break there, so trimming them
 * changes rendered output.
 */
export function renderEditorConfig(): string {
  const languages: readonly StyleLanguage[] = ['jvm', 'go', 'rust', 'web', 'shell'];
  return [
    '# Layout every editor agrees on, generated by keel from one style',
    '# model. Kotlin reads this file directly (ktlint treats it as its',
    '# primary config); for Java, Go and Rust the same numbers reach the',
    '# formatter through its own config, so edit both or re-run',
    '# `keel add code-style --reapply`.',
    '',
    '[*]',
    'charset = utf-8',
    'end_of_line = lf',
    'insert_final_newline = true',
    'trim_trailing_whitespace = true',
    'indent_style = space',
    'indent_size = 2',
    '',
    ...languages.flatMap((l) => [renderSection(styleFor(l)), '']),
    '# Two trailing spaces are a hard line break in Markdown.',
    '[*.md]',
    'trim_trailing_whitespace = false',
    '',
    '[Makefile]',
    'indent_style = tab',
  ].join('\n');
}

/**
 * Seed content for `.editorconfig` when the project has none.
 *
 * `root = true` lives here rather than in the managed section: it is
 * a whole-file property that must appear once and before any
 * section, so it belongs to whoever creates the file, not to the
 * part keel rewrites on every re-apply.
 */
export function editorConfigSeed(): string {
  return `root = true\n\n${upsertStyleSection('', renderEditorConfig())}`;
}

/**
 * Renders `.gitattributes`.
 *
 * Line endings are one of the two facts (a final newline being the
 * other) that essentially every formatter in every ecosystem agrees
 * on, which makes normalising them in git itself the cheapest
 * cross-stack win available. `text=auto eol=lf` checks every text
 * file out with LF regardless of host OS, so a Windows contributor
 * cannot produce a CRLF diff that the formatter then fights.
 *
 * The wrapper scripts are pinned explicitly: `gradlew` must stay LF
 * to run under a shell, `gradlew.bat` must stay CRLF to run under
 * cmd.exe, and neither is negotiable.
 */
export function renderGitAttributes(): string {
  return [
    '# Normalise line endings in git itself, so a CRLF checkout can never',
    '# reach the formatter. Generated by keel.',
    '* text=auto eol=lf',
    '',
    '# Build wrappers: the shell script must stay LF, the batch file CRLF.',
    '*.bat text eol=crlf',
    '*.cmd text eol=crlf',
    'gradlew text eol=lf',
    'mvnw text eol=lf',
    '',
    '# Binary payloads git must never line-ending-normalise.',
    '*.jar binary',
    '*.png binary',
    '*.jpg binary',
    '*.gif binary',
    '*.ico binary',
    '*.woff binary',
    '*.woff2 binary',
  ].join('\n');
}

/** Seed content for `.gitattributes` when the project has none. */
export function gitAttributesSeed(): string {
  return upsertStyleSection('', renderGitAttributes());
}

/** The `code-style` dimension covered per stack family. */
export const FORMATTER_DIMENSION = 'formatter';

/** The `code-style` dimension covered by each family's static checks. */
export const LINTER_DIMENSION = 'linter';

/** Promoted by every `code-style` linter adapter. */
export const LINT_MANAGED_TAG: Tag = 'style.lint-managed';

/** Path of the pre-commit hook the family adapters wire their formatter into. */
export const HOOK_TARGET = '.claude/hooks/pre-commit-format.sh';

/**
 * One family's formatter commands.
 *
 * The pair is the whole enforcement contract, and the split matters:
 * `format` **fixes** and runs in the pre-commit hook, `check`
 * **verifies** and runs in CI. Hooks can be `--no-verify`'d and are
 * opt-in per clone, so they are a convenience; CI is the gate.
 * Keeping the fixer out of CI and the verifier out of the hook is
 * what keeps the hook inside its latency budget — the thing every
 * abandoned pre-commit setup blew.
 */
export interface FormatterCommands {
  /** Auto-fix, run by the pre-commit hook before the verify gate. */
  readonly format: string;
  /** Verify-only, run by CI. Must exit non-zero on drift. */
  readonly check: string;
}

/** The TypeScript workspace package manager recorded on the manifest. */
function webPackageManager(tags: readonly string[]): 'npm' | 'pnpm' {
  return tags.includes('pkg.pnpm') ? 'pnpm' : 'npm';
}

/** The JVM build system recorded on the manifest. */
function jvmBuild(tags: readonly string[]): 'gradle' | 'maven' {
  return tags.includes('pkg.maven') ? 'maven' : 'gradle';
}

/**
 * The formatter commands for a project's tag set, or `undefined`
 * when no family matches.
 *
 * This is the one place the commands are spelled, so the pre-commit
 * hook, the CI pipelines and the runbook cannot drift apart — the
 * same reason the claude-kit verify gate mirrors the `ci` pipeline.
 * It reads only tags, so `ci` can call it long after `code-style`
 * installed.
 *
 * Go's check is a `test -z` over `gofmt -l` rather than a `--check`
 * flag because `gofmt` has no such flag: it lists offending files and
 * exits 0 regardless, so the emptiness of that list *is* the
 * assertion.
 */
export function formatterCommandsFor(tags: readonly string[]): FormatterCommands | undefined {
  if (tags.includes('runtime.jvm')) {
    return jvmBuild(tags) === 'gradle'
      ? { format: './gradlew spotlessApply', check: './gradlew spotlessCheck' }
      : {
          format: './mvnw --batch-mode spotless:apply',
          check: './mvnw --batch-mode spotless:check',
        };
  }
  if (tags.includes('lang.go')) {
    return { format: 'gofmt -w .', check: 'test -z "$(gofmt -l .)"' };
  }
  if (tags.includes('lang.rust')) {
    return { format: 'cargo fmt --all', check: 'cargo fmt --all --check' };
  }
  if (tags.includes('lang.typescript')) {
    const pm = webPackageManager(tags);
    return { format: `${pm} run format`, check: `${pm} run format:check` };
  }
  return undefined;
}

/** What one family adapter contributes beyond the shared wiring. */
export interface FormatterSpec {
  /** Config files the family's formatter reads. Empty for Go. */
  readonly files?: readonly ContributionFile[];
  /** Patches against files the bootstrap already emitted. */
  readonly patches?: readonly ContributionPatch[];
}

/**
 * Declares one family formatter adapter over the shared wiring.
 *
 * Every family gets the same two things regardless of ecosystem: its
 * config rendered from {@link STYLE_MODEL}, and its `format` command
 * upserted into the pre-commit hook's sentinel-delimited step. The
 * hook is patched rather than re-emitted so this works identically
 * greenfield (where `walking-skeleton` emitted a hook with no
 * formatter moments earlier) and brownfield (`keel add code-style`
 * on a project scaffolded before the vertical existed) — one
 * mechanism, no install-order special cases.
 *
 * The hook patch carries no `seed`: every keel project has one,
 * because `walking-skeleton` makes `agentic-kit` a required
 * dimension. A project whose hook was deleted fails loudly naming
 * the file, which is the house behaviour for an uncovered gap.
 */
export function formatterAdapter(
  id: string,
  requires: readonly Tag[],
  spec: (ctx: Ctx) => FormatterSpec,
): Adapter {
  return {
    id,
    vertical: 'code-style',
    covers: [FORMATTER_DIMENSION],
    predicate: { requires },
    contribute(ctx: Ctx): Contribution {
      const commands = formatterCommandsFor(ctx.manifest.tags);
      if (commands === undefined) {
        throw new Error(
          `${id}: no formatter commands for tags [${ctx.manifest.tags.join(', ')}] — formatterCommandsFor and this adapter's predicate disagree.`,
        );
      }
      const { files, patches } = spec(ctx);
      return {
        files: files ?? [],
        patches: [
          ...(patches ?? []),
          {
            target: HOOK_TARGET,
            apply: eolAware((existing) => upsertFormatStep(existing, commands.format)),
          },
        ],
        tagsAdd: [STYLE_MANAGED_TAG],
      };
    },
  };
}

/**
 * One family's lint check — the `linter` dimension's whole enforcement
 * contract, and a deliberately narrower one than {@link FormatterCommands}.
 *
 * There is no `fix` half. Most of what a linter catches — a naming
 * violation, a missing doc comment — cannot be mechanically repaired,
 * and the one shape that *can* auto-fix (an `eslint --fix`, a
 * `clippy --fix`) is exactly the hazard `jvm-format`'s module docs
 * already name: a fixer running over `.ejs`-templated or
 * regex-anchored source can reflow what a later `keel add module`
 * expects to find verbatim. So `check` is CI-only by construction —
 * the pre-commit hook stays formatter-only, and `ciLintCheck` in
 * `ci-pipeline.ts` is the only caller. A project failing this check
 * finds out in CI, the same place a Checkstyle or ESLint finding
 * would surface on any other scaffolder.
 *
 * `undefined` from {@link linterCommandsFor} is a real state, not a
 * gap: the JVM family's free-tier check (wildcard imports) rides
 * inside the *formatter*'s own Spotless block rather than a command of
 * its own — see `jvm-format.ts` for why a second Spotless format
 * cannot host it safely.
 */
export interface LinterCommands {
  /** Verify-only, run by CI. Must exit non-zero on a finding. */
  readonly check: string;
}

/**
 * The lint commands for a project's tag set, or `undefined` when the
 * family has nothing to run as a distinct step.
 *
 * Only the free tier is wired here (roadmap item O): rustc/clippy's
 * built-in lints for Rust, `go vet` for Go — both already ship with
 * the toolchain the project requires regardless — and ESLint for the
 * web family, the one family with no zero-dependency subset of this
 * scope (TypeScript has no wildcard-import concept, and naming case
 * and doc comments both need a rule engine). Checkstyle, detekt and
 * golangci-lint are a separately-argued follow-up (see
 * `docs/verticals/code-style.md`), so a JVM tag set returns
 * `undefined` here on purpose.
 */
export function linterCommandsFor(tags: readonly string[]): LinterCommands | undefined {
  if (tags.includes('lang.go')) {
    return { check: 'go vet ./...' };
  }
  if (tags.includes('lang.rust')) {
    // clippy's default lint set is warn-on-correctness/style/perf only —
    // `wildcard_imports` lives in the allow-by-default pedantic group and
    // `missing_docs` is a rustc lint at allow by default, so both need an
    // explicit `-D`; verified against real clippy 0.1.94, which silently
    // let a `use x::*` and an undocumented `pub fn` through `-D warnings`
    // alone.
    return {
      check:
        'cargo clippy --workspace --all-targets -- -D warnings -D missing_docs -D clippy::wildcard_imports',
    };
  }
  if (tags.includes('lang.typescript')) {
    // A direct binary invocation rather than a `package.json` script:
    // the modulith layouts already define `"lint"` for `depcruise`
    // (an architecture rule, not a style one), and the existing
    // "never overwrite a script the project already defines" contract
    // means a same-named script would silently never run ESLint there.
    return { check: `${webPackageManager(tags)} exec eslint .` };
  }
  return undefined;
}

/** What one family linter adapter contributes beyond the shared tag. */
export interface LinterSpec {
  readonly files?: readonly ContributionFile[];
  readonly patches?: readonly ContributionPatch[];
}

/**
 * Declares one family linter adapter.
 *
 * Deliberately thinner than {@link formatterAdapter}: there is no hook
 * wiring (lint is CI-only, see {@link LinterCommands}) and no implicit
 * command lookup, because not every family surfaces one — the JVM
 * adapter covers the dimension without a `check` of its own. Each
 * family decides for itself what, if anything, it needs to render.
 */
export function linterAdapter(
  id: string,
  requires: readonly Tag[],
  spec: (ctx: Ctx) => LinterSpec,
): Adapter {
  return {
    id,
    vertical: 'code-style',
    covers: [LINTER_DIMENSION],
    predicate: { requires },
    contribute(ctx: Ctx): Contribution {
      const { files, patches } = spec(ctx);
      return {
        files: files ?? [],
        patches: patches ?? [],
        tagsAdd: [LINT_MANAGED_TAG],
      };
    },
  };
}
