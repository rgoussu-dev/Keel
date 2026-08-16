/**
 * The **module name** — one piece of user input that becomes six
 * different kinds of identifier, validated once here rather than five
 * times in five adapters.
 *
 * `keel add module <name>` takes a word and every stack family spends
 * it differently:
 *
 * | Family           | The name becomes                                        |
 * | ---------------- | ------------------------------------------------------- |
 * | all              | a directory, `modules/<name>/`                          |
 * | Go               | a `package` clause, and Go package clauses take no dash |
 * | Rust             | a Cargo package name, its `use` identifier, and a       |
 * |                  | workspace `members` entry                               |
 * | TypeScript       | an npm package name, `@<scope>/<name>`                  |
 * | JVM              | a package segment, `<basePackage>.<name>`               |
 * | web-components   | a custom-element tag prefix, `<scope>-<name>-<element>`, |
 * |                  | and a context-key string, `<scope>.<name>.<port>`       |
 *
 * **Validation belongs at the front door, not per adapter.** Five
 * near-identical regexes in five adapters is five chances to drift,
 * and the failure mode is not a clean rejection — it is a project that
 * scaffolds and then does not compile, with the diagnostic coming from
 * `cargo` or `go vet` rather than from keel. So the accepted set is
 * the **intersection** of what all six spellings accept, checked once,
 * and every family renders its own spelling off the validated name via
 * the helpers below.
 *
 * **The intersection is `^[a-z][a-z0-9]*$`, and each exclusion is load
 * bearing.** A dash is legal in a directory, a Cargo package and an
 * npm package, and illegal in a Go `package` clause — allowing it
 * would mean the Go directory and its package clause stop matching,
 * which is precisely the divergence the rest of the Go layout resolver
 * exists to avoid. An underscore is legal in Go, Rust and the JVM, and
 * conventionally wrong in npm and illegal in a custom-element tag. An
 * uppercase letter is illegal in an npm package name and in an element
 * tag. A leading digit is illegal in every identifier spelling. What
 * survives is the lowercase alphanumeric word, and it is the same
 * string in all six places — `modules/ordering`, `package ordering`,
 * `ordering-domain-contract`, `@acme/ordering`, `com.acme.ordering`,
 * `acme-ordering-view`, `acme.ordering.service`.
 *
 * That is deliberately stricter than any single family. A user who
 * wants `order-taking` is told so at the front door, in one message
 * naming the rule, instead of after the tree is on disk.
 */

import type { Result } from '../../kernel/result.js';
import { DomainError, err, ok } from '../../kernel/result.js';

/** The accepted shape: a lowercase alphanumeric word, letter first. */
const MODULE_NAME_PATTERN = /^[a-z][a-z0-9]*$/;

/**
 * Longest accepted name.
 *
 * No single family imposes this — npm allows 214 characters and Cargo
 * more. It exists because the name is a *path segment repeated at
 * every layer*: the JVM spends it as
 * `modules/<name>/domain/contract/src/main/java/<pkgPath>/<name>/domain/contract/`,
 * so a long name is paid for once per file rather than once per
 * project. Thirty-two is generous for a bounded context whose name
 * should be a word from the domain, not a sentence about it.
 */
const MAX_MODULE_NAME_LENGTH = 32;

/**
 * Keywords of each language a module name is spent as an identifier
 * in, restricted to the words {@link MODULE_NAME_PATTERN} would
 * otherwise admit.
 *
 * **One list per language rather than one merged list**, because the
 * claim this file makes — "reserved in at least one of Go, Rust, Java
 * or Kotlin" — is only checkable if each language's list can be read
 * against its own grammar. Merged, a missing word is invisible; here
 * it is a gap in a list somebody can diff against a spec.
 *
 * Words reserved *for future use* are included on the same footing as
 * the ones in use: Rust rejects `become` as an identifier today, and
 * the emitted code does not care why.
 */
