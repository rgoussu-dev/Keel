/**
 * Persistence on a modulith whose composition root has grown — by the
 * peer context `keel new --with-peer-context` scaffolds, or by a
 * context `keel add module` adds.
 *
 * Micronaut (both languages) and the TypeScript HTTP stacks are the
 * families whose persistence adapter edits the composition root: an
 * `@Import(packages = …)` list, a hand-wired Kotlin handler list, and
 * the mediator array in `main.ts`. Each of those lists is rewritten by
 * the peer context and by `keel add module` too, so the persistence
 * patch has to read the list as it is rather than the one line the
 * walking skeleton first rendered. The weekly sweep found it did not:
 * a plain `Error` on every one of these presets under
 * `--module-layout modulith --with-peer-context` (roadmap Q3.4, finding
 * 1). These scenarios hold both handlers' registrations in the root,
 * in one run and in two, in either order against `keel add module`,
 * and as the project's formatter wraps it; a root a user rewrote, or
 * edited past what keel can read as a list, a controller test
 * rewritten, and a context named for a port persistence injects, each
 * refused as a file in the way — where `keel add module`, splicing into
 * the TypeScript array rather than re-emitting it, keeps a comment
 * there; and, over the root the walking skeleton rendered, the bytes
 * persistence always wrote.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  addModuleCommand,
  addVerticalCommand,
  newProjectCommand,
} from '../../../../src/domain/contract/commands.js';
import { PathConflictError } from '../../../../src/domain/contract/refusal.js';
import type { RunActionsInputs } from '../../../../src/domain/core/actions.js';
import { expectErr, expectOk, installMediator } from '../../../support/factory.js';

let cwd: string;

beforeEach(async () => {
  cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-persistence-peer-'));
});

afterEach(async () => {
  await fs.remove(cwd);
});

/** Nothing here builds, installs packages or commits: the files are the subject. */
const discardDeferred = (): ((inputs: RunActionsInputs) => Promise<void>) => () =>
  Promise.resolve();

const mediator = () => installMediator({ runDeferred: discardDeferred() });

interface NewOptions {
  readonly peer?: boolean;
  readonly persistence?: boolean;
  /** The module layout; the modulith unless said. */
  readonly layout?: 'basic' | 'modulith';
}

const scaffold = async (stack: string, options: NewOptions = {}): Promise<void> => {
  expectOk(
    await mediator().dispatch(
      newProjectCommand({
        cwd,
        stack,
        answers: {},
        interactive: false,
        dryRun: false,
        moduleLayout: options.layout ?? 'modulith',
        ...(options.peer === true ? { withPeerContext: true } : {}),
        ...(options.persistence === true ? { extraVerticals: ['persistence'] } : {}),
      }),
    ),
  );
};

const addPersistence = () =>
  mediator().dispatch(
    addVerticalCommand({
      cwd,
      verticals: ['persistence'],
      answers: {},
      interactive: false,
      dryRun: false,
    }),
  );

const dispatchAddModule = (module: string) =>
  mediator().dispatch(
    addModuleCommand({ cwd, module, answers: {}, interactive: false, dryRun: false }),
  );

const addModule = async (module: string): Promise<void> => {
  expectOk(await dispatchAddModule(module));
};

const read = (rel: string): Promise<string> => fs.readFile(path.join(cwd, rel), 'utf8');
const write = (rel: string, content: string): Promise<void> =>
  fs.writeFile(path.join(cwd, rel), content);

/** The text between the first `open` and the first `close` after it. */
const between = (source: string, open: string, close: string): string => {
  const from = source.indexOf(open);
  expect(from, `no '${open}'`).toBeGreaterThanOrEqual(0);
  const start = from + open.length;
  return source.slice(start, source.indexOf(close, start));
};

/**
 * The entries of a comma-separated list, split on the commas outside
 * any call. Only the empty tail a trailing comma leaves is dropped: a
 * hole inside the list reads as `''`, so a list with one fails to
 * equal the one without.
 */
