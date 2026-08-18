/**
 * The weekly version-currency report (roadmap #75).
 *
 * One test per entry in `assets/composition/version-pins.json` that
 * names an upstream feed: fetch the current latest stable, compare it
 * against the value the templates pin, and fail — with the pin, the
 * pinned value, and the latest — when they have drifted apart. The
 * red X names the pin, the way the e2e grid's red X names the cell.
 *
 * Deliberately not a PR gate: an upstream release must never turn an
 * unrelated PR red, so this suite self-skips everywhere except the
 * scheduled `version-currency` workflow (opt in with
 * `KEEL_RUN_CURRENCY=1`). A red run there is the report, not a build
 * failure to fix in place — bumping a pin remains a human-reviewed
 * change, proved by the e2e grid, that also updates the registry (the
 * offline guard in `tests/version-pins.test.ts` holds the two
 * together).
 *
 * Comparison policy is per check type: `exact` feeds compare outright,
 * `major` feeds compare majors (image tags, action refs), range pins
 * (npm carets, Cargo requirements) drift only when the latest stable
 * escapes the range — a caret that still covers the latest needs no
 * bump.
 */

import { describe, expect, it } from 'vitest';
import { loadRegistry, type Pin, type PinCheck } from '../support/version-pins.js';

const optedIn = process.env.KEEL_RUN_CURRENCY === '1';

const registry = loadRegistry();
const checkable = registry.filter((pin) => pin.check.type !== 'none');

const fetchOk = async (url: string, headers: Record<string, string> = {}): Promise<Response> => {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`${url} answered HTTP ${response.status}`);
  }
  return response;
};

const fetchText = async (url: string): Promise<string> => (await fetchOk(url)).text();

const fetchJson = async (url: string, headers: Record<string, string> = {}): Promise<unknown> =>
  (await fetchOk(url, headers)).json();

const numeric = (segment: string): number | undefined =>
  /^\d+$/.test(segment) ? Number(segment) : undefined;

const segments = (version: string): string[] => version.split(/[.-]/);

/** Numeric-aware comparison; enough for release feeds, not full semver. */
const compareVersions = (a: string, b: string): number => {
  const left = segments(a);
  const right = segments(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const l = left[i] ?? '0';
    const r = right[i] ?? '0';
    const ln = numeric(l);
    const rn = numeric(r);
    const order = ln !== undefined && rn !== undefined ? ln - rn : l.localeCompare(r, 'en');
    if (order !== 0) return order < 0 ? -1 : 1;
  }
  return 0;
};

const PRERELEASE = /^(alpha|beta|rc|cr|m|milestone|snapshot|preview|ea|dev|next)\d*$/i;

const isStable = (version: string): boolean =>
  segments(version).every((segment) => !PRERELEASE.test(segment));

const latestStableOf = (versions: string[]): string => {
  const stable = versions.filter(isStable);
  if (stable.length === 0) throw new Error('no stable version in feed');
  return stable.reduce((max, candidate) => (compareVersions(candidate, max) > 0 ? candidate : max));
};

const major = (version: string): number => {
  const first = numeric(segments(version.replace(/^v/, ''))[0]);
  if (first === undefined) throw new Error(`no numeric major in "${version}"`);
  return first;
};

/**
 * Caret compatibility, npm and Cargo alike: the latest is covered when
 * it agrees with the requirement up to its leftmost nonzero component
 * and is not older than it.
 */
const caretSatisfies = (latest: string, requirement: string): boolean => {
  const base = segments(requirement).map(numeric);
  const got = segments(latest).map(numeric);
  if (base.some((n) => n === undefined) || got.some((n) => n === undefined)) return false;
  const pivot = Math.max(
    base.findIndex((n) => n !== 0),
    0,
  );
  for (let i = 0; i <= pivot; i += 1) {
    if ((got[i] ?? 0) !== (base[i] ?? 0)) return false;
  }
  return compareVersions(latest, requirement) >= 0;
};

const rangeSatisfies = (latest: string, range: string): boolean => {
  if (range.startsWith('^')) return caretSatisfies(latest, range.slice(1));
  if (range.startsWith('>=')) return compareVersions(latest, range.slice(2)) >= 0;
  if (/^\d/.test(range)) return caretSatisfies(latest, range);
  throw new Error(`unsupported range "${range}"`);
};

const mavenMetadataVersions = async (repository: string, path: string): Promise<string[]> => {
  const xml = await fetchText(`${repository}/${path}/maven-metadata.xml`);
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((match) => match[1]);
};

const githubHeaders = (): Record<string, string> => ({
  accept: 'application/vnd.github+json',
  'user-agent': 'keel-version-currency',
  ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
});

const memo = new Map<string, Promise<string>>();

const memoized = (key: string, resolve: () => Promise<string>): Promise<string> => {
  let pending = memo.get(key);
  if (!pending) {
    pending = resolve();
    memo.set(key, pending);
  }
  return pending;
};

