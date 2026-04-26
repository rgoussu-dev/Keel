import path from 'node:path';
import fs from 'fs-extra';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { logger } from '../util/log.js';
import { sha256 } from '../util/hash.js';
import { paths } from '../util/paths.js';
import type { Manifest, ManifestEntry } from '../manifest/schema.js';
import { readManifest, writeManifest } from '../manifest/store.js';
import { buildEngine } from '../schematics/registry.js';
import { InMemoryTree } from '../engine/tree.js';
import { cliPrompt } from '../engine/homegrown.js';
import type { Context, Engine, Options, TreeChange } from '../engine/types.js';
import { preflight, realEnv, reportFindings, type Env } from './env.js';
import { pickStack, type Prompt, type StackChoice } from './profile.js';

const CLAUDE_DIR = '.claude';

/**
 * Resolves the current kit version from the packaged `package.json`.
 * Stamped into the manifest so `update` can detect out-of-date installs.
 */
function kitVersion(): string {
  const pkgPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    'package.json',
  );
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string };
  return pkg.version;
}

export interface InstallOptions {
  cwd: string;
  force: boolean;
  dryRun: boolean;
  /** Prompt port; defaults to the CLI prompt. Tests inject a fake. */
  prompt?: Prompt;
  /** Environment-probe port; defaults to {@link realEnv}. Tests inject a fake. */
  env?: Env;
}

/**
 * Greenfield-only context-aware install. Detects an empty workspace,
 * progressively asks the user for their stack (language → framework →
 * native?), runs an environment preflight, then composes the chosen
 * schematics through the engine onto a single shared tree:
 *
 *   1. `claude-core` — universal Claude scaffold under `.claude/`.
 *   2. `claude-<framework>` — stack-tailored runbook skills + addendum.
 *   3. `<framework.walkingSkeleton>` — project skeleton at the repo
 *      root, when the chosen framework declares one.
 *
 * The manifest tracks files written under `.claude/` only — the
 * walking-skeleton output is the user's project code from the moment
 * it's written. Brownfield support (running install over an existing
 * project) is not yet implemented; the install refuses unless `force`
 * is set. The user's home directory (`~/.claude`) is never touched.
 */
export async function install(opts: InstallOptions): Promise<void> {
  const targetRoot = paths.project(opts.cwd);
  const prompt = opts.prompt ?? cliPrompt;
  const env = opts.env ?? realEnv;

  const existing = await readManifest(targetRoot);
  if (existing && !opts.force) {
    logger.error(
      `manifest already present at ${targetRoot} (kit ${existing.kitVersion}). ` +
        `use \`keel update\` to upgrade, or \`--force\` to reinstall.`,
    );
    throw new Error('install refused: existing manifest');
  }

  if (!(await isGreenfield(opts.cwd)) && !opts.force) {
    logger.error(
      `directory ${opts.cwd} is not empty (contains files other than \`.git\`). ` +
        `brownfield install support is upcoming — run \`keel install\` from a fresh ` +
        `directory, or pass \`--force\` to install over the existing tree (advanced).`,
    );
    throw new Error('install refused: brownfield');
  }

  const choice = await pickStack(prompt);

  const findings = await preflight(env, {
    stack: choice.framework.id === 'quarkus' ? 'java-quarkus' : 'none',
    native: choice.native,
  });
  const fatal = reportFindings(findings, logger);
  if (fatal && !opts.force) {
    throw new Error('install refused: env preflight failed (use --force to override)');
  }

  const skeletonOptions = choice.framework.walkingSkeleton
    ? await collectWalkingSkeletonOptions(prompt)
    : null;

  const engine = buildEngine();
  const tree = new InMemoryTree(opts.cwd);
  const sources = new Map<string, string>();
  const shippedHashes = new Map<string, string>();

  await runOnto(
    engine,
    tree,
    opts.cwd,
    prompt,
    'claude-core',
    {},
    sources,
    shippedHashes,
    opts.dryRun,
  );
  await runOnto(
    engine,
    tree,
    opts.cwd,
    prompt,
    choice.framework.claudeSchematic,
    {},
    sources,
    shippedHashes,
    opts.dryRun,
  );
  if (choice.framework.walkingSkeleton && skeletonOptions) {
    await runOnto(
      engine,
      tree,
      opts.cwd,
      prompt,
      choice.framework.walkingSkeleton,
      skeletonOptions,
      sources,
      shippedHashes,
      opts.dryRun,
    );
  }

  const changes = tree.changes();
  if (changes.length === 0) {
    logger.info('nothing to install');
    return;
  }

  printPlan(changes);

  if (opts.dryRun) {
    logger.info('dry run — nothing written');
    return;
  }

  await tree.commit();

  const now = new Date().toISOString();
  const entries = await buildManifestEntries(opts.cwd, changes, sources, shippedHashes, now);
  const manifest: Manifest = {
    kitVersion: kitVersion(),
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    entries,
  };
  await writeManifest(targetRoot, manifest);

  const projectFiles = changes.length - entries.length;
  logger.success(
    `installed ${entries.length} tracked file(s)` +
      (projectFiles > 0 ? `; ${projectFiles} project file(s) written (untracked).` : ''),
  );
}