const entries = (list: string): readonly string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  [...list].forEach((c, i) => {
    if (c === '(') depth += 1;
    else if (c === ')') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  });
  out.push(list.slice(start));
  const trimmed = out.map((e) => e.trim());
  return trimmed.at(-1) === '' ? trimmed.slice(0, -1) : trimmed;
};

const JAVA_ROOT = 'application/api/src/main/java/com/example/application/api/MediatorFactory.java';
const KOTLIN_ROOT =
  'application/api/src/main/kotlin/com/example/application/api/MediatorFactory.kt';
const TS_ROOT = 'application/rest/src/main.ts';

/** What `@Import(packages = …)` lists, in order. */
const importedPackages = (root: string): readonly string[] =>
  entries(between(root, 'packages = {', '}'));

/** The Kotlin mediator's parameters and the handlers it registers, in order. */
const kotlinMediator = (
  root: string,
): { params: readonly string[]; handlers: readonly string[] } => ({
  params: entries(between(root, 'fun mediator(', '): Mediator')),
  handlers: entries(between(root, 'listOf(', '\n            ),')),
});

/** The handlers the TypeScript assembly's mediator is built from, in order. */
const tsHandlers = (main: string): readonly string[] =>
  entries(between(main, 'createRegistryMediator([', '\n]);'));

const GREETING_CORE = 'com.example.greeting.domain.core';

/** What each root lacks, as its refusal names it, when keel cannot read its list. */
const JAVA_ANCHOR = "'@Import(packages = …)' list holding only package names";
const KOTLIN_ANCHOR =
  "'fun mediator(…): Mediator = RegistryMediator(listOf(…))' holding only parameters and handlers";
const TS_ANCHOR = "'createRegistryMediator([…])' call holding only handlers";

describe('persistence on the modulith with the peer context', () => {
  describe.each(['micronaut-rest', 'micronaut-cli-rest'])('%s', (stack) => {
    it('lists both contexts’ packages and the greeting log’s in @Import', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const root = await read(JAVA_ROOT);

      expect(importedPackages(root)).toEqual([
        `"${GREETING_CORE}.greet"`,
        '"com.example.guestbook.domain.core.signing"',
        `"${GREETING_CORE}.greetinglog"`,
      ]);
      // Re-emitted whole, fence and note once: the peer's own rewrite
      // repeated the note inside the bootstrap's fence.
      expect(root.split('One entry per aggregate package')).toHaveLength(2);
      expect(root.split('spotless:off')).toHaveLength(2);
      expect(root.split('spotless:on')).toHaveLength(2);
    });

    it('writes the root in two runs as in one', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const oneRun = await read(JAVA_ROOT);
      await fs.emptyDir(cwd);
      await scaffold(stack, { peer: true });
      expectOk(await addPersistence());

      expect(await read(JAVA_ROOT)).toBe(oneRun);
    });
  });

  describe.each(['micronaut-rest-kotlin', 'micronaut-cli-rest-kotlin'])('%s', (stack) => {
    it('injects the peer’s port and the greeting log’s, and registers every handler', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const root = await read(KOTLIN_ROOT);

      expect(kotlinMediator(root)).toEqual({
        params: [
          'welcome: Welcome',
          'greetingLog: GreetingLog',
          'clock: Clock',
          'unitOfWork: UnitOfWork',
        ],
        handlers: [
          'GreetHandler()',
          'SignHandler(welcome)',
          'RecordGreetingHandler(greetingLog, clock, unitOfWork)',
          'ListGreetingsHandler(greetingLog)',
        ],
      });
      expect(root).toContain(`import ${GREETING_CORE}.greetinglog.RecordGreetingHandler\n`);
      expect(root).toContain(
        'import com.example.greeting.domain.contract.greetinglog.GreetingLog\n',
      );
    });

    it('writes the root in two runs as in one', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const oneRun = await read(KOTLIN_ROOT);
      await fs.emptyDir(cwd);
      await scaffold(stack, { peer: true });
      expectOk(await addPersistence());

      expect(await read(KOTLIN_ROOT)).toBe(oneRun);
    });
  });

  describe.each(['ts-http', 'ts-cli-http'])('%s', (stack) => {
    it('builds the mediator from the peer’s handler and the greeting log’s', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const main = await read(TS_ROOT);

      expect(main).toContain(
        [
          'const pool = createPgPool();',
          'const greetingLog = createPgGreetingLog(transactionalQueryable(pool));',
          'const mediator = createRegistryMediator([',
        ].join('\n'),
      );
      expect(tsHandlers(main)).toEqual([
        'createGreetHandler()',
        'createGuestbookHandler()',
        'createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool))',
        'createListGreetingsHandler(greetingLog)',
      ]);
      expect(main).toContain("import { createGuestbookHandler } from './guestbook.ts';");
    });

    it('writes the root in two runs as in one', async () => {
      await scaffold(stack, { peer: true, persistence: true });
      const oneRun = await read(TS_ROOT);
      await fs.emptyDir(cwd);
      await scaffold(stack, { peer: true });
      expectOk(await addPersistence());

      expect(await read(TS_ROOT)).toBe(oneRun);
    });
  });
});

