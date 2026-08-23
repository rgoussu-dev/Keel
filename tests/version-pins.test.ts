/**
 * The consumer for the version-pin registry.
 *
 * `assets/composition/version-pins.json` records every framework and
 * tool version the emitted templates pin, and the weekly
 * `version-currency` workflow reads it to report drift against latest
 * stable (roadmap #75). The hazard is the same one
 * `tests/ci-workflow.test.ts` guards one level up: a registry nobody
 * checks rots silently. A template can gain a pin the registry never
 * hears about — invisible to the drift report, which keeps printing
 * the same green over strictly less coverage — or a registry entry can
 * stop matching the template it describes, at which point the report
 * checks a version nobody ships.
 *
 * So the registry gets a test, and it runs in `verify` — offline, no
 * upstream queries. Three assertions:
 *
 *   1. every entry matches the templates, and every occurrence carries
 *      the recorded value;
 *   2. every pin-shaped string a sweep of the templates finds is
 *      claimed by some entry;
 *   3. the sweep itself sees the surfaces the registry describes (so a
 *      renamed directory cannot silently retire the sweep).
 *
 * The sweep's detectors are syntactic nets — Maven properties and
 * dependency versions, Gradle plugin blocks and coordinates,
 * package.json ranges, Cargo requirements, go directives, image
 * references, emitted-workflow action refs, and the adapter constants
 * in `src/domain/core/adapters/`. Adding a pin in any of those shapes
 * without a registry entry fails here with the file and the match, and
 * the fix is to add the entry (or extend one), not to weaken the net.
 */

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentOf,
  loadRegistry,
  locationMatches,
  registryPath,
  scannedFiles,
  type PinMatch,
} from './support/version-pins.js';

const registry = loadRegistry();

/** Every registry occurrence, resolved once for all assertions. */
const allMatches = registry.map((pin) => ({
  pin,
  locations: pin.locations.map((location) => ({
    location,
    matches: locationMatches(pin, location),
  })),
}));

interface SweepHit {
  detector: string;
  file: string;
  start: number;
  end: number;
  text: string;
}

const registryFile = 'assets/composition/version-pins.json';

const byExtension =
  (...suffixes: string[]) =>
  (file: string) =>
    suffixes.some((suffix) => file.endsWith(suffix));

const isAdapterSource = (file: string) =>
  file.startsWith('src/domain/core/adapters/') && file.endsWith('.ts');

/**
 * The syntactic nets. Each detector is deliberately broader than any
 * one registry entry: entries claim occurrences, detectors find them.
 */
const detectors: {
  id: string;
  applies: (file: string) => boolean;
  regex: () => RegExp;
  /** Drops false positives a regex alone cannot exclude. */
  keep?: (match: RegExpExecArray) => boolean;
}[] = [
  {
    id: 'properties-version',
    applies: byExtension('.properties'),
    regex: () => /^[ \t]*[\w.-]*version[\w.-]*[ \t]*=[ \t]*(\S+)/gim,
  },
  {
    id: 'gradle-plugin-version',
    applies: byExtension('.gradle', '.gradle.ejs', '.kts', '.kts.ejs'),
    regex: () => /\bversion\s+"([^"]+)"/g,
  },
  {
    id: 'gradle-coordinate',
    applies: (file) =>
      byExtension('.gradle', '.gradle.ejs', '.kts', '.kts.ejs')(file) || isAdapterSource(file),
    regex: () => /"[\w.-]+:[\w.-]+:(\d[\w.-]*)"/g,
  },
  {
    id: 'java-toolchain',
    applies: byExtension('.kts', '.kts.ejs'),
    regex: () => /(?:JavaLanguageVersion\.of|jvmToolchain)\((\d+)\)/g,
  },
  {
    id: 'pom-version-literal',
    applies: (file) => byExtension('pom.xml', 'pom.xml.ejs')(file) || isAdapterSource(file),
    regex: () =>
      /<(?:(?:[\w-]+\.)*version|maven\.compiler\.release|jdk\.version|release\.version)>([^<$][^<]*)<\//g,
    keep: (match) => match[1] !== undefined && match[1] !== '0.1.0-SNAPSHOT' && /\d/.test(match[1]),
  },
  {
    id: 'package-json-dependency',
    applies: byExtension('package.json', 'package.json.ejs'),
    regex: () => /"((?:@[\w.-]+\/)?[\w.-]*[a-zA-Z][\w.-]*)"[ \t]*:[ \t]*"([~^>=<]*\d[^"]*)"/g,
    keep: (match) => match[1] !== 'version',
  },
  {
    id: 'npm-range-in-adapter',
    applies: isAdapterSource,
    regex: () =>
      /['"]?((?:@[\w.-]+\/)?[\w.-]*[a-zA-Z][\w.-]*)['"]?[ \t]*:[ \t]*['"]([~^]?\d+\.\d+(?:\.\d+)?[\w.-]*)['"]/g,
    keep: (match) => match[1] !== 'version',
  },
  {
    id: 'cargo-requirement',
    applies: (file) => byExtension('Cargo.toml', 'Cargo.toml.ejs')(file) || isAdapterSource(file),
    regex: () => /^[ \t]*([\w-]+)[ \t]*=[ \t]*(?:\{[^}\n]*?version[ \t]*=[ \t]*)?"(\d[^"]*)"/gm,
    keep: (match) => match[1] !== 'version',
  },
  {
    id: 'go-directive',
    applies: byExtension('go.mod', 'go.mod.ejs'),
    regex: () => /^go[ \t]+(\d[\w.]*)/gm,
  },
  {
    id: 'dockerfile-from',
    applies: (file) => /(?:^|\/)Dockerfile[^/]*$/.test(file),
    regex: () => /^FROM[ \t]+[\w./-]+:([\w.-]+)/gim,
  },
  {
    id: 'workflow-uses',
    applies: byExtension('.yml', '.yml.ejs', '.yaml', '.yaml.ejs'),
    regex: () => /\buses:[ \t]*[\w./-]+@([\w.-]+)/g,
  },
  {
    id: 'workflow-toolchain-version',
    applies: byExtension('.yml', '.yml.ejs', '.yaml', '.yaml.ejs'),
    regex: () => /\b(?:java|node|go)-version:[ \t]*'?(\d[\w.]*)'?/g,
  },
  {
    id: 'yaml-image',
    applies: byExtension('.yml', '.yml.ejs', '.yaml', '.yaml.ejs'),
    regex: () => /^[ \t]*image:[ \t]*([\w./-]+:[\w.-]+)[ \t]*$/gm,
  },
  {
    id: 'json-image',
    applies: byExtension('.json', '.json.ejs'),
    regex: () => /"image":[ \t]*"([\w./:-]+)"/g,
  },
  {
    id: 'container-reference',
    applies: () => true,
    regex: () =>
      /\b(?:(?:ghcr\.io|quay\.io|gcr\.io|cgr\.dev|mcr\.microsoft\.com)\/[\w./-]+|otel\/[\w-]+|grafana\/[\w-]+|prom\/[\w-]+|flyway\/flyway|postgres|nginx|eclipse-temurin|golang|alpine):(?:v?\d[\w.-]*|latest|nonroot|ubuntu|alpine[\w.-]*)\b/g,
  },
  {
    id: 'adapter-version-constant',
    applies: isAdapterSource,
    regex: () =>
      /\b[A-Z][A-Z0-9_]*VERSION[A-Z0-9_]*[ \t]*=[ \t]*'([^']+)'|\bversion:[ \t]*'(\d[^']*)'/g,
  },
];

