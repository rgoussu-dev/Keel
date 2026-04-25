import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Context, Options, Schematic, Tree } from '../../engine/types.js';
import { packageToPath, resolveLanguage, type SupportedLanguage } from '../util.js';

const DEFAULT_QUARKUS_VERSION = '3.15.0';

/**
 * Allowed shape for a Quarkus version: digits + dots, optionally followed
 * by a hyphen-prefixed qualifier (e.g. `3.15.0`, `3.15.0-redhat-00001`,
 * `999.999.999.Final`). The strict allowlist keeps the value safe to
 * interpolate inside double-quotes in `gradle/libs.versions.toml` — a
 * stray quote, backslash, or newline would otherwise produce invalid TOML.
 */
const QUARKUS_VERSION_PATTERN = /^[0-9]+(?:\.[0-9A-Za-z]+)*(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Scaffolds a Quarkus-based REST executable channel for the walking
 * skeleton:
 *
 *   - `application/rest/contract/` — OpenAPI 3.1 spec and plain
 *     transport DTOs. Depends only on {@code domain/contract}.
 *   - `application/rest/executable/` — Quarkus runnable. The module is
 *     the channel's composition root (per §1.1): it hosts the JAX-RS
 *     resource, the CDI {@code MediatorProducer} that wires concrete
 *     handlers into the mediator, and a RFC 9457 Problem Details mapper.
 *   - `domain/contract/**‌/ping/` — {@code PingQuery} and the
 *     {@code Ping} domain value.
 *   - `domain/core/**‌/ping/` — {@code PingHandler} implementation.
 *
 * Packaging defaults to JVM mode; the {@code iac-cloudrun} schematic
 * flips to native on Cloud Run (fast cold starts). Swagger UI is always
 * included so the walking skeleton is self-documenting.
 *
 * Side effects on the shared scaffold (best-effort; skipped if the files
 * don't exist yet so standalone `keel generate executable-rest` still
 * works in a fresh directory):
 *   - appends include lines for the two new modules to
 *     {@code settings.gradle.kts}.
 *   - adds a {@code quarkus} entry under {@code [versions]}, a
 *     {@code quarkus-bom} entry under {@code [libraries]}, and a
 *     {@code quarkus} entry under {@code [plugins]} of
 *     {@code gradle/libs.versions.toml}.
 *
 * Composition: normally invoked by the walking-skeleton schematic after
 * the core scaffold has been rendered. Can also run standalone.
 */
export const executableRestSchematic: Schematic = {
  name: 'executable-rest',
  description: 'Scaffold a Quarkus REST channel with a /ping slice wired through the mediator.',
  parameters: [
    {
      name: 'basePackage',
      description: 'Base java package, e.g. com.example',
      required: true,
      prompt: { kind: 'input', name: 'basePackage', message: 'base package (e.g. com.example)' },
    },
    {
      name: 'projectName',
      description: 'Service name shown in the generated OpenAPI info block.',
      required: true,
      prompt: { kind: 'input', name: 'projectName', message: 'service name' },
    },
    {
      name: 'quarkusVersion',
      description: 'Quarkus version pinned in the version catalog.',
      required: false,
    },
    {
      name: 'language',
      description: 'Target language (java supported in MVP).',
      required: false,
    },
  ],

  async run(tree: Tree, options: Options, ctx: Context): Promise<void> {
    const vars = resolve(options);
    const templateRoot = path.join(
      paths.asset('schematics'),
      'executable-rest',
      'templates',
      vars.language,
    );
    await renderTemplate(tree, templateRoot, '', vars as unknown as Record<string, unknown>);
    amendSettings(tree, ctx);
    amendVersionCatalog(tree, vars.quarkusVersion, ctx);
    ctx.logger.info(
      'executable-rest: Quarkus REST channel + /ping slice rendered. Swagger UI will be at /swagger.',
    );
  },
};

interface ResolvedVars {
  basePackage: string;
  pkgPath: string;
  projectName: string;
  quarkusVersion: string;
  language: SupportedLanguage;
}

function resolve(options: Options): ResolvedVars {
  const basePackage = String(options['basePackage'] ?? '').trim();
  if (!basePackage) throw new Error('executable-rest: `basePackage` is required');
  const projectName = String(options['projectName'] ?? '').trim();
  if (!projectName) throw new Error('executable-rest: `projectName` is required');
  const language = resolveLanguage(options['language'], 'executable-rest');
  const rawQuarkusVersion = String(options['quarkusVersion'] ?? DEFAULT_QUARKUS_VERSION).trim();
  if (!QUARKUS_VERSION_PATTERN.test(rawQuarkusVersion)) {
    throw new Error(
      `executable-rest: invalid quarkusVersion "${rawQuarkusVersion}" (expected digits/dots optionally followed by "-<qualifier>"; got something that would not be safe to embed in libs.versions.toml)`,
    );
  }
  const quarkusVersion = rawQuarkusVersion;
  return {
    basePackage,
    pkgPath: packageToPath(basePackage),
    projectName,
    quarkusVersion,
    language,
  };
}

const REST_INCLUDES = [
  'include(":application:rest:contract")',
  'include(":application:rest:executable")',
];

/**
 * Appends include lines for the two new modules to the project's
 * {@code settings.gradle.kts}. Idempotent — existing lines aren't
 * duplicated. Silently skipped when the file doesn't exist yet so
 * standalone invocation in a fresh directory remains safe.
 */
function amendSettings(tree: Tree, ctx: Context): void {
  const buffer = tree.read('settings.gradle.kts');
  if (!buffer) {
    ctx.logger.warn(
      'executable-rest: settings.gradle.kts not found — remember to include the REST modules manually.',
    );
    return;
  }
  const current = buffer.toString('utf8');
  const missing = REST_INCLUDES.filter((line) => !current.includes(line));
  if (missing.length === 0) return;
  tree.write('settings.gradle.kts', `${current.trimEnd()}\n${missing.join('\n')}\n`);
}

/**
 * Adds the Quarkus entries to {@code gradle/libs.versions.toml}. The
 * version catalog format is a flat TOML with well-known tables, so we
 * can do targeted upserts instead of pulling a TOML parser. Idempotent:
 * a key already present <em>inside the target section</em> leaves the
 * content untouched — the same key may legitimately appear in multiple
 * sections (e.g. {@code quarkus} under both {@code [versions]} and
 * {@code [plugins]}), so the "already present" check is section-scoped.
 */
function amendVersionCatalog(tree: Tree, quarkusVersion: string, ctx: Context): void {
  const buffer = tree.read('gradle/libs.versions.toml');
  if (!buffer) {
    ctx.logger.warn(
      'executable-rest: gradle/libs.versions.toml not found — remember to declare the quarkus plugin/version manually.',
    );
    return;
  }
  let content = buffer.toString('utf8');
  content = upsertTomlEntry(content, 'versions', 'quarkus', `"${quarkusVersion}"`);
  content = upsertTomlEntry(
    content,
    'libraries',
    'quarkus-bom',
    '{ module = "io.quarkus.platform:quarkus-bom", version.ref = "quarkus" }',
  );
  content = upsertTomlEntry(
    content,
    'plugins',
    'quarkus',
    '{ id = "io.quarkus", version.ref = "quarkus" }',
  );
  tree.write('gradle/libs.versions.toml', content);
}

/**
 * Inserts `<key> = <value>` into the `[section]` block, or creates the
 * section (appended at EOF) when absent. Idempotent: an entry matching
 * `<key> =` inside the target section leaves the content unchanged. The
 * "already present" check is scoped to the section — the same key name
 * may legitimately appear in multiple sections (e.g. both `[versions]`
 * and `[plugins]` carry a `quarkus` entry).
 */
function upsertTomlEntry(content: string, section: string, key: string, value: string): string {
  const lines = content.split('\n');
  const sectionHeader = `[${section}]`;
  const sectionStart = lines.findIndex((l) => l.trim() === sectionHeader);
  const newLine = `${key} = ${value}`;

  if (sectionStart < 0) {
    return `${content.trimEnd()}\n\n${sectionHeader}\n${newLine}\n`;
  }

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const trimmed = lines[i]!.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      sectionEnd = i;
      break;
    }
  }

  const keyPattern = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = sectionStart + 1; i < sectionEnd; i++) {
    if (keyPattern.test(lines[i]!)) return content;
  }

  let lastContent = sectionEnd - 1;
  while (lastContent > sectionStart && lines[lastContent]!.trim() === '') lastContent--;
  lines.splice(lastContent + 1, 0, newLine);
  return lines.join('\n');
}