describe('persistence beside a context keel add module added', () => {
  it('widens a Micronaut @Import list the added context re-emitted, in either order', async () => {
    await scaffold('micronaut-rest');
    await addModule('ordering');
    expectOk(await addPersistence());
    const moduleFirst = importedPackages(await read(JAVA_ROOT));

    expect(moduleFirst).toEqual([
      `"${GREETING_CORE}.greet"`,
      '"com.example.ordering.domain.core"',
      `"${GREETING_CORE}.greetinglog"`,
    ]);

    await fs.emptyDir(cwd);
    await scaffold('micronaut-rest', { persistence: true });
    await addModule('ordering');

    expect(importedPackages(await read(JAVA_ROOT))).toEqual([
      `"${GREETING_CORE}.greet"`,
      `"${GREETING_CORE}.greetinglog"`,
      '"com.example.ordering.domain.core"',
    ]);
  });

  it('widens the hand-wired Kotlin mediator the added context re-emitted, in either order', async () => {
    await scaffold('micronaut-rest-kotlin');
    await addModule('ordering');
    expectOk(await addPersistence());

    expect(kotlinMediator(await read(KOTLIN_ROOT))).toEqual({
      params: [
        'ordering: OrderingHandler',
        'greetingLog: GreetingLog',
        'clock: Clock',
        'unitOfWork: UnitOfWork',
      ],
      handlers: [
        'GreetHandler()',
        'ordering',
        'RecordGreetingHandler(greetingLog, clock, unitOfWork)',
        'ListGreetingsHandler(greetingLog)',
      ],
    });

    await fs.emptyDir(cwd);
    await scaffold('micronaut-rest-kotlin', { persistence: true });
    await addModule('ordering');

    expect(kotlinMediator(await read(KOTLIN_ROOT))).toEqual({
      params: [
        'greetingLog: GreetingLog',
        'clock: Clock',
        'unitOfWork: UnitOfWork',
        'ordering: OrderingHandler',
      ],
      handlers: [
        'GreetHandler()',
        'RecordGreetingHandler(greetingLog, clock, unitOfWork)',
        'ListGreetingsHandler(greetingLog)',
        'ordering',
      ],
    });
  });

  it('widens the TypeScript mediator array the added context spliced into, in either order', async () => {
    await scaffold('ts-http');
    await addModule('ordering');
    expectOk(await addPersistence());

    expect(tsHandlers(await read(TS_ROOT))).toEqual([
      'createGreetHandler()',
      'createOrderingContextHandler()',
      'createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool))',
      'createListGreetingsHandler(greetingLog)',
    ]);

    await fs.emptyDir(cwd);
    await scaffold('ts-http', { persistence: true });
    await addModule('ordering');
    const persistenceFirst = await read(TS_ROOT);

    expect(tsHandlers(persistenceFirst)).toEqual([
      'createGreetHandler()',
      'createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool))',
      'createListGreetingsHandler(greetingLog)',
      'createOrderingContextHandler()',
    ]);
    // After persistence's trailing comma, on a line of its own: spliced
    // in inline there, it left a hole in the array (TS2345).
    expect(persistenceFirst).toContain(
      '  createListGreetingsHandler(greetingLog),\n  createOrderingContextHandler(),\n]);',
    );
  });

  it('widens a TypeScript mediator array the project’s formatter wrapped, trailing comma and all', async () => {
    // The peer context and one added context make the one-line array
    // longer than the scaffold's printWidth, so the project's own
    // prettier wraps it one entry a line, ending on a trailing comma.
    await scaffold('ts-http', { peer: true });
    await addModule('ordering');
    const spliced = await read(TS_ROOT);
    const oneLine = between(spliced, 'createRegistryMediator([', ']);');
    await write(
      TS_ROOT,
      spliced.replace(
        `createRegistryMediator([${oneLine}]);`,
        [
          'createRegistryMediator([',
          '  createGreetHandler(),',
          '  createGuestbookHandler(),',
          '  createOrderingContextHandler(),',
          ']);',
        ].join('\n'),
      ),
    );
    expectOk(await addPersistence());

    expect(await read(TS_ROOT)).toContain(
      [
        'const mediator = createRegistryMediator([',
        '  createGreetHandler(),',
        '  createGuestbookHandler(),',
        '  createOrderingContextHandler(),',
        '  createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool)),',
        '  createListGreetingsHandler(greetingLog),',
        ']);',
      ].join('\n'),
    );
  });

  it('refuses a context named for a port persistence injects, in either order', async () => {
    // `clock` is a legal context name, and the name the hand-wired
    // Kotlin mediator takes persistence's Clock under: a second
    // parameter of that name would not compile.
    const expectTaken = (error: Error): void => {
      expect(error).toBeInstanceOf(PathConflictError);
      expect((error as PathConflictError).refusal).toEqual({
        kind: 'path-conflict',
        path: KOTLIN_ROOT,
        adapterId: expect.stringMatching(/-kotlin$/),
        taken: 'clock',
      });
      expect(error.message).toContain(`'${KOTLIN_ROOT}' already has a 'clock'`);
    };
    await scaffold('micronaut-rest-kotlin');
    await addModule('clock');
    const moduleFirst = await read(KOTLIN_ROOT);

    expectTaken(expectErr(await addPersistence()));
    expect(await read(KOTLIN_ROOT)).toBe(moduleFirst);

    await fs.emptyDir(cwd);
    await scaffold('micronaut-rest-kotlin', { persistence: true });
    const persistenceFirst = await read(KOTLIN_ROOT);

    expectTaken(expectErr(await dispatchAddModule('clock')));
    expect(await read(KOTLIN_ROOT)).toBe(persistenceFirst);
    expect(await fs.pathExists(path.join(cwd, 'modules/clock'))).toBe(false);
  });
});

