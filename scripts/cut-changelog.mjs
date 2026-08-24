#!/usr/bin/env node
/**
 * Cuts `CHANGELOG.md` for a release: moves the `[Unreleased]` body
 * verbatim into `docs/releases/CHANGELOG.<version>.md` (with its own
 * compare link against the previous release in the index), leaves a
 * fresh empty `[Unreleased]`, prepends the release to the `## Releases`
 * index, and retargets the `[Unreleased]` compare ref. Deterministic:
 * same tree and arguments, same output. Refuses to cut twice.
 *
 *   node scripts/cut-changelog.mjs <version> [YYYY-MM-DD]
 */
import fs from 'node:fs';

const [version, date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!version || !/^\d+\.\d+\.\d+(-[0-9a-z]+(\.[0-9a-z]+)*)?$/i.test(version)) {
  fail('usage: node scripts/cut-changelog.mjs <version> [YYYY-MM-DD]');
}
const repo = 'https://github.com/rgoussu-dev/Keel';
const target = `docs/releases/CHANGELOG.${version}.md`;
if (fs.existsSync(target)) fail(`${target} already exists — this cut has already run`);

const root = fs.readFileSync('CHANGELOG.md', 'utf8');
const shape =
  /^([\s\S]*?\n## \[Unreleased\]\n)([\s\S]*?)\n## Releases\n\n([\s\S]*?)\n(\[Unreleased\]: [^\n]+\n)$/;
const match = root.match(shape);
if (!match) fail('CHANGELOG.md does not have the expected [Unreleased] + ## Releases shape');
const [, head, body, index] = match;
if (!body.trim()) fail('[Unreleased] is empty — nothing to cut');

const previous = index.match(/^- \[([^\]]+)\]/m)?.[1];
const compare = previous
  ? `${repo}/compare/v${previous}...v${version}`
  : `${repo}/releases/tag/v${version}`;
fs.writeFileSync(
  target,
  `## [${version}] — ${date}\n\n${body.trim()}\n\n[${version}]: ${compare}\n`,
);
const row = `- [${version}](${target}) — ${date}`;
fs.writeFileSync(
  'CHANGELOG.md',
  `${head}\n## Releases\n\n${row}\n${index}\n[Unreleased]: ${repo}/compare/v${version}...HEAD\n`,
);
console.log(`cut ${target} (compare base: ${previous ?? 'none'})`);