const sweep = (): SweepHit[] =>
  scannedFiles()
    .filter((file) => file !== registryFile)
    .flatMap((file) => {
      const content = contentOf(file);
      return detectors
        .filter((detector) => detector.applies(file))
        .flatMap((detector) =>
          [...content.matchAll(detector.regex())]
            .filter((match) => detector.keep?.(match as RegExpExecArray) ?? true)
            .map((match) => ({
              detector: detector.id,
              file,
              start: match.index,
              end: match.index + match[0].length,
              text: match[0],
            })),
        );
    });

const overlaps = (hit: SweepHit, claim: PinMatch) =>
  hit.file === claim.file && hit.start < claim.end && claim.start < hit.end;

describe('the version-pin registry', () => {
  it('is the registry the currency workflow reads', () => {
    // Nailing the path down here keeps the guard and the workflow
    // pointed at the same file if either ever moves.
    expect(registryPath.endsWith(registryFile.split('/').join(path.sep))).toBe(true);
  });

  it('gives every pin a unique id', () => {
    const ids = registry.map((pin) => pin.id);
    const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
    expect(duplicated).toEqual([]);
  });

  it('has no dead locations — every glob+pattern still finds at least one occurrence', () => {
    const dead = allMatches.flatMap(({ pin, locations }) =>
      locations
        .filter(({ matches }) => matches.length === 0)
        .map(({ location }) => `${pin.id}: ${location.glob} :: ${location.pattern}`),
    );
    expect(dead).toEqual([]);
  });

  it('matches the templates — every occurrence carries the recorded value', () => {
    const stale = allMatches.flatMap(({ pin, locations }) =>
      locations.flatMap(({ matches }) =>
        matches
          .filter((match) => match.captured !== match.expected)
          .map(
            (match) =>
              `${pin.id}: ${match.file} has "${match.captured}", registry says "${match.expected}"`,
          ),
      ),
    );
    expect(stale).toEqual([]);
  });

  it('claims every pin-shaped string the sweep finds', () => {
    const claims = allMatches.flatMap(({ locations }) =>
      locations.flatMap(({ matches }) => matches),
    );
    const unclaimed = sweep()
      .filter((hit) => !claims.some((claim) => overlaps(hit, claim)))
      .map((hit) => `[${hit.detector}] ${hit.file}: ${hit.text.trim()}`);
    expect(unclaimed).toEqual([]);
  });

  it('still sees the surfaces the registry describes', () => {
    // If the scan roots rot (a rename, a move), every other assertion
    // here can pass vacuously. The sweep finding a healthy number of
    // pins is the canary; today it finds several hundred.
    expect(sweep().length).toBeGreaterThan(100);
  });
});
