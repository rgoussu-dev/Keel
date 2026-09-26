/**
 * `keel add entrypoint <cli|http>` — the front door.
 *
 * The composition grid holds every single-entrypoint backend cell to
 * its twin byte for byte (I10, `../composition-grid/growth.test.ts`).
 * What belongs here is what a cell cannot show: that growing never
 * reads the entrypoint already there, so a user's edit to it stays; a
 * file of the user's where the new entrypoint goes stops the run
 * before anything is written; a terminal is asked only what the twin
 * would ask that the project has not answered; and each gate, each
 * refusal growth reads, in its code and its words — the sentence
 * `../../../../src/domain/core/refusals.ts` builds, never a tag.
 *
 * **Scenario.** A preset scaffolded for real into a temporary
 * directory, then grown. **Factory.** {@link installMediator} over the
 * real templates, with a fake process runner and the deferred actions
 * recorded, never run. **Port.** `Mediator.dispatch`.
 */

import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addEntrypointCommand,
  addModuleCommand,
  linkPeerCommand,
  newProjectCommand,
  type AddEntrypointCommand,
  type InstallReport,
  type NewProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import {
  HARNESS_GENERATION,
  MANIFEST_FILENAME,
  projectScopeRoot,
  type ManifestV2,
} from '../../../../src/domain/contract/manifest.js';
import { previewQuery, projectStatusQuery } from '../../../../src/domain/contract/queries.js';
import { RefusalError } from '../../../../src/domain/contract/refusal.js';
import type { Stack } from '../../../../src/domain/contract/stack.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { growthRefusalError } from '../../../../src/domain/core/handlers/add-entrypoint.js';
import type { Adapter, Tag, Vertical } from '../../../../src/domain/contract/composition.js';
import type { Registry } from '../../../../src/domain/contract/ports/registry.js';
import {
  pluginOrigin,
  registryOf,
  shippedRegistry,
  shippedSource,
} from '../../../../src/domain/core/registry.js';
import type { Result } from '../../../../src/domain/kernel/result.js';
import { fsManifestStore } from '../../../../src/infrastructure/manifest/fs-manifest-store.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { FakePrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

let root: string;
let cwd: string;
/** What each real run in a directory deferred, keyed by that directory. */
let deferred: Map<string, readonly string[]>;
/** What every run composes from: keel's own pieces, unless a case adds a plugin's. */
let registry: Registry;

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-add-entrypoint-'));
  cwd = path.join(root, 'project');
  await fs.ensureDir(cwd);
  deferred = new Map();
  registry = shippedRegistry;
});

afterEach(async () => {
  await fs.remove(root);
});

function mediator(prompt?: FakePrompt) {
  return installMediator({
    registry,
    processes: new FakeProcessRunner(),
    runDeferred: (inputs: RunActionsInputs) => {
      deferred.set(
        inputs.cwd,
        inputs.actions.map((action) => action.description),
      );
      return Promise.resolve();
    },
    ...(prompt === undefined ? {} : { prompt }),
  });
}

async function scaffold(
  stack: string,
  more: Partial<Omit<NewProjectCommand, 'kind' | 'intent'>> = {},
  at: string = cwd,
): Promise<void> {
  expectOk(
    await mediator().dispatch(
      newProjectCommand({
        cwd: at,
        stack,
        answers: {},
        interactive: false,
        dryRun: false,
        ...more,
      }),
    ),
  );
  deferred.clear();
}

function grow(
  entrypoint: string,
  more: Partial<Omit<AddEntrypointCommand, 'kind' | 'intent'>> = {},
  prompt?: FakePrompt,
): Promise<Result<InstallReport>> {
  return mediator(prompt).dispatch(
    addEntrypointCommand({
      cwd,
      entrypoint,
      answers: {},
      interactive: false,
      dryRun: false,
      ...more,
    }),
  );
}

async function manifestAt(at: string = cwd): Promise<ManifestV2> {
  const manifest = await fsManifestStore.read(projectScopeRoot(at));
  if (manifest === null) throw new Error(`no manifest at ${at}`);
  return manifest;
}

function manifestBytes(at: string = cwd): Promise<string> {
  return fs.readFile(path.join(at, '.claude', MANIFEST_FILENAME), 'utf8');
}

/** Every file under `at`, by path from it, as its sha256. */
async function digests(at: string): Promise<Record<string, string>> {
  const found: Record<string, string> = {};
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else {
        found[path.relative(at, file)] = createHash('sha256')
          .update(await fs.readFile(file))
          .digest('hex');
      }
    }
  };
  await walk(at);
  return found;
}

const QUARKUS_MAIN = 'application/cli/src/main/java/com/example/cli/Main.java';

/* ---- A plugin's family ------------------------------------------ */

function acmeAdapter(
  vertical: string,
  name: string,
  requires: readonly Tag[],
  contribute: Adapter['contribute'],
  more: Partial<Adapter> = {},
): Adapter {
  return {
    id: `${vertical}/${name}`,
    vertical,
    covers: ['only'],
    predicate: { requires },
    contribute,
    ...more,
  };
}

function deferring(description: string) {
  return { id: description, description, run: () => Promise.resolve() };
}

function acmeVertical(
  id: string,
  adapters: readonly Adapter[],
  more: Partial<Vertical> = {},
): Vertical {
  return { id, description: `the ${id} vertical`, dimensions: ['only'], adapters, ...more };
}

/** Its CLI's layer doc, which speaks of the server, is what growth leaves out, and replays. */
const acmeSkeleton = acmeVertical('acme-skeleton', [
  acmeAdapter('acme-skeleton', 'cli', ['lang.acme', 'arch.cli'], (ctx) => ({
    files: [{ path: 'cli.txt', content: 'cli\n' }],
    actions: [deferring('acme fetch')],
    docs: [
      {
        directory: 'src',
        section: 'cli',
        description: 'The acme sources.',
        body: ctx.manifest.tags.includes('arch.server-http')
          ? 'The CLI, beside a server.'
          : 'The CLI.',
      },
    ],
  })),
  acmeAdapter('acme-skeleton', 'http', ['lang.acme', 'arch.server-http'], () => ({
    files: [{ path: 'http.txt', content: 'http\n' }],
  })),
]);
const acmeHarness = acmeVertical(
  'agent-harness',
  [
    acmeAdapter(
      'agent-harness',
      'acme-kit',
      ['lang.acme'],
      () => ({ tagsAdd: ['agentic.harness'] }),
      {
        questions: [{ id: 'tone', prompt: 'Tone?', doc: '', default: 'plain', memory: 'sticky' }],
      },
    ),
  ],
  { promotes: ['agentic.harness'] },
);
/**
 * A doc beside the CLI's, in every preset: growth replays it, and
 * records the observability's doc after it, where the twin does.
 */