/**
 * Runs a single schematic against the shared tree, with a Context whose
 * `invoke` recurses through the same tree (so composing schematics like
 * `walking-skeleton` see their sub-schematics' writes). For each path
 * this run is the first to create, the schematic name is recorded in
 * `sources` and the at-creation content hash in `shippedHashes`. The
 * latter is what the manifest later stamps as `sha256Shipped` so an
 * `update` doesn't mistake a sibling schematic's composition (e.g.
 * `claude-quarkus` appending an addendum to `claude-core`'s
 * `CLAUDE.md`) for an unmodified file and silently strip it.
 */
async function runOnto(
  engine: Engine,
  tree: InMemoryTree,
  cwd: string,
  prompt: Prompt,
  name: string,
  options: Options,
  sources: Map<string, string>,
  shippedHashes: Map<string, string>,
  dryRun: boolean,
): Promise<void> {
  const schematic = engine.get(name);
  if (!schematic) throw new Error(`unknown schematic: ${name}`);

  const before = new Set(tree.changes().map((c) => c.path));

  const ctx: Context = {
    logger,
    cwd,
    prompt,
    dryRun,
    async invoke(otherName, otherOpts) {
      const other = engine.get(otherName);
      if (!other) throw new Error(`unknown schematic (invoke): ${otherName}`);
      await other.run(tree, otherOpts, ctx);
    },
  };
  await schematic.run(tree, options, ctx);

  for (const change of tree.changes()) {
    if (before.has(change.path) || sources.has(change.path)) continue;
    sources.set(change.path, name);
    const content = tree.read(change.path);
    if (content) shippedHashes.set(change.path, sha256(content));
  }
}

async function isGreenfield(cwd: string): Promise<boolean> {
  if (!(await fs.pathExists(cwd))) return true;
  const entries = await fs.readdir(cwd);
  return entries.every((e) => e === '.git');
}

interface WalkingSkeletonVars extends Options {
  basePackage: string;
  projectName: string;
  githubRemote: string;
}

/**
 * Pre-collects the parameters the walking-skeleton schematic needs at
 * the project level: base Java package, gradle/cloud-run service name,
 * optional GitHub remote. Other walking-skeleton parameters
 * (applicationKind, deployTarget, starterPort, starterAggregate) carry
 * sensible defaults inside that schematic.
 */
async function collectWalkingSkeletonOptions(prompt: Prompt): Promise<WalkingSkeletonVars> {
  const basePackage = await prompt<string>({
    kind: 'input',
    name: 'basePackage',
    message: 'base java package (e.g. com.example)',
    validate: (v: string) =>
      /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(v) ||
      'expected dotted lowercase package, e.g. com.example.app',
  });
  const projectName = await prompt<string>({
    kind: 'input',
    name: 'projectName',
    message: 'gradle root project name (lowercase + digits + dashes)',
    validate: (v: string) =>
      /^[a-z][a-z0-9-]{0,62}$/.test(v) ||
      'lowercase letters, digits, dashes; start with a letter; 63 chars max',
  });
  const githubRemote = await prompt<string>({
    kind: 'input',
    name: 'githubRemote',
    message: 'origin remote URL (leave empty to skip)',
    default: '',
  });
  return { basePackage, projectName, githubRemote };
}

function printPlan(changes: readonly TreeChange[]): void {
  for (const c of changes) {
    const tag = c.kind === 'create' ? '+' : c.kind === 'modify' ? '~' : '-';
    logger.info(`  ${tag} ${c.path}`);
  }
}

async function buildManifestEntries(
  cwd: string,
  changes: readonly TreeChange[],
  sources: Map<string, string>,
  shippedHashes: Map<string, string>,
  now: string,
): Promise<ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  const claudePrefix = `${CLAUDE_DIR}/`;
  for (const change of changes) {
    if (change.kind === 'delete') continue;
    if (!change.path.startsWith(claudePrefix)) continue;
    const target = change.path.slice(claudePrefix.length);
    const abs = path.join(cwd, change.path);
    const content = await fs.readFile(abs);
    const currentHash = sha256(content);
    const sourceSchematic = sources.get(change.path) ?? 'claude-core';
    // sha256Shipped is the first writer's content. For files composed
    // by a later schematic (e.g. claude-quarkus appending the addendum
    // to claude-core's CLAUDE.md), it differs from sha256Current — that
    // gap signals "non-trivial composition" to `keel update`, which
    // then routes the file through the user-modified-conflict path
    // instead of silently overwriting and dropping the addendum.
    const shippedHash = shippedHashes.get(change.path) ?? currentHash;
    entries.push({
      source: path.posix.join(sourceSchematic, target),
      target,
      sha256Shipped: shippedHash,
      sha256Current: currentHash,
      installedAt: now,
    });
  }
  return entries;
}

// Re-export types kept for tests / consumers.
export type { StackChoice };
