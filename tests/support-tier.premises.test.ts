/**
 * The premises of the support tier's two proofs (roadmap T.2b, G5),
 * held on every cell keel offers.
 *
 * `src/domain/core/support-tier.ts` reads a cell no row of
 * `support-tier.json` names as first-class on one of two premises,
 * each measured before it was encoded:
 *
 *   - **P1, the harness twin.** A single-service cell scaffolded with
 *     `--no-agent-harness` is its twin with the harness, less the
 *     agent files: `AGENTS.md` and `CLAUDE.md` at the root and per
 *     directory, `.claude/`, `.gemini/` and `.aider.conf.yml`. Every
 *     file both hold has the same bytes and the same executable bit,
 *     and both queue the same deferred actions. Only the manifest, which
 *     records the harness, differs.
 *   - **P2, a product's services.** Every service with one key
 *     (`serviceKeys`, the function the rule reads) has the same files
 *     under its directory, its manifest among them, and queues the same
 *     deferred actions, whichever product and whichever of its siblings'
 *     build systems it is scaffolded with.
 *
 * Read here off the scaffolds themselves, since the paths golden
 * digests each top-level entry, not each file.
 *
 * **Scenario.** Cells are derived, never listed: every single-service
 * preset `keel.catalog` lists on every setting `keel.dials` offers it,
 * the harness on and off (`harnessSettings`), and every product on
 * every setting, walked from one seed per repository layout its
 * preview offers (`walkDials`).
 *
 * **Factory.** {@link installMediator} over the real templates, with a
 * fake process runner whose git answers as outside any repository, a
 * deferred-action runner that records what each scope queues and runs
 * nothing, and the shipped in-memory fakes of the `Tree` and
 * `ManifestStore` ports: each cell is a real run into a directory of
 * memory, which records each file's executable bit as it is written.
 *
 * **Port.** `Mediator.dispatch` for the scaffolds and the readings.
 *
 * It sweeps in a `beforeAll`, so mutation testing leaves it out
 * (`vitest.stryker.config.ts`), as it leaves out the paths golden.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  installCommandFor,
  type NewProjectTarget,
  type RepoLayout,
} from '../src/domain/contract/commands.js';
import { projectScopeRoot } from '../src/domain/contract/manifest.js';
import type { TreeChange } from '../src/domain/contract/ports/tree.js';
import {
  catalogQuery,
  dialsQuery,
  previewQuery,
  type DialOptions,
} from '../src/domain/contract/queries.js';
import { shippedSupport } from '../src/domain/core/registry.js';
import { serviceKeys, supportOf } from '../src/domain/core/support-tier.js';
import { FakeManifestStore } from '../src/infrastructure/manifest/fake.js';
import { FakeProcessRunner } from '../src/infrastructure/process/fake.js';
import { FakeTree } from '../src/infrastructure/tree/fake.js';
import { harnessSettings, newCommandLine, walkDials } from './support/dial-walk.js';
import { expectOk, installMediator } from './support/factory.js';
import { newProjectCommandLine } from './support/paths-golden.js';

/** Where every cell is scaffolded: a directory of memory, never the disk. */
const SCRATCH = path.join(path.sep, 'keel-premises');

/**
 * Some 340 scaffolds, about 20 s on four cores; `verify` runs this
 * beside the rest of the suite, so the budget is far above that and far
 * below a hang.
 */
const SWEEP_TIMEOUT = 300_000;

/** What a cell without the agent harness may lack that its twin holds. */
const AGENT_FILE =
  /^(?:(?:.*\/)?(?:AGENTS|CLAUDE)\.md|\.claude\/.*|\.gemini\/.*|\.aider\.conf\.yml)$/;

const HARNESS_OFF = ' --no-agent-harness';

/** A file as a cell leaves it: its bytes, and whether it is executable. */
interface File {
  readonly bytes: Buffer;
  readonly executable: boolean;
}

/** What one scaffold leaves: its files by path from its directory, and what each scope queued. */
interface Scaffold {
  readonly files: ReadonlyMap<string, File>;
  readonly actions: readonly string[];
}

/** Each cell's directory, to what runs there committed, by path from that directory. */
const disk = new Map<string, Map<string, File>>();
/** Each cell's directory, to the deferred actions its scopes queued, in order. */
const queued = new Map<string, string[]>();
const manifests = new FakeManifestStore();
const mediator = installMediator({
  processes: new FakeProcessRunner([
    {
      command: 'git',
      argsPrefix: ['rev-parse'],
      result: { status: 128, stderr: 'fatal: not a git repository' },
    },
  ]),
  runDeferred: (inputs) => {
    const cell = cellDirOf(inputs.cwd);
    const scope = path.relative(cell, inputs.cwd).split(path.sep).join('/');
    const list = queued.get(cell) ?? [];
    for (const action of inputs.actions) {
      list.push(`${scope}: ${action.id}: ${action.description.split(cell).join('<cell>')}`);
    }
    queued.set(cell, list);
    return Promise.resolve();
  },
  trees: (root) => new CellTree(root),
  manifests,
});