const acmeNotes = acmeVertical('acme-notes', [
  acmeAdapter('acme-notes', 'main', ['lang.acme'], () => ({
    docs: [
      { directory: 'src', section: 'notes', description: 'The acme sources.', body: 'Notes.' },
    ],
  })),
]);
const acmeBase = acmeVertical(
  'acme-base',
  [
    acmeAdapter(
      'acme-base',
      'main',
      ['lang.acme'],
      () => ({ tagsAdd: ['cap.acme-base'], actions: [deferring('acme base')] }),
      { promotes: ['cap.acme-base'] },
    ),
  ],
  { promotes: ['cap.acme-base'] },
);
/** Its skill and doc are harness entries growth records anew, among the ones the project has. */
const acmeObservability = acmeVertical(
  'acme-obs',
  [
    acmeAdapter(
      'acme-obs',
      'main',
      ['lang.acme', 'arch.server-http', 'cap.acme-base'],
      () => ({
        files: [{ path: 'obs.txt', content: 'obs\n' }],
        actions: [deferring('acme obs')],
        skills: [{ name: 'acme-observe', description: 'Observe the server.', body: 'Watch it.' }],
        docs: [
          {
            directory: 'src',
            section: 'obs',
            description: 'The acme sources.',
            body: 'How the server is observed.',
          },
        ],
      }),
      {
        questions: [
          { id: 'shape', prompt: 'Shape?', doc: '', default: 'granular', memory: 'sticky' },
        ],
      },
    ),
  ],
  { skills: ['acme-observe'] },
);
/** A skill naming the entrypoints, from a vertical growth neither installs nor re-renders. */
const acmeRunbook = acmeVertical(
  'acme-runbook',
  [
    acmeAdapter('acme-runbook', 'main', ['lang.acme'], (ctx) => ({
      skills: [
        {
          name: 'acme-run',
          description: 'Run the acme project.',
          body: `Run ${['cli', 'server-http']
            .filter((entry) => ctx.manifest.tags.includes(`arch.${entry}`))
            .join(' and ')}.`,
        },
      ],
      actions: [deferring('acme runbook')],
    })),
  ],
  { skills: ['acme-run'] },
);

function acmeStack(id: string, entrypoints: readonly Tag[], verticals: readonly Vertical[]): Stack {
  return {
    id,
    description: `the ${id} preset`,
    tags: ['lang.acme', 'runtime.acme', 'arch.hexagonal', ...entrypoints],
    verticals,
    ...(entrypoints.includes('arch.server-http') ? { projects: ['peer.api.rest'] } : {}),
  };
}

/**
 * A plugin's family, small enough to read — a CLI, an HTTP preset and
 * the one carrying both, notes before the base observability needs,
 * listed before it, and a runbook after both — and nothing of keel's
 * own.
 */
const acmeRegistry = registryOf([
  {
    origin: pluginOrigin('acme'),
    verticals: [acmeSkeleton, acmeHarness, acmeNotes, acmeBase, acmeObservability, acmeRunbook],
    stacks: [
      acmeStack('acme-cli', ['arch.cli'], [acmeSkeleton, acmeHarness, acmeNotes, acmeRunbook]),
      acmeStack(
        'acme-http',
        ['arch.server-http'],
        [acmeSkeleton, acmeHarness, acmeNotes, acmeBase, acmeObservability, acmeRunbook],
      ),
      acmeStack(
        'acme-cli-http',
        ['arch.cli', 'arch.server-http'],
        [acmeSkeleton, acmeHarness, acmeNotes, acmeBase, acmeObservability, acmeRunbook],
      ),
    ],
  },
]);