describe('persistence over the root the walking skeleton rendered', () => {
  // The patches read whatever list they find now; over the skeleton's
  // own they have to write what they always wrote, byte for byte.
  describe.each(['basic', 'modulith'] as const)('under %s', (layout) => {
    it('builds the ts-http mediator as it always has', async () => {
      await scaffold('ts-http', { persistence: true, layout });

      expect(await read(TS_ROOT)).toContain(
        [
          '',
          'const pool = createPgPool();',
          'const greetingLog = createPgGreetingLog(transactionalQueryable(pool));',
          'const mediator = createRegistryMediator([',
          '  createGreetHandler(),',
          '  createRecordGreetingHandler(greetingLog, systemClock, createPgUnitOfWork(pool)),',
          '  createListGreetingsHandler(greetingLog),',
          ']);',
          '',
        ].join('\n'),
      );
    });

    it('rewires the micronaut-rest-kotlin mediator as it always has', async () => {
      await scaffold('micronaut-rest-kotlin', { persistence: true, layout });
      const root =
        layout === 'modulith'
          ? KOTLIN_ROOT
          : 'application/rest/executable/src/main/kotlin/com/example/rest/MediatorFactory.kt';

      expect(await read(root)).toContain(
        [
          '    @Singleton',
          '    fun mediator(greetingLog: GreetingLog, clock: Clock, unitOfWork: UnitOfWork): Mediator =',
          '        RegistryMediator(',
          '            listOf(',
          '                GreetHandler(),',
          '                RecordGreetingHandler(greetingLog, clock, unitOfWork),',
          '                ListGreetingsHandler(greetingLog),',
          '            ),',
          '        )',
          '',
        ].join('\n'),
      );
    });
  });
});