/** Each single-service cell's scaffold, by the command line that makes it. */
const singles = new Map<string, Scaffold>();
/** Each single-service cell's settled target, in the order the sweep reached it. */
const singleTargets: NewProjectTarget[] = [];
/** Each product cell's scaffold and the target that made it. */
const products: { line: string; target: NewProjectTarget; scaffold: Scaffold }[] = [];

describe('the support tier premises', () => {
  beforeAll(async () => {
    const { stacks } = expectOk(await mediator.dispatch(catalogQuery()));
    for (const stack of stacks) {
      if (stack.services.length === 0) {
        for (const target of await harnessSettings(dialsOf, stack.id)) {
          const line = newCommandLine(target);
          singles.set(line, await scaffold(line, target));
          singleTargets.push(target);
        }
        continue;
      }
      const seeds = (await layoutsOf(stack.id)).map(
        (layout): NewProjectTarget => ({ kind: 'new-project', stack: stack.id, layout }),
      );
      for (const reply of await walkDials(dialsOf, seeds)) {
        const target = reply.target as NewProjectTarget;
        const line = newProjectCommandLine(target);
        products.push({ line, target, scaffold: await scaffold(line, target) });
      }
    }
  }, SWEEP_TIMEOUT);

  it('reads the shipped tier as measured: 81 cells first-class each way, 2 products', () => {
    // The figures T.2b recorded; a rule that stopped reading a dial
    // (the peer context, the stack) would move them before any page did.
    const tally = new Map<string, number>();
    const count = (key: string): void => void tally.set(key, (tally.get(key) ?? 0) + 1);
    for (const target of singleTargets) {
      const support = supportOf(
        {
          kind: 'single',
          stack: target.stack ?? '',
          buildSystem: target.buildSystem ?? null,
          moduleLayout: target.moduleLayout ?? null,
          peerContext: target.withPeerContext === true,
          agentHarness: target.agentHarness !== false,
        },
        shippedSupport,
      );
      count(
        `${target.agentHarness === false ? 'off' : 'on'} ${support?.proof?.by ?? support?.tier}`,
      );
    }
    for (const { target } of products) {
      const support = supportOf(
        {
          kind: 'product',
          stack: target.stack ?? '',
          layout: target.layout as RepoLayout,
          buildSystem: target.buildSystem ?? '',
        },
        shippedSupport,
      );
      count(`product ${support?.tier} ${support?.unbuilt.length}`);
    }
    expect(Object.fromEntries([...tally].sort())).toEqual({
      'off best-effort': 69,
      'off harness-twin': 81,
      'on best-effort': 69,
      'on suite': 81,
      'product best-effort 1': 10,
      'product best-effort 2': 28,
      'product first-class 0': 2,
    });
  });

  it('holds P1: a cell without the harness is its twin with it, less the agent files', () => {
    const off = [...singles.keys()].filter((line) => line.endsWith(HARNESS_OFF));
    const broken: string[] = [];
    for (const line of off) {
      const twin = singles.get(line.slice(0, -HARNESS_OFF.length));
      const without = singles.get(line);
      if (twin === undefined || without === undefined) {
        broken.push(`${line}: no twin with the harness`);
        continue;
      }
      for (const [file, held] of without.files) {
        const same = twin.files.get(file);
        if (same === undefined) broken.push(`${line}: ${file} is not in its twin`);
        else if (!same.bytes.equals(held.bytes) || same.executable !== held.executable) {
          broken.push(`${line}: ${file} differs from its twin's`);
        }
      }
      for (const file of twin.files.keys()) {
        if (!without.files.has(file) && !AGENT_FILE.test(file)) {
          broken.push(`${line}: lacks ${file}, which is no agent file`);
        }
      }
      if (JSON.stringify(without.actions) !== JSON.stringify(twin.actions)) {
        broken.push(`${line}: queues other actions than its twin`);
      }
    }

    expect(off.length, 'cells without the harness').toBeGreaterThan(0);
    expect(broken).toEqual([]);
  });

  it('holds P2: services with one key have the same files, whatever the product', async () => {
    const classes = new Map<string, Map<string, string[]>>();
    for (const { line, target, scaffold } of products) {
      const keys = serviceKeys(
        {
          kind: 'product',
          stack: target.stack ?? '',
          layout: target.layout as RepoLayout,
          buildSystem: target.buildSystem ?? '',
        },
        shippedSupport.stacks,
      );
      expect(keys, `${line}: a product keel vouches for`).not.toBeNull();
      for (const [service, key] of keys ?? []) {
        const signature = await signatureOf(line, scaffold, service);
        const signatures = classes.get(key) ?? new Map<string, string[]>();
        signatures.set(signature, [...(signatures.get(signature) ?? []), line]);
        classes.set(key, signatures);
      }
    }
    const split = [...classes]
      .filter(([, signatures]) => signatures.size > 1)
      .map(
        ([key, signatures]) => `${key}: ${[...signatures.values()].map((l) => l[0]).join(' | ')}`,
      );

    expect(products.length, 'product cells').toBeGreaterThan(0);
    expect(split).toEqual([]);
  });
});

