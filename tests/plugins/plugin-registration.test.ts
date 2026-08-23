/**
 * The plugin seam, end to end: a plugin outside `src/` registers a
 * stack and a vertical, and everything downstream treats them exactly
 * as it treats keel's own.
 *
 * **Wired the way `main` wires it**, and deliberately not through the
 * built binary. The composition root does three things with what the
 * loader returns — folds the pieces into the registry, routes the
 * plugin's template ids to its own assets, and hands both to the
 * handlers — and this suite does the same three, over the real
 * loader reading a real directory. A spawned-binary suite would add a
 * `tsc` and a process to prove the same seam, and would have to live
 * in `tests/e2e/` with a CI shard of its own; there is no third
 * behaviour between the two.
 *
 * The rule the fixture declares is the centre of it. `Conflict` is
 * read twice for a shipped piece — once to refuse an assembly, once
 * to keep the choice off the menu — and both readings are asserted
 * here against a piece keel never saw, through no special case.
 */

import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { catalogQuery } from '../../src/domain/contract/queries.js';
import { newProjectCommand } from '../../src/domain/contract/commands.js';
import {
  pluginOrigin,
  registryOf,
  shippedSource,
  type RegistrySource,
} from '../../src/domain/core/registry.js';
import {
  loadPlugins,
  PLUGINS_DIR,
  type LoadedPlugin,
} from '../../src/infrastructure/registry/plugin-loader.js';
import { ejsTemplateSource } from '../../src/infrastructure/template/ejs-template-source.js';
import { templateSourceFor } from '../../src/infrastructure/template/routing-template-source.js';
import { FakePrompt } from '../../src/infrastructure/prompt/fake.js';
import type { InstallDeps } from '../../src/domain/core/handlers/deps.js';
import { expectErr, expectOk, installMediator } from '../support/factory.js';

const fixtures = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'support',
  'fixtures',
  'plugins',
);

/**
 * Answers every shipped stack in the matrix below may ask for, so a
 * non-interactive scaffold of any of them resolves without a prompt.
 */
const SHIPPED_ANSWERS = {
  'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'com.acme.cli', projectName: 'demo' },
  'walking-skeleton/spring-cli-rest-kotlin-bootstrap': {
    basePackage: 'com.acme.app',
    projectName: 'demo',
  },
  'vcs/git-init': { remote: '', defaultBranch: 'main' },
};

/** The fixture's own ids, spelled once. */
const PLUGIN = 'acme';
const STACK = 'acme-widget';
const VERTICAL = 'acme-greeting';
const RULE = 'acme/fancy-needs-modulith';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-plugin-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Copies a fixture plugin into the project's discovery directory. */
async function install(name: string, as = name): Promise<void> {
  await fs.copy(path.join(fixtures, name), path.join(cwd, PLUGINS_DIR, as));
}

/** Exactly what `main` builds from what the loader returned. */
function sourceOf(loaded: LoadedPlugin): RegistrySource {
  return {
    origin: pluginOrigin(loaded.plugin.name),
    ...(loaded.plugin.stacks ? { stacks: loaded.plugin.stacks } : {}),
    ...(loaded.plugin.verticals ? { verticals: loaded.plugin.verticals } : {}),
  };
}

function assetRootsOf(plugins: readonly LoadedPlugin[]): ReadonlyMap<string, string> {
  const roots = new Map<string, string>();
  for (const loaded of plugins) {
    if (loaded.assetsRoot !== null) roots.set(loaded.plugin.name, loaded.assetsRoot);
  }
  return roots;
}

/** The mediator `main` would have wired for this project directory. */
async function mediatorFor(overrides: Partial<InstallDeps> = {}) {
  const plugins = await loadPlugins({ projectDir: cwd });
  return installMediator({
    registry: registryOf([shippedSource, ...plugins.map(sourceOf)]),
    templates: templateSourceFor(ejsTemplateSource, assetRootsOf(plugins)),
    ...overrides,
  });
}

