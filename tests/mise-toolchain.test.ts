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
 * What each probe name in the e2e matrix must ask mise for — the
 * relationship itself, not a copy of the workflow's table: the
 * workflow's `case` is parsed below and held to this, so a shard
 * whose probe quietly mapped onto the wrong tool (`mvn` installing
 * gradle, say) fails here rather than skipping every Maven suite on
 * the runner. `docker` and `browser` are the runner's own, `npm`
 * ships with node.
 */
const MISE_TOOL_FOR_PROBE: Record<string, string | null> = {
  java: 'java',
  javac: 'java',
  gradle: 'gradle',
  mvn: 'maven',
  go: 'go',
  cargo: 'rust',
  // node and pnpm are what runs vitest, so every shard seeds them
  // (`tools="node pnpm"`, asserted below) and the arms add nothing.
  npm: null,
  pnpm: null,
  docker: null,
  browser: null,
};

interface E2eJob {
  strategy: { matrix: { shard: { tools: string }[] } };
  steps: { name?: string; run?: string }[];
}

const e2eJob = (): E2eJob =>
  (parse(read('.github/workflows/ci.yml')) as { jobs: { e2e: E2eJob } }).jobs.e2e;

const probeNames = (): string[] => [
  ...new Set(e2eJob().strategy.matrix.shard.flatMap((s) => s.tools.trim().split(/\s+/))),
];

/**
 * The workflow's own probe → tool table, read out of the shell `case`
 * in its "Name the toolchain this shard installs" step: one arm per
 * `pattern) tools="$tools <tool>" ;;` line, `null` for the arms that
 * install nothing. The default arm (`*)`) exits and is not a mapping.
 */
const workflowToolForProbe = (): Record<string, string | null> => {
  const step = e2eJob().steps.find((s) => s.name === 'Name the toolchain this shard installs');
  expect(step?.run, 'the toolchain-naming step').toBeDefined();
  const mapping: Record<string, string | null> = {};
  for (const arm of step!.run!.matchAll(/^\s*([\w|-]+)\)\s*(?:tools="\$tools (\w+)")?\s*;;/gm)) {
    for (const probe of arm[1]!.split('|')) mapping[probe] = arm[2] ?? null;
  }
  return mapping;
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

  it('maps every probe the workflow knows onto the tool it must install', () => {
    expect(workflowToolForProbe()).toEqual(MISE_TOOL_FOR_PROBE);
    const step = e2eJob().steps.find((s) => s.name === 'Name the toolchain this shard installs');
    expect(step?.run).toContain('tools="node pnpm"');
  });

  it('declares every tool the e2e matrix can ask mise for', () => {
    const declared = Object.keys(miseTools());
    const mapping = workflowToolForProbe();
    for (const probe of probeNames()) {
      expect(probe in mapping, `probe '${probe}' has no mise mapping`).toBe(true);
      const tool = mapping[probe];
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