/**
 * The shipped in-memory `Tree` fake over a directory of memory: seeded
 * with what earlier runs in its cell committed under its root, and
 * committing back into it, each file with the executable bit its last
 * write gave it — the fake keeps a mode, but has no way to read one
 * back.
 */
class CellTree extends FakeTree {
  private readonly files: Map<string, File>;
  private readonly prefix: string;
  /** Whether each file is executable: as seeded, then as its last write with a mode says. */
  private readonly executable = new Map<string, boolean>();

  constructor(root: string) {
    super();
    const cell = cellDirOf(root);
    const relative = path.relative(cell, root).split(path.sep).join('/');
    this.prefix = relative === '' ? '' : `${relative}/`;
    this.files = disk.get(cell) ?? new Map<string, File>();
    disk.set(cell, this.files);
    for (const [file, held] of this.files) {
      if (!file.startsWith(this.prefix)) continue;
      this.seed(file.slice(this.prefix.length), held.bytes);
      this.executable.set(file.slice(this.prefix.length), held.executable);
    }
  }

  override write(filePath: string, content: Buffer | string, options?: { mode?: number }): void {
    super.write(filePath, content, options);
    if (options?.mode !== undefined) {
      this.executable.set(treeKey(filePath), (options.mode & 0o111) !== 0);
    }
  }

  override async commit(): Promise<readonly TreeChange[]> {
    const changes = await super.commit();
    for (const change of changes) {
      const bytes = this.read(change.path);
      const file = `${this.prefix}${change.path}`;
      if (bytes === null) this.files.delete(file);
      else this.files.set(file, { bytes, executable: this.executable.get(change.path) ?? false });
    }
    return changes;
  }
}

/** A path as the shipped `FakeTree` keys it, and names it in its changes. */
function treeKey(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** The directory of {@link SCRATCH} a path lies in: the cell's own. */
function cellDirOf(file: string): string {
  const [cell] = path.relative(SCRATCH, file).split(path.sep);
  return path.join(SCRATCH, cell ?? '');
}

/** Scaffolds `target` for real into a directory of its own, and reads back what it left. */
async function scaffold(line: string, target: NewProjectTarget): Promise<Scaffold> {
  const cwd = path.join(SCRATCH, createHash('sha256').update(line).digest('hex').slice(0, 16));
  expectOk(
    await mediator.dispatch(
      installCommandFor(target, { cwd, answers: {}, interactive: false, dryRun: false }),
    ),
  );
  return { files: disk.get(cwd) ?? new Map(), actions: queued.get(cwd) ?? [] };
}

/**
 * What a product's service holds, as one string: every file under its
 * directory, its path, executable bit and digest, and its manifest.
 */
async function signatureOf(line: string, held: Scaffold, service: string): Promise<string> {
  const cwd = path.join(SCRATCH, createHash('sha256').update(line).digest('hex').slice(0, 16));
  const files = [...held.files]
    .filter(([file]) => file.startsWith(`${service}/`))
    .map(([file, { bytes, executable }]) => {
      const digest = createHash('sha256').update(bytes).digest('hex');
      return `${file.slice(service.length + 1)}\0${executable}\0${digest}`;
    })
    .sort();
  const manifest = await manifests.read(projectScopeRoot(path.join(cwd, service)));
  // What a suite runs after the scaffold is part of the cell, as in P1.
  const actions = held.actions
    .filter((action) => action.startsWith(`${service}: `))
    .map((action) => action.slice(service.length + 2));
  return JSON.stringify([files, manifest, actions]);
}

async function dialsOf(target: NewProjectTarget): Promise<DialOptions> {
  return expectOk(await mediator.dispatch(dialsQuery({ target })));
}

/** The repository layouts a product's install offers, from the question its preview asks. */
async function layoutsOf(stack: string): Promise<readonly RepoLayout[]> {
  const preview = expectOk(
    await mediator.dispatch(
      previewQuery({
        cwd: path.join(SCRATCH, 'layouts'),
        target: { kind: 'new-project', stack },
        answers: {},
      }),
    ),
  );
  const question = preview.questions.find((q) => q.binding.kind === 'layout');
  return (question?.choices ?? []).map((choice) => choice.value as RepoLayout);
}