describe('plugin discovery', () => {
  it('finds nothing in a project that has no plugins directory', async () => {
    expect(await loadPlugins({ projectDir: cwd })).toEqual([]);
  });

  it('loads a plugin from the project-owned .keel/plugins directory', async () => {
    await install(PLUGIN);
    const [loaded] = await loadPlugins({ projectDir: cwd });
    expect(loaded?.plugin.name).toBe(PLUGIN);
    expect(loaded?.assetsRoot).toBe(path.join(cwd, PLUGINS_DIR, PLUGIN, 'assets'));
  });

  it('loads a plugin named explicitly from outside the project', async () => {
    const [loaded] = await loadPlugins({
      projectDir: cwd,
      extraPaths: [path.join(fixtures, PLUGIN)],
    });
    expect(loaded?.plugin.name).toBe(PLUGIN);
  });
});

describe('keel new, from a plugin stack', () => {
  it('scaffolds the plugin stack, rendering the plugin s own template tree', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();

    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: false, dryRun: false }),
      ),
    );

    expect(report.subject).toBe(STACK);
    expect(report.committed).toBe(true);
    expect(await fs.readFile(path.join(cwd, 'GREETING.md'), 'utf8')).toContain('Hello, world!');
  });

  it('records the plugin vertical and its promoted tag in the manifest', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();
    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: false, dryRun: false }),
      ),
    );

    const manifest = (await fs.readJson(
      path.join(cwd, '.claude', '.keel-manifest.json'),
    )) as Record<string, unknown>;
    expect(manifest['verticals']).toEqual([expect.objectContaining({ id: VERTICAL })]);
    expect(manifest['tags']).toContain('acme.greeting');
  });

  it('refuses the combination the plugin s own rule forbids, naming the rule', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();

    const error = expectErr(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: STACK,
          answers: {},
          interactive: false,
          dryRun: false,
          buildSystem: 'fancy',
          moduleLayout: 'basic',
        }),
      ),
    );

    expect(error.message).toContain('needs a module boundary');
    expect(error.message).toContain(RULE);
    expect(error.message).toContain('acme.build.fancy + layout.basic');
    expect(await fs.pathExists(path.join(cwd, 'GREETING.md'))).toBe(false);
  });

  it('offers both module layouts under the build system the rule leaves alone', async () => {
    await install(PLUGIN);
    const prompt = new FakePrompt({
      buildSystem: 'plain',
      moduleLayout: 'basic',
      extraVerticals: '',
      who: 'menu',
      'keel.review': 'proceed',
    });
    const mediator = await mediatorFor({ prompt });

    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: true, dryRun: false }),
      ),
    );

    // Both build systems stay on their own menu: `fancy` is legal
    // under *some* layout, which is the question that dial asks.
    const builds = prompt.questions.find((question) => question.id === 'buildSystem');
    expect(builds?.choices?.map((choice) => choice.value)).toEqual(['plain', 'fancy']);

    const layouts = prompt.questions.find((question) => question.id === 'moduleLayout');
    expect(layouts?.choices?.map((choice) => choice.value)).toEqual(['basic', 'modulith']);
  });

  it('keeps the forbidden layout off the menu once the rule can bite', async () => {
    await install(PLUGIN);
    const prompt = new FakePrompt({
      buildSystem: 'fancy',
      extraVerticals: '',
      who: 'menu',
      'keel.review': 'proceed',
    });
    const mediator = await mediatorFor({ prompt });

    expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: true, dryRun: false }),
      ),
    );

    // With `fancy` settled, `basic` — the stack's own default — is
    // gone, and one remaining layout is not a question: the dial
    // resolves to it silently rather than offering a menu of one.
    // Same declaration as the refusal above, read the other way
    // round, so the combination the engine would refuse is one the
    // user is never walked into.
    expect(prompt.asked).not.toContain('moduleLayout');

    const manifest = (await fs.readJson(
      path.join(cwd, '.claude', '.keel-manifest.json'),
    )) as Record<string, unknown>;
    expect(manifest['tags']).toContain('layout.modulith');
    expect(manifest['tags']).not.toContain('layout.basic');
  });
});

