#!/usr/bin/env node
// Dev runner behind `pnpm keel …`: run the built CLI (bin/keel.js →
// dist/) inside a playground directory instead of the repo root, since
// every keel command operates on the current working directory and pnpm
// scripts run at the package root. See docs/development.md → "Trying
// keel locally".
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(import.meta.url), '..', '..');
const cliBin = join(repoRoot, 'bin', 'keel.js');

let playground;
if (process.env.KEEL_PLAYGROUND) {
  playground = resolve(process.env.KEEL_PLAYGROUND);
  mkdirSync(playground, { recursive: true });
  playground = realpathSync(playground);
  const realRepoRoot = realpathSync(repoRoot);
  if (playground === realRepoRoot || playground.startsWith(realRepoRoot + sep)) {
    console.error(
      `keel-local: KEEL_PLAYGROUND (${playground}) is inside the keel repo — ` +
        'that would scaffold into the repo itself. Point it somewhere else.',
    );
    process.exit(1);
  }
} else {
  playground = mkdtempSync(join(tmpdir(), 'keel-playground-'));
}

console.error(`keel-local: running in ${playground}`);
const { status, error } = spawnSync(process.execPath, [cliBin, ...process.argv.slice(2)], {
  cwd: playground,
  stdio: 'inherit',
});
if (error) {
  console.error(`keel-local: ${error.message}`);
}
console.error(
  `keel-local: playground is ${playground} — reuse it with ` +
    `KEEL_PLAYGROUND=${playground} pnpm keel …`,
);
process.exit(status ?? 1);