describe('keel add entrypoint', () => {
  it('adds HTTP to a CLI project, and never reads the files of the CLI: an edited Main stays', async () => {
    await scaffold('quarkus-cli');
    const main = path.join(cwd, QUARKUS_MAIN);
    const edited = `${await fs.readFile(main, 'utf8')}// the user's own line\n`;
    await fs.writeFile(main, edited);

    const report = expectOk(await grow('http'));

    expect(report.subject).toBe('entrypoint http');
    expect(report.committed).toBe(true);
    expect(await fs.readFile(main, 'utf8')).toBe(edited);
    expect(report.changes.map((change) => change.path)).not.toContain(QUARKUS_MAIN);
    expect(report.changes).toContainEqual(
      expect.objectContaining({
        kind: 'create',
        path: 'application/rest/executable/src/main/java/com/example/rest/GreetResource.java',
      }),
    );
    const manifest = await manifestAt();
    expect(manifest.tags).toContain('arch.server-http');
    expect(manifest.projects).toEqual(['peer.api.rest']);
    // Recorded where the twin records them (DR4), none moved.
    expect(manifest.verticals.map((v) => v.id)).toEqual([
      'vcs',
      'walking-skeleton',
      'agent-harness',
      'code-style',
      'dev-env',
      'observability',
      'dev-container',
    ]);
    // What the twin queues, less the repository's setup (DR5).
    expect(report.actions).toEqual([
      'gradle wrapper --gradle-version=9.7.0',
      './gradlew spotlessApply (format the scaffold so its first CI run is green)',
    ]);
    expect(deferred.get(cwd)).toEqual(report.actions);
    // The harness re-rendered, and its diffs are the report's.
    expect((report.diffs ?? []).map((diff) => diff.path)).toContain('.claude/skills/run/SKILL.md');
  });

  it('adds the CLI to an HTTP project, installing no vertical and taking the id the finder prints', async () => {
    await scaffold('go-http');
    const before = (await manifestAt()).verticals;

    const report = expectOk(await grow('cli'));

    expect(report.subject).toBe('entrypoint cli');
    expect(report.changes).toContainEqual({ kind: 'create', path: 'cmd/cli/main.go' });
    expect((await manifestAt()).verticals.map((v) => v.id)).toEqual(before.map((v) => v.id));

    await fs.remove(cwd);
    await fs.ensureDir(cwd);
    await scaffold('go-cli');
    expect(expectOk(await grow('server-http', { dryRun: true })).subject).toBe('entrypoint http');
  });

  it('refuses a file of the user’s where the new entrypoint goes, as a file in the way, writing nothing', async () => {
    await scaffold('quarkus-cli');
    const theirs = 'application/rest/executable/build.gradle.kts';
    await fs.outputFile(path.join(cwd, theirs), '// the user’s own build\n');
    const manifest = await manifestBytes();
    const readme = await fs.readFile(path.join(cwd, 'README.md'), 'utf8');

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.path-conflict');
    expect(error).toBeInstanceOf(RefusalError);
    expect((error as RefusalError).refusal).toMatchObject({ kind: 'path-conflict', path: theirs });
    expect(await fs.readFile(path.join(cwd, theirs), 'utf8')).toBe('// the user’s own build\n');
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.readFile(path.join(cwd, 'README.md'), 'utf8')).toBe(readme);
    expect(await fs.pathExists(path.join(cwd, 'dev/compose.yaml'))).toBe(false);
    expect(deferred.has(cwd)).toBe(false);
  });

  it('asks a terminal only for the monitoring stack, the one question the project has not answered', async () => {
    await scaffold('go-cli');
    const prompt = new FakePrompt({ stack: 'lgtm' });

    const report = expectOk(await grow('http', { interactive: true, dryRun: true }, prompt));

    expect(prompt.asked).toEqual(['stack']);
    expect(prompt.askers.map((asker) => asker.id)).toEqual(['observability/monitoring-compose']);
    expect(report.committed).toBe(false);
    // The all-in-one stack writes no collector configuration.
    expect(report.changes.map((change) => change.path)).not.toContain(
      'dev/observability/otel-collector.yaml',
    );
  });

  it('installs an adapter of an extra the entrypoint newly matches and asks its questions, as the twin with that extra has it', async () => {
    const more = {
      extraVerticals: ['containerization', 'distribution'],
      answers: { 'containerization/quarkus-rest-image': { flavor: 'native' } },
    };
    await scaffold('quarkus-rest', more);
    const targets = 'linux-amd64,linux-arm64,darwin-arm64';
    const prompt = new FakePrompt({ targets });

    const report = expectOk(await grow('cli', { interactive: true }, prompt));

    expect(prompt.asked).toEqual(['targets']);
    expect(prompt.askers.map((asker) => asker.id)).toEqual(['distribution/quarkus-cli-native']);
    expect(report.changes).toEqual(
      expect.arrayContaining([
        { kind: 'create', path: '.github/workflows/native-build.yml' },
        { kind: 'create', path: '.github/workflows/release.yml' },
      ]),
    );
    const twin = path.join(root, 'twin');
    await fs.ensureDir(twin);
    await scaffold('quarkus-cli-rest', more, twin);
    expect(await digests(cwd)).toEqual(await digests(twin));
  });

  it('writes nothing on a dry run, and reports what it would', async () => {
    await scaffold('go-cli');
    const manifest = await manifestBytes();

    const report = expectOk(await grow('http', { dryRun: true }));

    expect(report.changes.map((change) => change.path)).toContain('cmd/http/main.go');
    expect(await fs.pathExists(path.join(cwd, 'cmd/http/main.go'))).toBe(false);
    expect(await manifestBytes()).toBe(manifest);
    expect(deferred.has(cwd)).toBe(false);
  });

  it('re-renders nothing, and so shows no diffs, on a project without the agent harness', async () => {
    await scaffold('go-cli', { agentHarness: false });

    const report = expectOk(await grow('http', { dryRun: true }));

    expect(report.changes.map((change) => change.path)).toContain('cmd/http/main.go');
    expect(report.diffs).toBeUndefined();
  });

  it('queues nothing again for an extra the project took, which is no vertical of the twin (DR5)', async () => {
    await scaffold('go-http', { extraVerticals: ['persistence'] });

    const report = expectOk(await grow('cli'));

    expect(report.actions).toEqual([
      'go mod tidy',
      'go mod tidy (fetch the OpenTelemetry modules)',
    ]);
    expect(deferred.get(cwd)).toEqual(report.actions);
  });

  it('holds an identity answer supplied for the new bootstrap to the one its sibling recorded', async () => {
    await scaffold('quarkus-cli');
    const key = 'walking-skeleton/quarkus-rest-bootstrap';

    const other = expectErr(
      await grow('http', { answers: { [key]: { basePackage: 'org.other' } }, dryRun: true }),
    );
    expect(other.code).toBe('keel.frozen-answer');

    expectOk(
      await grow('http', { answers: { [key]: { basePackage: 'com.example' } }, dryRun: true }),
    );

    // At a terminal too, before the question it does ask.
    const prompt = new FakePrompt({ stack: 'lgtm' });
    expectOk(
      await grow(
        'http',
        { answers: { [key]: { basePackage: 'com.example' } }, interactive: true, dryRun: true },
        prompt,
      ),
    );
    expect(prompt.asked).toEqual(['stack']);
  });

  it('holds an answer for a vertical it only settles as frozen, as `keel add` does, not as one it re-renders', async () => {
    await scaffold('go-http');
    const answers = { 'observability/monitoring-compose': { stack: 'lgtm' } };

    for (const interactive of [false, true]) {
      const prompt = new FakePrompt({});
      const error = expectErr(await grow('cli', { answers, interactive, dryRun: true }, prompt));
      expect(error.code).toBe('keel.frozen-answer');
      expect(error.message).toBe(
        'Observability is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for observability/monitoring-compose:stack)',
      );
      expect(prompt.asked).toEqual([]);
    }
  });

  it('holds an answer for the entrypoint already there as `keel add` does: frozen, and at a terminal before a question', async () => {
    await scaffold('quarkus-cli');
    const answers = { 'walking-skeleton/quarkus-cli-bootstrap': { basePackage: 'com.example' } };

    const batch = expectErr(await grow('http', { answers, dryRun: true }));
    expect(batch.code).toBe('keel.frozen-answer');
    expect(batch.message).toBe(
      'Walking skeleton is installed; its answers are frozen — reconfiguring is not supported yet (drop the answer for walking-skeleton/quarkus-cli-bootstrap:basePackage)',
    );

    const prompt = new FakePrompt({ stack: 'lgtm' });
    const asked = expectErr(
      await grow('http', { answers, interactive: true, dryRun: true }, prompt),
    );
    expect(asked.message).toBe(batch.message);
    expect(prompt.asked).toEqual([]);
  });

  it('refuses an answer nothing reads at a terminal before asking anything', async () => {
    await scaffold('go-cli');
    const prompt = new FakePrompt({ stack: 'lgtm' });

    const error = expectErr(
      await grow(
        'http',
        { answers: { 'nope/nope': { x: 'y' } }, interactive: true, dryRun: true },
        prompt,
      ),
    );

    expect(error.code).toBe('keel.unknown-answer');
    expect(prompt.asked).toEqual([]);
  });

  it('proposes re-rendering what reads a vertical it installs, as a later run, dry or not', async () => {
    await scaffold('quarkus-cli', { extraVerticals: ['distribution'] });
    for (const dryRun of [true, false]) {
      const report = expectOk(await grow('http', { dryRun }));
      expect(report.notes).toEqual([
        "refresh proposed: Distribution reads Observability, which it was rendered without — re-render it with 'keel add distribution --reapply'",
      ]);
      expect(report.refreshProposals).toEqual([
        { vertical: 'distribution', reads: ['observability'] },
      ]);
    }
  });

  it('grows a plugin family into its twin byte for byte: what speaks of the entrypoints re-rendered, harness files recorded where the twin records them, what it lacks run before what the twin lists later', async () => {
    registry = acmeRegistry;
    await scaffold('acme-cli');
    const twin = path.join(root, 'twin');
    await fs.ensureDir(twin);
    expectOk(
      await mediator().dispatch(
        newProjectCommand({
          cwd: twin,
          stack: 'acme-cli-http',
          answers: {},
          interactive: false,
          dryRun: false,
        }),
      ),
    );

    const report = expectOk(await grow('http'));

    expect(await digests(cwd)).toEqual(await digests(twin));
    // The runbook only settles, and its skill is rendered on the grown tags.
    expect(await fs.readFile(path.join(cwd, '.claude/skills/acme-run/SKILL.md'), 'utf8')).toContain(
      'Run cli and server-http.',
    );
    // So is the layer doc of the CLI adapter the skeleton left out.
    expect(await fs.readFile(path.join(cwd, 'src/AGENTS.md'), 'utf8')).toContain(
      'The CLI, beside a server.',
    );
    // The base and observability run where the twin lists them, before the runbook.
    expect(report.actions).toEqual(['acme fetch', 'acme base', 'acme obs', 'acme runbook']);
    expect(deferred.get(cwd)).toEqual(deferred.get(twin));
  });

  it('reads the verticals it installs together at a terminal, so an answer for one needing what another promotes is taken', async () => {
    registry = acmeRegistry;
    await scaffold('acme-cli');
    const prompt = new FakePrompt({});

    expectOk(
      await grow(
        'http',
        { answers: { 'acme-obs/main': { shape: 'flat' } }, interactive: true },
        prompt,
      ),
    );

    expect(prompt.asked).toEqual([]);
    expect((await manifestAt()).answers['acme-obs/main']).toEqual({ shape: 'flat' });
  });

  it('refuses an answer the project records for the harness it re-renders, before anything is asked', async () => {
    registry = acmeRegistry;
    await scaffold('acme-cli');
    const answers = { 'agent-harness/acme-kit': { tone: 'loud' } };
    const prompt = new FakePrompt({ shape: 'flat' });

    const error = expectErr(
      await grow('http', { answers, interactive: true, dryRun: true }, prompt),
    );

    expect(error.code).toBe('keel.reapply-frozen-answers');
    expect(error.message).toBe(
      "--set cannot change agent-harness/acme-kit's answers: re-rendering 'agent-harness' reads them as the manifest recorded them, and changing one is not supported yet",
    );
    expect(prompt.asked).toEqual([]);
    expect(expectErr(await grow('http', { answers, dryRun: true })).code).toBe(error.code);
  });

  it('is Ok for an entrypoint the project has, changing nothing and saying so', async () => {
    await scaffold('go-http');
    const manifest = await manifestBytes();

    for (const dryRun of [false, true]) {
      const report = expectOk(await grow('http', { dryRun }));
      expect(report).toMatchObject({
        subject: 'entrypoint http',
        changes: [],
        actions: [],
        committed: !dryRun,
      });
      expect(report.notes).toEqual(['HTTP server is already an entrypoint of this project']);
    }
    expect(await manifestBytes()).toBe(manifest);
  });

  it('refuses every answer for an entrypoint the project has, whatever the mode, as its preview reports it: nothing will run', async () => {
    await scaffold('go-http');
    const bodies = [
      { 'nope/nope': { x: 'y' } },
      { 'observability/monitoring-compose': { stack: 'lgtm' } },
    ];

    for (const answers of bodies) {
      const preview = expectOk(
        await mediator().dispatch(
          previewQuery({ cwd, target: { kind: 'add-entrypoint', entrypoint: 'http' }, answers }),
        ),
      );
      const [unused] = preview.unusedAnswers ?? [];
      expect(unused).toBeDefined();
      for (const interactive of [false, true]) {
        const error = expectErr(await grow('http', { answers, interactive, dryRun: true }));
        expect([error.code, error.message]).toEqual([unused?.code, unused?.message]);
      }
    }
    expect(
      (
        await mediator().dispatch(
          previewQuery({
            cwd,
            target: { kind: 'add-entrypoint', entrypoint: 'http' },
            answers: {},
          }),
        )
      ).ok,
    ).toBe(true);
  });

  it('leaves a linked project’s record of what it offered to `keel link`, and says so', async () => {
    await scaffold('go-cli');
    const sibling = path.join(root, 'front');
    await fs.ensureDir(sibling);
    await scaffold('web-components', {}, sibling);
    expectOk(await mediator().dispatch(linkPeerCommand({ cwd, ref: '../front' })));
    const recorded = (await manifestAt(sibling)).peers;

    const report = expectOk(await grow('http'));

    expect(report.notes).toEqual([
      "the project linked at ../front still records what this one offered it before its HTTP server — 'keel link ../front' brings that record up to date",
    ]);
    expect((await manifestAt(sibling)).peers).toEqual(recorded);

    expectOk(await mediator().dispatch(linkPeerCommand({ cwd, ref: '../front' })));
    expect((await manifestAt(sibling)).peers).toEqual([
      expect.objectContaining({ ref: '../project', tags: ['peer.api.rest'] }),
    ]);
  });

  it('says nothing of a linked project where what it offers did not change', async () => {
    await scaffold('go-http');
    const sibling = path.join(root, 'front');
    await fs.ensureDir(sibling);
    await scaffold('web-components', {}, sibling);
    expectOk(await mediator().dispatch(linkPeerCommand({ cwd, ref: '../front' })));

    expect(expectOk(await grow('cli', { dryRun: true })).notes).toBeUndefined();
  });
});

