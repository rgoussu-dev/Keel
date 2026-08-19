/**
 * The version-pin registry's loader and matcher.
 *
 * `assets/composition/version-pins.json` is the per-family record of
 * where the emitted templates pin framework and tool versions — the
 * registry roadmap #75 calls for. Two consumers share this module:
 *
 *   - `tests/version-pins.test.ts` (the guard, offline, runs in
 *     `verify`): every registry entry must still match the templates,
 *     and every pin-shaped string in the templates must be claimed by
 *     an entry.
 *   - `tests/currency/version-currency.test.ts` (the drift report,
 *     network, opt-in with `KEEL_RUN_CURRENCY=1`): every entry with an
 *     upstream check is compared against the current latest stable.
 *   - the vertical suites and `tests/toolchain-pins.test.ts`, through
 *     {@link pinValue} and {@link withRegistry}: an emitted version is
 *     asserted against the registry rather than a literal, and a
 *     doctored registry proves a pin bump reaches every surface.
 *
 * Globs here are deliberately minimal — `**` crosses directories, `*`
 * stays inside a segment — because the registry needs no more, and a
 * dependency would be one more thing to keep current.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { ejsTemplateSource } from '../../src/infrastructure/template/ejs-template-source.js';
import { VERSION_PINS_ASSET } from '../../src/domain/core/adapters/version-pins.js';
import type { TemplateSource } from '../../src/domain/contract/ports/template-source.js';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where pins can live; the guard sweeps exactly these roots. */
export const scanRoots = ['assets/composition', 'src/domain/core/adapters', 'src/domain/toolchain'];

export const registryPath = path.join(repoRoot, 'assets', 'composition', 'version-pins.json');

const locationSchema = z.object({
  glob: z.string().min(1),
  pattern: z.string().min(1),
  /** Overrides the pin's value for this location (e.g. a laxer engines floor). */
  value: z.string().optional(),
});

const checkSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('maven'),
    group: z.string(),
    artifact: z.string(),
    track: z.enum(['exact', 'major']).default('exact'),
  }),
  z.object({ type: z.literal('gradle-plugin'), pluginId: z.string() }),
  z.object({ type: z.literal('gradle-current') }),
  z.object({ type: z.literal('npm'), package: z.string() }),
  z.object({ type: z.literal('crate'), crate: z.string() }),
  z.object({ type: z.literal('node-lts') }),
  z.object({ type: z.literal('jdk-lts') }),
  z.object({ type: z.literal('go-toolchain') }),
  z.object({
    type: z.literal('github-release'),
    repo: z.string(),
    track: z.enum(['exact', 'major']),
  }),
  z.object({ type: z.literal('endoflife'), product: z.string() }),
  z.object({ type: z.literal('none'), reason: z.string().min(1) }),
]);

const pinSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  family: z.enum(['jvm', 'go', 'rust', 'ts', 'web', 'shared']),
  description: z.string().min(1),
  value: z.string().min(1),
  locations: z.array(locationSchema).min(1),
  check: checkSchema,
});

const registrySchema = z.object({ pins: z.array(pinSchema) });

export type PinLocation = z.infer<typeof locationSchema>;
export type PinCheck = z.infer<typeof checkSchema>;
export type Pin = z.infer<typeof pinSchema>;

/** Parses and validates the registry; throws on a malformed file. */
export const loadRegistry = (): Pin[] =>
  registrySchema.parse(JSON.parse(fs.readFileSync(registryPath, 'utf8'))).pins;

const globToRegExp = (glob: string): RegExp => {
  let source = '';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === '*') {
      if (glob[i + 1] === '*') {
        source += glob[i + 2] === '/' ? '(?:[^/]+/)*' : '.*';
        i += glob[i + 2] === '/' ? 2 : 1;
      } else {
        source += '[^/]*';
      }
    } else if ('\\^$.|?+()[]{}'.includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  return new RegExp(`^${source}$`);
};

const walk = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });

let cachedFiles: string[] | undefined;

/** Every file under the scan roots, as repo-root-relative POSIX paths. */
export const scannedFiles = (): string[] => {
  cachedFiles ??= scanRoots
    .flatMap((root) => walk(path.join(repoRoot, root)))
    .map((file) => path.relative(repoRoot, file).split(path.sep).join('/'))
    .sort();
  return cachedFiles;
};

/** One concrete occurrence of a pinned version in a scanned file. */
export interface PinMatch {
  file: string;
  /** Offset range of the whole regex match within the file. */
  start: number;
  end: number;
  /** The captured version string. */
  captured: string;
  /** The value this occurrence is expected to equal. */
  expected: string;
}

let cachedContents: Map<string, string> | undefined;

/** Reads a scanned file once; the guard reads every template so caching pays. */
export const contentOf = (file: string): string => {
  cachedContents ??= new Map();
  let content = cachedContents.get(file);
  if (content === undefined) {
    content = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    cachedContents.set(file, content);
  }
  return content;
};

/**
 * Every occurrence a location's pattern finds in the files its glob
 * selects. The pattern must have exactly one capture group — the
 * version — which the guard compares against the pin's value.
 */
export const locationMatches = (pin: Pin, location: PinLocation): PinMatch[] => {
  const fileFilter = globToRegExp(location.glob);
  const expected = location.value ?? pin.value;
  return scannedFiles()
    .filter((file) => fileFilter.test(file))
    .flatMap((file) => {
      const regex = new RegExp(location.pattern, 'gm');
      return [...contentOf(file).matchAll(regex)].map((match) => ({
        file,
        start: match.index,
        end: match.index + match[0].length,
        captured: match[1] ?? '',
        expected,
      }));
    });
};

/**
 * A pin's recorded value, for tests asserting an emitted version. The
 * point is never to restate the number: a test that hardcodes `25`
 * passes just as happily when the adapter hardcodes it too, which is
 * the drift the single-source rule exists to prevent.
 */
export const pinValue = (id: string): string => {
  const pin = loadRegistry().find((p) => p.id === id);
  if (!pin) throw new Error(`test setup: no '${id}' entry in the pin registry`);
  return pin.value;
};

/**
 * A TemplateSource serving a doctored pin registry over the real
 * assets — the pin-bump path, without editing a file on disk. The
 * transform receives the registry's entries and mutates them in
 * place; every other asset is served unchanged.
 */
export const withRegistry = (
  transform: (pins: { id: string; value: string }[]) => void,
): TemplateSource => ({
  render: (templateId, targetRoot, vars) => ejsTemplateSource.render(templateId, targetRoot, vars),
  readText: async (assetId) => {
    const raw = await ejsTemplateSource.readText(assetId);
    if (assetId !== VERSION_PINS_ASSET) return raw;
    const doctored = JSON.parse(raw) as { pins: { id: string; value: string }[] };
    transform(doctored.pins);
    return JSON.stringify(doctored);
  },
});
