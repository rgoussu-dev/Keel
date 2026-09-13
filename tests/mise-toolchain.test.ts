/**
 * The consumer for `mise.toml` — the one file every runner and every
 * workstation provisions the toolchain from.
 *
 * `.github/workflows/ci.yml` installs each e2e shard's tools through
 * mise, deriving the list from the binaries the shard probes for, and
 * `.claude/hooks/session-start.sh` installs the whole file on a web
 * session. Three things can drift apart there and read as green:
 *
 *   - the Gradle the file pins and the Gradle every generated wrapper
 *     is told to use — the host `gradle` only runs `gradle wrapper`,
 *     but Gradle 8.x cannot start on JDK 25, so the two must match;
 *   - a probe name the matrix uses that the workflow's mapping does
 *     not know — the derivation step fails loudly on the runner, but
 *     a minute here beats a JVM build there;
 *   - a tool the mapping names that the file does not declare — mise
 *     would install nothing for it, and the shard would then skip
 *     every suite it was given.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string): string => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

/**
 * The `[tools]` table of a flat mise.toml, `name → version`. A regex
 * rather than a TOML parser: the file is one table of string values
 * and the repo carries no TOML dependency to spend on it.
 */
const miseTools = (): Record<string, string> => {
  const table = /\[tools\]\n([\s\S]*?)(?:\n\[|$)/.exec(read('mise.toml'))?.[1] ?? '';
  return Object.fromEntries(
    [...table.matchAll(/^([\w-]+)\s*=\s*"([^"]+)"/gm)].map(([, name, version]) => [
      name!,
      version!,
    ]),
  );
};

/**
 * What each probe name in the e2e matrix asks mise for. Mirrors the
 * `case` in the workflow's "Name the toolchain this shard installs"
 * step; a probe absent from both lists is the failure this guards.
 * `docker` and `browser` are the runner's own, `npm` ships with node.
 */
const MISE_TOOL_FOR_PROBE: Record<string, string | null> = {
  java: 'java',
  javac: 'java',
  gradle: 'gradle',
  mvn: 'maven',
  go: 'go',
  cargo: 'rust',
  npm: 'node',
  pnpm: 'pnpm',
  docker: null,
  browser: null,
};

const probeNames = (): string[] => {
  const workflow = parse(read('.github/workflows/ci.yml')) as {
    jobs: { e2e: { strategy: { matrix: { shard: { tools: string }[] } } } };
  };
  return [
    ...new Set(workflow.jobs.e2e.strategy.matrix.shard.flatMap((s) => s.tools.trim().split(/\s+/))),
  ];
};

describe('the mise toolchain file', () => {
  it('pins the Gradle every generated wrapper is told to use', () => {
    const source = read('src/domain/core/adapters/gradle-wrapper.ts');
    const wrapper = /const GRADLE_VERSION = '([^']+)'/.exec(source)?.[1];
    expect(wrapper).toBeDefined();
    expect(miseTools()['gradle']).toBe(wrapper);
  });

  it('spells the JDK the way keel itself emits it, on the release the projects target', () => {
    expect(miseTools()['java']).toBe('temurin-25');
  });

  it('declares every tool the e2e matrix can ask mise for', () => {
    const declared = Object.keys(miseTools());
    for (const probe of probeNames()) {
      expect(probe in MISE_TOOL_FOR_PROBE, `probe '${probe}' has no mise mapping`).toBe(true);
      const tool = MISE_TOOL_FOR_PROBE[probe];
      if (tool !== null)
        expect(declared, `mise.toml lacks '${tool}' for '${probe}'`).toContain(tool);
    }
  });

  it('declares the two tools every job installs', () => {
    expect(Object.keys(miseTools())).toEqual(expect.arrayContaining(['node', 'pnpm']));
  });
});

describe('the web session hook', () => {
  const hook = read('.claude/hooks/session-start.sh');

  it('installs a pinned mise release, checked against checksums the hook carries', () => {
    // This runs with shell privileges before the project is trusted,
    // so it never executes what an installer endpoint serves that day.
    expect(hook).not.toContain('mise.run');
    expect(hook).not.toMatch(/curl[^\n]*\|\s*(ba)?sh/);
    const version = /^MISE_VERSION="(v\d{4}\.\d{1,2}\.\d{1,2})"$/m.exec(hook)?.[1];
    expect(version).toBeDefined();
    for (const arch of ['X64', 'ARM64']) {
      expect(hook).toMatch(new RegExp(`^MISE_SHA256_${arch}="[0-9a-f]{64}"$`, 'm'));
    }
    expect(hook).toContain(
      'https://github.com/jdx/mise/releases/download/${MISE_VERSION}/${tarball}',
    );
    expect(hook).toContain('sha256sum -c');
  });
});