describe('keel add entrypoint on a modulith with bounded contexts', () => {
  /** `keel add module <name>` in `at`, consuming `consumes` where given. */
  async function addModule(name: string, consumes?: string, at: string = cwd): Promise<void> {
    expectOk(
      await mediator().dispatch(
        addModuleCommand({
          cwd: at,
          module: name,
          answers: {},
          interactive: false,
          dryRun: false,
          ...(consumes === undefined ? {} : { consumes }),
        }),
      ),
    );
  }

  it('wires the peer and each context keel add module added into the new assembly, as the twin with that history has them', async () => {
    const dials = { moduleLayout: 'modulith', withPeerContext: true } as const;
    await scaffold('go-cli', dials);
    await addModule('orders', 'greeting');
    await addModule('shipping', 'orders');
    const modules = (await manifestAt()).modules;
    const twin = path.join(root, 'twin');
    await fs.ensureDir(twin);
    await scaffold('go-cli-http', dials, twin);
    await addModule('orders', 'greeting', twin);
    await addModule('shipping', 'orders', twin);

    const report = expectOk(await grow('http'));

    for (const context of ['guestbook', 'orders', 'shipping']) {
      for (const file of [`cmd/http/${context}.go`, `cmd/http/${context}_test.go`]) {
        expect(report.changes).toContainEqual({ kind: 'create', path: file });
      }
    }
    // The consumer reaches what it consumes through that one's wiring, beside it.
    expect(await fs.readFile(path.join(cwd, 'cmd/http/shipping.go'), 'utf8')).toContain(
      'ordersgateway.New(wireOrdersService())',
    );
    expect((report.resolvedAdapters ?? []).map((adapter) => adapter.id)).toEqual(
      expect.arrayContaining([
        'walking-skeleton/go-peer-context-http',
        'bounded-context/go-context-http',
      ]),
    );
    const manifest = await manifestAt();
    expect(manifest.modules).toEqual(modules);
    expect(manifest.tags).not.toContain('modules.context');
    expect(Object.keys(manifest.answers)).not.toContain('keel.add-module');
    expect(await digests(cwd)).toEqual(await digests(twin));
  });

  it('never reads the wiring of the entrypoints there: an edited one stays', async () => {
    await scaffold('go-http', { moduleLayout: 'modulith' });
    await addModule('billing');
    const wiring = path.join(cwd, 'cmd/http/billing.go');
    const edited = `${await fs.readFile(wiring, 'utf8')}// the user's own line\n`;
    await fs.writeFile(wiring, edited);

    const report = expectOk(await grow('cli'));

    expect(await fs.readFile(wiring, 'utf8')).toBe(edited);
    expect(report.changes.map((change) => change.path)).not.toContain('cmd/http/billing.go');
    // A context consuming none is wired in standalone, as its add wired it.
    expect(report.changes).toContainEqual({ kind: 'create', path: 'cmd/cli/billing.go' });
    expect(await fs.readFile(path.join(cwd, 'cmd/cli/billing.go'), 'utf8')).toContain(
      'return billingservice.New(billing.NewBilling())',
    );
  });

  it('wires each context by keel’s own bounded-context, the one keel add module ran, whatever a registry lists, as the status offers it', async () => {
    const listed = acmeVertical('bounded-context', [
      acmeAdapter('bounded-context', 'acme-context', ['lang.acme', 'modules.context'], () => ({
        files: [{ path: 'acme.txt', content: 'acme\n' }],
      })),
    ]);
    for (const agentHarness of [true, false]) {
      const grown = path.join(root, `grown-${agentHarness}`);
      const twin = path.join(root, `twin-${agentHarness}`);
      registry = shippedRegistry;
      for (const [at, stack] of [
        [grown, 'go-cli'],
        [twin, 'go-cli-http'],
      ] as const) {
        await fs.ensureDir(at);
        await scaffold(stack, { moduleLayout: 'modulith', agentHarness }, at);
        await addModule('orders', 'greeting', at);
      }
      // `keel add module` recorded `bounded-context` among the verticals,
      // an id that now names the plugin's.
      registry = registryOf([shippedSource, { origin: pluginOrigin('acme'), verticals: [listed] }]);
      const status = expectOk(await mediator().dispatch(projectStatusQuery({ cwd: grown })));
      expect(status.entrypoints?.find((entry) => entry.word === 'http')?.refusal).toBeUndefined();

      const report = expectOk(await grow('http', { cwd: grown }));

      expect(report.changes).toContainEqual({ kind: 'create', path: 'cmd/http/orders.go' });
      expect(await digests(grown)).toEqual(await digests(twin));
    }
  });

  it('refuses a context the manifest records consuming none whose gateway keel wrote is there, naming it, as its preview does', async () => {
    await scaffold('go-cli', { moduleLayout: 'modulith' });
    await addModule('orders', 'greeting');
    // As a keel before #164 recorded it: nothing says what it consumes.
    const stored = await manifestAt();
    await fsManifestStore.write(projectScopeRoot(cwd), {
      ...stored,
      modules: stored.modules.map(({ consumes: _, ...module }) => module),
    });
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.contexts-need-rewiring');
    expect(error.message).toBe(
      `HTTP server cannot be added here: the bounded context 'orders' holds a gateway to 'greeting', but this project's manifest, written by an older keel, does not record that it consumes it — wired into the new entrypoint as the manifest reads, it would not build; if 'orders' consumes 'greeting', record "consumes": "greeting" on it among "modules" in .claude/.keel-manifest.json`,
    );
    expect(error.message).not.toMatch(/arch\.|modules\.context|lang\./);
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.pathExists(path.join(cwd, 'cmd/http'))).toBe(false);
    const preview = expectErr(
      await mediator().dispatch(
        previewQuery({ cwd, target: { kind: 'add-entrypoint', entrypoint: 'http' }, answers: {} }),
      ),
    );
    expect([preview.code, preview.message]).toEqual([error.code, error.message]);
    // Below it, the command points there as a project that refuses it too.
    const notes = path.join(cwd, 'notes');
    await fs.ensureDir(notes);
    const below = expectErr(await grow('http', { cwd: notes }));
    expect(below.message).toBe(
      `no project initialised at ${projectScopeRoot(notes)} — this directory is inside the keel project at ../, which refuses 'keel add entrypoint http' too, since ${error.message}`,
    );

    // Recorded, as the refusal says, it grows.
    await fsManifestStore.write(projectScopeRoot(cwd), stored);
    expectOk(await grow('http'));
    expect(await fs.readFile(path.join(cwd, 'cmd/http/orders.go'), 'utf8')).toContain(
      'greetinggateway.New(',
    );
  });

  it('refuses it where any file of that gateway is left: its test deleted, the gateway kept', async () => {
    await scaffold('go-cli', { moduleLayout: 'modulith' });
    await addModule('orders', 'greeting');
    const stored = await manifestAt();
    await fsManifestStore.write(projectScopeRoot(cwd), {
      ...stored,
      modules: stored.modules.map(({ consumes: _, ...module }) => module),
    });
    const test = path.join(cwd, 'internal/modules/orders/infra/greetinggateway/gateway_test.go');
    expect(await fs.pathExists(test)).toBe(true);
    await fs.remove(test);
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.contexts-need-rewiring');
    expect(error.message).toContain(
      "the bounded context 'orders' holds a gateway to 'greeting', but this project's manifest",
    );
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.pathExists(path.join(cwd, 'cmd/http'))).toBe(false);
  });

  it('reads the gateway of a consumer of a context keel add module added, not only of the skeleton', async () => {
    await scaffold('go-cli', { moduleLayout: 'modulith' });
    await addModule('orders', 'greeting');
    await addModule('shipping', 'orders');
    const stored = await manifestAt();
    await fsManifestStore.write(projectScopeRoot(cwd), {
      ...stored,
      modules: stored.modules.map((module) => {
        if (module.name !== 'shipping') return module;
        const { consumes: _, ...unrecorded } = module;
        return unrecorded;
      }),
    });
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.contexts-need-rewiring');
    expect(error.message).toContain(
      "the bounded context 'shipping' holds a gateway to 'orders', but this project's manifest",
    );
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.pathExists(path.join(cwd, 'cmd/http'))).toBe(false);
  });

  it('reads no gateway of the peer, which its own adapters wire: a peer recorded consuming nothing grows', async () => {
    await scaffold('go-cli', { moduleLayout: 'modulith', withPeerContext: true });
    await addModule('orders', 'greeting');
    const stored = await manifestAt();
    // As a keel before #164 recorded the peer; its gateway to greeting is there.
    await fsManifestStore.write(projectScopeRoot(cwd), {
      ...stored,
      modules: stored.modules.map((module) => {
        if (module.name !== 'guestbook') return module;
        const { consumes: _, ...unrecorded } = module;
        return unrecorded;
      }),
    });
    expect(
      await fs.pathExists(path.join(cwd, 'internal/modules/guestbook/infra/greetinggateway')),
    ).toBe(true);

    const report = expectOk(await grow('http'));

    for (const context of ['guestbook', 'orders']) {
      expect(report.changes).toContainEqual({ kind: 'create', path: `cmd/http/${context}.go` });
    }
  });
});