describe("a plugin's deferred action", () => {
  it('runs after the tree is committed, through the ProcessRunner port', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();

    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd,
          stack: STACK,
          answers: { 'acme-greeting/file': { who: 'deferred' } },
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    // The stamp is written by a *subprocess* the action reached
    // through the port it was handed, into the project's own cwd —
    // so this asserts the plugin's action was wired to a real runner,
    // not merely that a callback of its ran.
    expect((await fs.readFile(path.join(cwd, 'acme-stamp.txt'), 'utf8')).trim()).toBe('deferred');
    // And after the commit, not before: the action may rely on the
    // files the Tree wrote already being on disk.
    expect(await fs.pathExists(path.join(cwd, 'GREETING.md'))).toBe(true);
  });

  it('appears in the plan under --dry-run, and does not run', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();

    const report = expectOk(
      await mediator.dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: false, dryRun: true }),
      ),
    );

    // A dry run never reaches `runActions` at all — the handler
    // stops before `commitScopes` — so the description in the report
    // is the whole of what a user is shown, and the only place a
    // plugin's side effect is declared before it happens.
    expect(report.committed).toBe(false);
    expect(report.actions).toContain('stamp the greeting for world');
    expect(await fs.pathExists(path.join(cwd, 'acme-stamp.txt'))).toBe(false);
    expect(await fs.pathExists(path.join(cwd, 'GREETING.md'))).toBe(false);
  });

  it('fails the run naming the action when it exits non-zero', async () => {
    await install(PLUGIN);
    // A runner that reports failure for everything, which is what a
    // missing tool looks like to an action.
    const mediator = await mediatorFor({
      processes: {
        run: () => ({ status: 1, stdout: '', stderr: 'no such thing' }),
      },
    });

    const error = await mediator
      .dispatch(
        newProjectCommand({ cwd, stack: STACK, answers: {}, interactive: false, dryRun: false }),
      )
      .then(
        () => null,
        (thrown: unknown) => thrown as Error,
      );

    expect(error?.message).toContain('acme-greeting/stamp');
    expect(error?.message).toContain('no such thing');
  });
});

describe('a shipped stack, with a plugin registered', () => {
  /** Every file under `root`, as path -> sha256, posix-separated. */
  async function fingerprint(root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) await walk(abs);
        else if (entry.isFile()) {
          const rel = path.relative(root, abs).split(path.sep).join('/');
          out[rel] = createHash('sha256')
            .update(await fs.readFile(abs))
            .digest('hex');
        }
      }
    };
    await walk(root);
    return out;
  }

  /**
   * Scaffolds `stack` into a fresh directory and fingerprints the
   * whole tree.
   *
   * **Every deferred action is skipped**, and that is the point
   * rather than a shortcut: this asks what *keel* writes, and an
   * action's output is written by `git`, `gradle` or `npm`. Letting
   * them run would compare their determinism instead of keel's —
   * `spotlessApply` in particular is best-effort, so a scaffolded
   * Kotlin tree is not byte-stable across runs no matter which keel
   * produced it. What an action does have is its own tests, above.
   *
   * The clock is the factory's pinned one, so even the manifest's
   * timestamps are stable, which is what lets this be a byte
   * comparison rather than a normalised one.
   */
  async function scaffold(
    stack: string,
    dials: Partial<Parameters<typeof newProjectCommand>[0]>,
    withPlugin: boolean,
  ): Promise<Record<string, string>> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-shipped-'));
    const plugins = withPlugin
      ? await loadPlugins({ projectDir: cwd, extraPaths: [path.join(fixtures, PLUGIN)] })
      : [];
    const mediator = installMediator({
      registry: registryOf([shippedSource, ...plugins.map(sourceOf)]),
      templates: templateSourceFor(ejsTemplateSource, assetRootsOf(plugins)),
      runDeferred: () => Promise.resolve(),
    });
    expectOk(
      await mediator.dispatch(
        newProjectCommand({
          cwd: root,
          stack,
          answers: SHIPPED_ANSWERS,
          interactive: false,
          dryRun: false,
          ...dials,
        }),
      ),
    );
    try {
      return await fingerprint(root);
    } finally {
      await fs.remove(root);
    }
  }

  /**
   * One case per shape the registry could plausibly be read
   * differently for: both module layouts, both JVM build systems,
   * a Kotlin binding, and a family whose stack declares no dials at
   * all.
   */
  const SHAPES: readonly {
    readonly stack: string;
    readonly dials: Partial<Parameters<typeof newProjectCommand>[0]>;
  }[] = [
    { stack: 'quarkus-cli', dials: { buildSystem: 'gradle', moduleLayout: 'basic' } },
    {
      stack: 'spring-cli-rest-kotlin',
      dials: { buildSystem: 'maven', moduleLayout: 'modulith', withPeerContext: true },
    },
    { stack: 'ts-http', dials: { buildSystem: 'npm' } },
    { stack: 'go-cli', dials: {} },
  ];

  it.each(SHAPES)(
    'scaffolds $stack byte-for-byte what it scaffolds with no plugin present',
    async ({ stack, dials }) => {
      const [without, withOne] = await Promise.all([
        scaffold(stack, dials, false),
        scaffold(stack, dials, true),
      ]);

      // Not `toEqual` on the digests alone: comparing the path sets
      // first turns "the plugin added or dropped a file" into a
      // readable diff instead of a wall of hashes.
      expect(Object.keys(withOne).sort()).toEqual(Object.keys(without).sort());
      expect(withOne).toEqual(without);
      expect(Object.keys(without).length).toBeGreaterThan(10);
    },
  );
});