describe.each([
  {
    stack: 'micronaut-rest',
    root: JAVA_ROOT,
    rewritten: 'package com.example.application.api;\n\npublic class MediatorFactory {}\n',
    anchor: JAVA_ANCHOR,
  },
  {
    stack: 'micronaut-rest-kotlin',
    root: KOTLIN_ROOT,
    rewritten: `package com.example.application.api

import ${GREETING_CORE}.greet.GreetHandler

class MediatorFactory
`,
    anchor: KOTLIN_ANCHOR,
  },
  {
    stack: 'ts-http',
    root: TS_ROOT,
    rewritten: "import { createGreetHandler } from '@acme/greeting';\n\nexport {};\n",
    anchor: TS_ANCHOR,
  },
])('a composition root the user rewrote on $stack', (scenario) => {
  /** The refusal, held to its code, the file and what it lacks. */
  const expectRefused = (error: Error): void => {
    expect(error).toBeInstanceOf(PathConflictError);
    expect((error as PathConflictError).code).toBe('keel.path-conflict');
    expect((error as PathConflictError).refusal).toMatchObject({
      path: scenario.root,
      anchor: scenario.anchor,
    });
    expect(error.message).toContain(`'${scenario.root}' has no ${scenario.anchor}`);
  };

  it('is refused to persistence as a file in the way, naming what it lacks', async () => {
    await scaffold(scenario.stack);
    await write(scenario.root, scenario.rewritten);

    expectRefused(expectErr(await addPersistence()));
    // Refused before a file moves: the root as the user left it, and
    // none of what the adapters ahead of this patch would have written.
    expect(await read(scenario.root)).toBe(scenario.rewritten);
    expect(await fs.pathExists(path.join(cwd, 'migrations'))).toBe(false);
  });

  it('is refused to keel add module alike', async () => {
    await scaffold(scenario.stack);
    await write(scenario.root, scenario.rewritten);

    expectRefused(expectErr(await dispatchAddModule('ordering')));
    expect(await read(scenario.root)).toBe(scenario.rewritten);
    expect(await fs.pathExists(path.join(cwd, 'modules/ordering'))).toBe(false);
  });
});

/** A root keel would read as a list: edited so that it no longer is one, if lightly. */
const EDITED = [
  {
    stack: 'micronaut-rest',
    root: JAVA_ROOT,
    edit: 'a comment among the @Import packages',
    from: `    packages = "${GREETING_CORE}.greet",`,
    to: `    packages = {\n        "${GREETING_CORE}.greet" // greeting, the skeleton\n    },`,
    anchor: JAVA_ANCHOR,
  },
  {
    stack: 'micronaut-rest-kotlin',
    root: KOTLIN_ROOT,
    edit: 'a mediator with a block body',
    from: '    fun mediator(): Mediator = RegistryMediator(listOf(GreetHandler()))',
    to: '    fun mediator(): Mediator {\n        return RegistryMediator(listOf(GreetHandler()))\n    }',
    anchor: KOTLIN_ANCHOR,
  },
  {
    stack: 'ts-http',
    root: TS_ROOT,
    edit: 'a comment in the mediator array',
    from: 'createRegistryMediator([createGreetHandler()]);',
    to: "createRegistryMediator([\n  // greeting, the skeleton's own context\n  createGreetHandler(),\n]);",
    anchor: TS_ANCHOR,
  },
];