describe('keel add entrypoint, refused', () => {
  it('outside a keel project', async () => {
    const error = expectErr(await grow('http'));
    expect(error.code).toBe('keel.not-initialised');
    expect(error.message).toContain("run 'keel new --stack=<id>' first");
  });

  it('at a product root, and in its services, whichever keel generation scaffolded them', async () => {
    await scaffold('fullstack-go', { layout: 'monorepo' });
    const backend = path.join(cwd, 'backend');
    const refusals = async () => [
      expectErr(await grow('cli')),
      expectErr(await grow('cli', { cwd: backend })),
    ];

    const [atRoot, inService] = await refusals();

    expect(atRoot?.code).toBe('keel.wrong-scope');
    expect(atRoot?.message).toBe(
      "this is a product root, whose entrypoints are its services' — keel adds no entrypoint inside a product yet: the product records each service by the stack it was made from, and a service grown in place would no longer be that stack",
    );
    expect(inService?.code).toBe('keel.wrong-scope');
    expect(inService?.message).toMatch(
      /^this project is a service of a product — keel adds no entrypoint inside a product yet/,
    );
    // Refused there in every generation, so before the generation gate:
    // no harness to move aside, no keel to pin.
    for (const at of [cwd, backend]) {
      const { harnessGeneration: _, ...older } = await manifestAt(at);
      await fsManifestStore.write(projectScopeRoot(at), older);
    }
    expect((await refusals()).map((error) => [error.code, error.message])).toEqual(
      [atRoot, inService].map((error) => [error?.code, error?.message]),
    );
  });

  it('below a product root or a monorepo service, saying why the projects it points at refuse it too', async () => {
    await scaffold('fullstack-go', { layout: 'monorepo' });
    const reason =
      'keel adds no entrypoint inside a product yet: the product records each service by the stack it was made from, and a service grown in place would no longer be that stack';

    const notes = path.join(cwd, 'notes');
    await fs.ensureDir(notes);
    const atRoot = expectErr(await grow('cli', { cwd: notes }));
    expect(atRoot.code).toBe('keel.not-initialised');
    expect(atRoot.message).toBe(
      `no project initialised at ${projectScopeRoot(notes)} — this directory is inside the keel product at ../, whose services are ../backend/ and ../frontend/, each refusing 'keel add entrypoint cli' too, since ${reason}`,
    );

    const inService = path.join(cwd, 'backend', 'notes');
    await fs.ensureDir(inService);
    expect(expectErr(await grow('cli', { cwd: inService })).message).toBe(
      `no project initialised at ${projectScopeRoot(inService)} — this directory is inside the keel project at ../, which refuses 'keel add entrypoint cli' too, since ${reason}`,
    );
  });

  it('below a project growth refuses, saying why; above projects one of which grows, pointing there', async () => {
    await scaffold('quarkus-cli', { moduleLayout: 'modulith', withPeerContext: true });
    const notes = path.join(cwd, 'notes');
    await fs.ensureDir(notes);

    const below = expectErr(await grow('http', { cwd: notes }));

    expect(below.code).toBe('keel.not-initialised');
    expect(below.message).toBe(
      `no project initialised at ${projectScopeRoot(notes)} — this directory is inside the keel project at ../, which refuses 'keel add entrypoint http' too, since HTTP server cannot be added here yet: this project's bounded context 'guestbook' is wired into its existing entrypoints, and keel does not yet wire this stack's contexts into a new one`,
    );

    const product = path.join(root, 'product');
    await fs.ensureDir(product);
    await scaffold('fullstack-go', { layout: 'polyrepo' }, product);
    // The front end refuses it, and the back end grows.
    expect(expectErr(await grow('cli', { cwd: product })).message).toBe(
      `no project initialised at ${projectScopeRoot(product)} — backend/ and frontend/ below hold keel projects; run 'keel add entrypoint cli' in one of them`,
    );
  });

  it('but not in a polyrepo product’s service, a repository of its own with no product to record it', async () => {
    await scaffold('fullstack-go', { layout: 'polyrepo' });
    const report = expectOk(await grow('cli', { cwd: path.join(cwd, 'backend'), dryRun: true }));
    expect(report.changes).toContainEqual({ kind: 'create', path: 'cmd/cli/main.go' });
  });

  it('on a project another keel generation scaffolded, before a file moves, naming no keel to pin: none older has the command', async () => {
    await scaffold('go-cli');
    const { harnessGeneration: _, ...older } = await manifestAt();
    await fsManifestStore.write(projectScopeRoot(cwd), { ...older, keelVersion: '0.5.0-alpha' });

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.harness-generation');
    expect(error.message).toBe(
      `this project was scaffolded by an older keel (keel@0.5.0-alpha): its manifest carries no harness-generation marker, and this keel writes generation ${String(HARNESS_GENERATION)}, whose sentinels and agent documents live elsewhere — 'keel add entrypoint http' refuses rather than half-patch it, and nothing was changed. Move AGENTS.md, CLAUDE.md and .claude/ (keeping .claude/.keel-manifest.json) out of the way, run 'keel add agent-harness --reapply' to re-render the harness and stamp the marker, then re-run 'keel add entrypoint http'.`,
    );
    expect(await fs.pathExists(path.join(cwd, 'cmd/http/main.go'))).toBe(false);
    // Asked before growth answers anything: an entrypoint there, a word naming none.
    for (const word of ['cli', 'grpc']) {
      expect(expectErr(await grow(word)).code).toBe('keel.harness-generation');
    }
  });

  it('for a word that names no entrypoint, naming the ones it takes', async () => {
    await scaffold('go-cli');
    const error = expectErr(await grow('grpc'));
    expect(error.code).toBe('keel.unknown-entrypoint');
    expect(error.message).toBe(
      "'grpc' names no entrypoint keel adds — name 'cli' (CLI) or 'http' (HTTP server)",
    );
  });

  it('for a front end’s entrypoint, and on a front end', async () => {
    await scaffold('go-cli');
    const spa = expectErr(await grow('spa'));
    expect(spa.code).toBe('keel.uncoverable-entrypoint');
    expect(spa.message).toBe(
      'Browser SPA cannot be added here: a front end is a project of its own, and keel adds an entrypoint only to a back end',
    );

    await fs.emptyDir(cwd);
    await scaffold('web-components');
    const front = expectErr(await grow('cli'));
    expect(front.code).toBe('keel.uncoverable-entrypoint');
    expect(front.message).toBe(
      'CLI cannot be added here: keel adds an entrypoint only to a back end, and this project is a front end',
    );
  });

  it('where the entrypoint would break a rule of a vertical the project has, as the twin with it is', async () => {
    const cliOnly: Vertical = {
      id: 'cli-only',
      description: 'Sits beside no HTTP server',
      dimensions: ['only'],
      conflicts: [
        {
          id: 'cli-only/no-http',
          when: ['arch.server-http'],
          reason: 'this sits beside no server',
        },
      ],
      adapters: [
        {
          id: 'cli-only/go',
          vertical: 'cli-only',
          covers: ['only'],
          predicate: { requires: ['lang.go'] },
          contribute: () => ({ files: [{ path: 'cli-only.txt', content: 'cli\n' }] }),
        },
      ],
    };
    registry = registryOf([shippedSource, { origin: pluginOrigin('acme'), verticals: [cliOnly] }]);
    await scaffold('go-cli', { extraVerticals: ['cli-only'] });
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.incompatible');
    expect(error.message).toBe(
      "HTTP server cannot be added here: this sits beside no server (rule 'cli-only/no-http')",
    );
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.pathExists(path.join(cwd, 'cmd/http/main.go'))).toBe(false);
    const twin = path.join(root, 'twin');
    await fs.ensureDir(twin);
    const refused = await mediator().dispatch(
      newProjectCommand({
        cwd: twin,
        stack: 'go-cli-http',
        extraVerticals: ['cli-only'],
        answers: {},
        interactive: false,
        dryRun: true,
      }),
    );
    expect(expectErr(refused).code).toBe(error.code);
  });

  it('where the harness it re-renders reads a vertical no plugin loaded provides any more, naming this command to re-run', async () => {
    const extra: Vertical = {
      id: 'extra',
      description: 'A plugin vertical',
      dimensions: ['only'],
      adapters: [
        {
          id: 'extra/go',
          vertical: 'extra',
          covers: ['only'],
          predicate: { requires: ['lang.go'] },
          contribute: () => ({ files: [{ path: 'extra.txt', content: 'extra\n' }] }),
        },
      ],
    };
    registry = registryOf([shippedSource, { origin: pluginOrigin('acme'), verticals: [extra] }]);
    await scaffold('go-cli', { extraVerticals: ['extra'] });
    registry = shippedRegistry;
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.missing-harness-contributor');
    expect(error.message).toBe(
      "cannot restore harness elements from installed vertical 'extra' — restore the plugin that provides it and re-run 'keel add entrypoint http'",
    );
    expect(await manifestBytes()).toBe(manifest);
    expect(await fs.pathExists(path.join(cwd, 'cmd/http/main.go'))).toBe(false);
    const preview = await mediator().dispatch(
      previewQuery({ cwd, target: { kind: 'add-entrypoint', entrypoint: 'http' }, answers: {} }),
    );
    expect([expectErr(preview).code, expectErr(preview).message]).toEqual([
      error.code,
      error.message,
    ]);
  });

  it('while a bounded context is wired into the entrypoints there alone, naming it and no tag', async () => {
    await scaffold('quarkus-cli', { moduleLayout: 'modulith', withPeerContext: true });
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(error.code).toBe('keel.contexts-need-rewiring');
    expect(error.message).toBe(
      "HTTP server cannot be added here yet: this project's bounded context 'guestbook' is wired into its existing entrypoints, and keel does not yet wire this stack's contexts into a new one",
    );
    expect(await manifestBytes()).toBe(manifest);
  });

  it('where the planner refuses what the twin has and the project lacks, as the project status reports it', async () => {
    const needy = acmeVertical('acme-needy', [
      acmeAdapter('acme-needy', 'main', ['cap.acme-none'], () => ({})),
    ]);
    registry = registryOf([
      {
        origin: pluginOrigin('acme'),
        verticals: [acmeSkeleton, acmeHarness, acmeNotes, acmeBase, acmeObservability, needy],
        stacks: [
          acmeStack('acme-cli', ['arch.cli'], [acmeSkeleton, acmeHarness, acmeNotes]),
          acmeStack(
            'acme-cli-http',
            ['arch.cli', 'arch.server-http'],
            [acmeSkeleton, acmeHarness, acmeNotes, acmeBase, acmeObservability, needy],
          ),
        ],
      },
    ]);
    await scaffold('acme-cli');
    const manifest = await manifestBytes();

    const error = expectErr(await grow('http'));

    expect(await manifestBytes()).toBe(manifest);
    const status = expectOk(await mediator().dispatch(projectStatusQuery({ cwd })));
    expect(status.entrypoints?.find((entry) => entry.word === 'http')?.refusal).toEqual({
      code: error.code,
      message: error.message,
      ...(error instanceof RefusalError ? { refusal: error.refusal } : {}),
    });
    // Nor does a card name the command as its way in.
    const observability = status.available.find((card) => card.id === 'acme-obs')?.refusal;
    expect(observability?.refusal).toMatchObject({ kind: 'unavailable' });
    expect(observability?.refusal).not.toHaveProperty('grow');
  });
});