/** The current upstream latest stable for a check, fetched once per feed. */
const latestFor = (check: Exclude<PinCheck, { type: 'none' }>): Promise<string> => {
  switch (check.type) {
    case 'maven':
      return memoized(`maven:${check.group}:${check.artifact}`, async () =>
        latestStableOf(
          await mavenMetadataVersions(
            'https://repo1.maven.org/maven2',
            `${check.group.replace(/\./g, '/')}/${check.artifact}`,
          ),
        ),
      );
    case 'gradle-plugin':
      return memoized(`gradle-plugin:${check.pluginId}`, async () =>
        latestStableOf(
          await mavenMetadataVersions(
            'https://plugins.gradle.org/m2',
            `${check.pluginId.replace(/\./g, '/')}/${check.pluginId}.gradle.plugin`,
          ),
        ),
      );
    case 'gradle-current':
      return memoized('gradle-current', async () => {
        const current = (await fetchJson('https://services.gradle.org/versions/current')) as {
          version: string;
        };
        return current.version;
      });
    case 'npm':
      return memoized(`npm:${check.package}`, async () => {
        const packument = (await fetchJson(
          `https://registry.npmjs.org/${encodeURIComponent(check.package)}`,
        )) as { 'dist-tags': { latest: string } };
        return packument['dist-tags'].latest;
      });
    case 'crate':
      return memoized(`crate:${check.crate}`, async () => {
        const info = (await fetchJson(`https://crates.io/api/v1/crates/${check.crate}`, {
          'user-agent': 'keel-version-currency (https://github.com/rgoussu-dev/keel)',
        })) as { crate: { max_stable_version: string } };
        return info.crate.max_stable_version;
      });
    case 'node-lts':
      return memoized('node-lts', async () => {
        const releases = (await fetchJson('https://nodejs.org/dist/index.json')) as {
          version: string;
          lts: string | false;
        }[];
        const lts = releases.find((release) => release.lts !== false);
        if (!lts) throw new Error('no LTS release in the Node feed');
        return String(major(lts.version));
      });
    case 'jdk-lts':
      return memoized('jdk-lts', async () => {
        const info = (await fetchJson('https://api.adoptium.net/v3/info/available_releases')) as {
          most_recent_lts: number;
        };
        return String(info.most_recent_lts);
      });
    case 'go-toolchain':
      return memoized('go-toolchain', async () => {
        const releases = (await fetchJson('https://go.dev/dl/?mode=json')) as {
          version: string;
          stable: boolean;
        }[];
        const latest = releases.find((release) => release.stable);
        if (!latest) throw new Error('no stable release in the Go feed');
        return latest.version.replace(/^go/, '').split('.').slice(0, 2).join('.');
      });
    case 'github-release':
      return memoized(`github-release:${check.repo}`, async () => {
        const release = (await fetchJson(
          `https://api.github.com/repos/${check.repo}/releases/latest`,
          githubHeaders(),
        )) as { tag_name: string };
        return release.tag_name.replace(/^v/, '');
      });
    case 'endoflife':
      return memoized(`endoflife:${check.product}`, async () => {
        const cycles = (await fetchJson(`https://endoflife.date/api/${check.product}.json`)) as {
          cycle: string | number;
        }[];
        return String(cycles[0].cycle);
      });
  }
};

/** True when the pinned value still is (or still covers) the latest stable. */
const current = (pin: Pin, latest: string): boolean => {
  const check = pin.check;
  switch (check.type) {
    case 'maven':
      return check.track === 'major'
        ? major(latest) === major(pin.value)
        : compareVersions(latest, pin.value) === 0;
    case 'github-release':
      return check.track === 'major'
        ? major(latest) === major(pin.value)
        : compareVersions(latest, pin.value) === 0;
    case 'npm':
    case 'crate':
      return rangeSatisfies(latest, pin.value);
    case 'node-lts':
    case 'jdk-lts':
    case 'endoflife':
      return major(latest) === major(pin.value);
    case 'go-toolchain':
      return latest === pin.value;
    case 'gradle-plugin':
    case 'gradle-current':
      return compareVersions(latest, pin.value) === 0;
    case 'none':
      return true;
  }
};

describe.skipIf(!optedIn)('version currency', () => {
  for (const pin of checkable) {
    it(`${pin.id} (${pin.value}) is still the latest stable`, async () => {
      const latest = await latestFor(pin.check as Exclude<PinCheck, { type: 'none' }>);
      if (!current(pin, latest)) {
        expect.fail(
          `${pin.id}: the templates pin ${pin.value}, upstream latest stable is ${latest} — ` +
            `${pin.description}. Bumping is a human-reviewed change: update the template(s) ` +
            `and this entry in assets/composition/version-pins.json together, and let the ` +
            `e2e grid prove it.`,
        );
      }
    });
  }
});