describe('keel.catalog', () => {
  it('reports plugin pieces alongside shipped ones', async () => {
    await install(PLUGIN);
    const mediator = await mediatorFor();
    const catalog = expectOk(await mediator.dispatch(catalogQuery()));

    const stackIds = catalog.stacks.map((stack) => stack.id);
    expect(stackIds).toContain(STACK);
    expect(stackIds).toContain('quarkus-cli');

    const verticalIds = catalog.verticals.map((vertical) => vertical.id);
    expect(verticalIds).toContain(VERTICAL);
    expect(verticalIds).toContain('persistence');

    // The drill-down is derived, so the plugin's language node is
    // there without `keel ui` knowing a plugin exists.
    const acme = catalog.finder.languages.find((language) => language.id === 'acme');
    expect(acme?.combinations.flatMap((c) => c.frameworks.map((f) => f.stack))).toContain(STACK);
  });

  it('reports exactly the shipped pieces when no plugin is present', async () => {
    const withPlugin = expectOk(await (await mediatorFor()).dispatch(catalogQuery()));
    const shipped = expectOk(await installMediator().dispatch(catalogQuery()));
    expect(withPlugin).toEqual(shipped);
  });
});

describe('a plugin that cannot be loaded', () => {
  /** Loads one fixture by path, returning whatever it threw. */
  async function failure(name: string): Promise<Error> {
    try {
      await loadPlugins({ projectDir: cwd, extraPaths: [path.join(fixtures, name)] });
    } catch (error) {
      return error as Error;
    }
    throw new Error(`expected plugin '${name}' to fail loading`);
  }

  it('names the plugin when its module throws at load', async () => {
    const error = await failure('throws');
    expect(error.message).toContain(path.join('throws', 'keel-plugin.js'));
    expect(error.message).toContain('acme boom');
  });

  it('names the plugin directory when it has no entry module', async () => {
    const error = await failure('no-entry');
    expect(error.message).toContain('no-entry');
    expect(error.message).toContain('keel-plugin.js');
  });
});

describe('a plugin whose pieces are malformed', () => {
  /** Registers one fixture's pieces, returning whatever it threw. */
  async function refusal(name: string): Promise<Error> {
    const plugins = await loadPlugins({ projectDir: cwd, extraPaths: [path.join(fixtures, name)] });
    try {
      registryOf([shippedSource, ...plugins.map(sourceOf)]);
    } catch (error) {
      return error as Error;
    }
    throw new Error(`expected plugin '${name}' to be refused`);
  }

  it('names the plugin for a conflict validateConflict refuses', async () => {
    const error = await refusal('malformed-conflict');
    expect(error.message).toContain("plugin 'acme-malformed'");
    expect(error.message).toContain('empty');
  });

  it('names the plugin for a dimension none of its adapters covers', async () => {
    const error = await refusal('uncovered-dimension');
    expect(error.message).toContain("plugin 'acme-uncovered'");
    expect(error.message).toContain("dimension 'boostrap'");
  });

  it('names both claimants when an id collides with a shipped piece', async () => {
    const error = await refusal('collides');
    expect(error.message).toContain("plugin 'acme-collides'");
    expect(error.message).toContain("vertical 'persistence'");
    expect(error.message).toContain('keel');
  });
});