describe('growthRefusalError', () => {
  it('words every refusal growth reads under its code, naming verticals by title and no tag', () => {
    const cases = [
      growthRefusalError(shippedRegistry, { code: 'keel.unknown-entrypoint', word: 'ws' }),
      growthRefusalError(shippedRegistry, {
        code: 'keel.uncoverable-entrypoint',
        entrypoint: 'server-http',
        reason: 'no-twin',
      }),
      growthRefusalError(shippedRegistry, {
        code: 'keel.uncoverable-entrypoint',
        entrypoint: 'cli',
        reason: 'drops',
        drops: [
          { vertical: 'walking-skeleton', adapters: ['walking-skeleton/go-http-bootstrap'] },
          { vertical: 'observability', adapters: ['observability/go-observability'] },
        ],
      }),
      growthRefusalError(shippedRegistry, {
        code: 'keel.incompatible',
        entrypoint: 'server-http',
        rules: [{ id: 'cli-only/no-http', when: ['arch.server-http'], reason: 'no HTTP here' }],
      }),
      growthRefusalError(shippedRegistry, {
        code: 'keel.contexts-need-rewiring',
        entrypoint: 'cli',
        contexts: [
          { name: 'guestbook', marker: 'modules.peer-context' },
          { name: 'orders', marker: 'modules.context' },
        ],
      }),
    ];
    expect(cases.map((error) => [error.code, error.message])).toEqual([
      [
        'keel.unknown-entrypoint',
        "'ws' names no entrypoint keel adds — name 'cli' (CLI) or 'http' (HTTP server)",
      ],
      [
        'keel.uncoverable-entrypoint',
        'HTTP server cannot be added here: no stack keel offers is this project with it as well, on its build system and module layout',
      ],
      [
        'keel.uncoverable-entrypoint',
        'CLI cannot be added here: part of Walking skeleton and Observability would stop applying to this project, and keel removes nothing it installed',
      ],
      [
        'keel.incompatible',
        "HTTP server cannot be added here: no HTTP here (rule 'cli-only/no-http')",
      ],
      [
        'keel.contexts-need-rewiring',
        "CLI cannot be added here yet: this project's bounded contexts 'guestbook' and 'orders' are wired into its existing entrypoints, and keel does not yet wire this stack's contexts into a new one",
      ],
    ]);
    for (const error of cases) expect(error.message).not.toMatch(/arch\.|modules\.|\/go-/);
  });
});