/**
 * Scaffolds `scenario.stack` and makes its edit to the root; returns
 * the root as edited, which a refusal leaves as it is.
 */
const scaffoldEdited = async (scenario: (typeof EDITED)[number]): Promise<string> => {
  await scaffold(scenario.stack);
  const skeleton = await read(scenario.root);
  expect(skeleton).toContain(scenario.from);
  const edited = skeleton.replace(scenario.from, scenario.to);
  await write(scenario.root, edited);
  return edited;
};

const expectUnread = (error: Error, scenario: (typeof EDITED)[number]): void => {
  expect(error).toBeInstanceOf(PathConflictError);
  expect((error as PathConflictError).refusal).toMatchObject({
    path: scenario.root,
    anchor: scenario.anchor,
  });
};

// A comment split on its commas, or a block body stripped of its
// `return`, re-emitted as the list keel writes, is a root that no
// longer builds; the readers take only what they can write back.
describe.each(EDITED)('a composition root edited past what keel reads: $edit', (scenario) => {
  it('is refused to persistence, the root untouched', async () => {
    const edited = await scaffoldEdited(scenario);

    expectUnread(expectErr(await addPersistence()), scenario);
    expect(await read(scenario.root)).toBe(edited);
  });
});

// `keel add module` reads the Micronaut lists through the same helpers.
// On the TypeScript stacks it splices into the array rather than
// re-emit it, after the last entry and any comment after that, so the
// comment stays where the user put it (`adapters/ts-context.test.ts`
// holds the other places a comment can be).
describe.each(EDITED.filter((scenario) => scenario.stack !== 'ts-http'))(
  'a composition root edited past what keel reads, to keel add module: $edit',
  (scenario) => {
    it('is refused, the root untouched and no context written', async () => {
      const edited = await scaffoldEdited(scenario);

      expectUnread(expectErr(await dispatchAddModule('ordering')), scenario);
      expect(await read(scenario.root)).toBe(edited);
      expect(await fs.pathExists(path.join(cwd, 'modules/ordering'))).toBe(false);
    });
  },
);

describe.each(EDITED.filter((scenario) => scenario.stack === 'ts-http'))(
  'a composition root with a comment in its list, to keel add module: $edit',
  (scenario) => {
    it('takes the context after the last entry, the comment kept', async () => {
      const edited = await scaffoldEdited(scenario);

      expectOk(await dispatchAddModule('ordering'));
      const root = await read(scenario.root);
      expect(root).not.toBe(edited);
      expect(root).toContain(
        [
          'createRegistryMediator([',
          "  // greeting, the skeleton's own context",
          '  createGreetHandler(),',
          '  createOrderingContextHandler(),',
          ']);',
        ].join('\n'),
      );
    });
  },
);

describe.each([
  {
    stack: 'micronaut-rest',
    test: 'application/api/src/test/java/com/example/application/api/GreetControllerTest.java',
    anchor: "'@MicronautTest class GreetControllerTest {' declaration",
  },
  {
    stack: 'micronaut-rest-kotlin',
    test: 'application/api/src/test/kotlin/com/example/application/api/GreetControllerTest.kt',
    anchor: "'class GreetControllerTest(…)' declaration",
  },
])('a controller test the user rewrote on $stack', (scenario) => {
  it('is refused to persistence, naming the test and what it lacks', async () => {
    await scaffold(scenario.stack);
    await write(scenario.test, 'class Other {}\n');

    const refused = expectErr(await addPersistence());
    expect(refused).toBeInstanceOf(PathConflictError);
    expect((refused as PathConflictError).refusal).toMatchObject({
      path: scenario.test,
      anchor: scenario.anchor,
    });
    expect(await read(scenario.test)).toBe('class Other {}\n');
  });
});