const JAVA_KEYWORDS: readonly string[] = [
  'abstract',
  'assert',
  'boolean',
  'break',
  'byte',
  'case',
  'catch',
  'char',
  'class',
  'const',
  'continue',
  'default',
  'do',
  'double',
  'else',
  'enum',
  'extends',
  'false',
  'final',
  'finally',
  'float',
  'for',
  'goto',
  'if',
  'implements',
  'import',
  'instanceof',
  'int',
  'interface',
  'long',
  'native',
  'new',
  'null',
  'package',
  'private',
  'protected',
  'public',
  'record',
  'return',
  'short',
  'static',
  'strictfp',
  'super',
  'switch',
  'synchronized',
  'this',
  'throw',
  'throws',
  'transient',
  'true',
  'try',
  'var',
  'void',
  'volatile',
  'while',
];

/** Kotlin's hard keywords — the ones no context makes an identifier. */
const KOTLIN_KEYWORDS: readonly string[] = [
  'as',
  'break',
  'class',
  'continue',
  'do',
  'else',
  'false',
  'for',
  'fun',
  'if',
  'in',
  'interface',
  'is',
  'null',
  'object',
  'package',
  'return',
  'super',
  'this',
  'throw',
  'true',
  'try',
  'typealias',
  'typeof',
  'val',
  'var',
  'when',
  'while',
];

/** Go's twenty-five, all of which a `package` clause rejects. */
const GO_KEYWORDS: readonly string[] = [
  'break',
  'case',
  'chan',
  'const',
  'continue',
  'default',
  'defer',
  'else',
  'fallthrough',
  'for',
  'func',
  'go',
  'goto',
  'if',
  'import',
  'interface',
  'map',
  'package',
  'range',
  'return',
  'select',
  'struct',
  'switch',
  'type',
  'var',
];

/** Rust's keywords, strict and reserved alike. */
const RUST_KEYWORDS: readonly string[] = [
  'abstract',
  'as',
  'async',
  'await',
  'become',
  'box',
  'break',
  'const',
  'continue',
  'crate',
  'do',
  'dyn',
  'else',
  'enum',
  'extern',
  'false',
  'final',
  'fn',
  'for',
  'if',
  'impl',
  'in',
  'let',
  'loop',
  'macro',
  'match',
  'mod',
  'move',
  'mut',
  'override',
  'priv',
  'pub',
  'ref',
  'return',
  'self',
  'static',
  'struct',
  'super',
  'trait',
  'true',
  'try',
  'type',
  'typeof',
  'union',
  'unsafe',
  'unsized',
  'use',
  'virtual',
  'where',
  'while',
  'yield',
];

/**
 * Names no compiler objects to and the layouts do anyway.
 *
 * - **Directories the layouts already own** — `modules`, `platform`,
 *   `application`, `domain`, `contract`, `infra`, `service`, `kernel`,
 *   `src`, `build`, `target`, `dist`, `node`. A context named
 *   `platform` would land its crates beside the shared kernel and read
 *   as though it were one.
 * - **Compiler-enforced directory meanings** — `internal` is the
 *   sharpest: not a Go keyword, but a directory whose contents are
 *   unreachable from outside its parent, so a context named `internal`
 *   would make its own modules unimportable. `main` is the package a
 *   Go or Rust entry point must be, `test` and `core` are directory
 *   segments of the layouts, and `std` and `module` name things the
 *   toolchains already do.
 *
 * `assets`, `docs` and `tests` are deliberately *absent*: nothing
 * breaks if a domain really is called that.
 */
const RESERVED_DIRECTORIES: readonly string[] = [
  'application',
  'build',
  'contract',
  'core',
  'dist',
  'domain',
  'infra',
  'internal',
  'kernel',
  'main',
  'module',
  'modules',
  'node',
  'platform',
  'service',
  'src',
  'std',
  'target',
  'test',
];

/**
 * Every name rejected regardless of shape: the union of the four
 * keyword lists and the structural one.
 *
 * The user is told which *kind* of collision they hit, not which
 * language, because the answer is the same either way — pick another
 * word. What the split buys is maintenance: a new target language
 * brings its keyword list and nothing else changes.
 */
const RESERVED_MODULE_NAMES: ReadonlySet<string> = new Set([
  ...JAVA_KEYWORDS,
  ...KOTLIN_KEYWORDS,
  ...GO_KEYWORDS,
  ...RUST_KEYWORDS,
  ...RESERVED_DIRECTORIES,
]);

/**
 * A module name that has passed {@link parseModuleName}.
 *
 * A branded string rather than a bare one, so a function taking a
 * `ModuleName` cannot be handed raw CLI input by accident. The brand
 * is erased at runtime — the value *is* the validated string, which is
 * what every family renders from.
 */
export type ModuleName = string & { readonly __moduleName: unique symbol };

/**
 * Validates one user-supplied bounded-context name against the
 * intersection every family accepts.
 *
 * Returns an `Err` carrying `keel.invalid-module-name` for anything
 * rejected; the message names the rule rather than restating the
 * regex, because the rule ("a lowercase word") is what the user needs
 * and the regex is what keel needs.
 */
export function parseModuleName(raw: string): Result<ModuleName> {
  const name = raw.trim();
  if (name.length === 0) {
    return err(
      new DomainError(
        'a module name is required: keel add module <name>',
        'keel.invalid-module-name',
      ),
    );
  }
  if (name.length > MAX_MODULE_NAME_LENGTH) {
    return err(
      new DomainError(
        `module name '${name}' is ${String(name.length)} characters; the limit is ${String(
          MAX_MODULE_NAME_LENGTH,
        )}. The name is a path segment repeated at every layer of the context, so it is paid for once per file`,
        'keel.invalid-module-name',
      ),
    );
  }
  if (!MODULE_NAME_PATTERN.test(name)) {
    return err(
      new DomainError(
        `module name '${name}' is not a lowercase word. A bounded-context name becomes a directory, a Go package clause, a Cargo package, an npm package, a JVM package segment and a custom-element tag prefix, and only [a-z][a-z0-9]* is legal in all six — no dashes (illegal in a Go package clause), no underscores (illegal in an element tag), no uppercase (illegal in an npm package name), and not leading with a digit${
          suggest(name) === null ? '' : `. Try '${suggest(name)}'`
        }`,
        'keel.invalid-module-name',
      ),
    );
  }
  if (RESERVED_MODULE_NAMES.has(name)) {
    return err(
      new DomainError(
        `module name '${name}' is reserved: it is either a keyword in one of Go, Rust, Java or Kotlin, or a directory the module layouts already own. Pick a word from your domain instead`,
        'keel.invalid-module-name',
      ),
    );
  }
  return ok(name as ModuleName);
}

/**
 * The nearest accepted name, for the rejection message, or `null`
 * when nothing survives the squeeze.
 *
 * Lowercases, drops every character outside `[a-z0-9]` (so
 * `order-taking` becomes `ordertaking` rather than a name keel would
 * have to invent a separator convention for), and trims leading
 * digits. Deliberately not applied automatically: silently renaming a
 * user's bounded context is worse than telling them the rule.
 */
function suggest(raw: string): string | null {
  const squeezed = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
  const trimmed = squeezed.replace(/^[0-9]+/, '');
  if (trimmed.length === 0 || trimmed.length > MAX_MODULE_NAME_LENGTH) return null;
  if (RESERVED_MODULE_NAMES.has(trimmed)) return null;
  return trimmed;
}

/**
 * The custom-element tag a web-components module spells `element`
 * with: `<scope>-<name>-<element>`.
 *
 * Here rather than in `wc-module-layout.ts` for the reason the whole
 * file exists — the tag is one of the six spellings the name has to
 * survive, so the proof that it does belongs beside the rule that
 * makes it true.
 */
export function toElementTag(scope: string, name: ModuleName, element: string): string {
  return `${scope}-${name}-${element}`;
}

/** The context-key string a web-components module registers a port under. */
export function toContextKey(scope: string, name: ModuleName, port: string): string {
  return `${scope}.${name}.${port}`;
}
