/**
 * The lists the JVM entrypoint bootstraps share in the root build
 * file — `settings.gradle.kts`'s includes and the reactor `pom.xml`'s
 * modules — under both module layouts and both build systems: each
 * entrypoint's entries go in at their rank (`rank.ts`), the seed's
 * first, then the CLI's, then REST's, each in its own order, then
 * anything else, so an entrypoint arriving in a later run lands where
 * one run puts it.
 *
 * **Scenario.** A root file as one run writes it — the seed, the CLI's
 * entries, REST's, then the port fake's and an added context's, which
 * their writers append — against the same file where one entrypoint
 * arrives after the rest, or one of its modules the user deleted alone
 * is put back; and the edges: the seed alone, CRLF, a comment, an
 * entry sharing its line, a profile's modules below the root's.
 *
 * **Factory.** `jvmSharedRootPatches` and `jvmModulithRootPatches` for
 * one entrypoint of a Quarkus project; the other writers' appends are
 * spelled here as those writers spell them.
 *
 * **Port.** The root patch's `apply`.
 */

import { describe, expect, it } from 'vitest';
import type { ContributionPatch } from '../../../../src/domain/contract/composition.js';
import {
  jvmSharedRootPatches,
  type JvmRootArch,
} from '../../../../src/domain/core/adapters/jvm-shared-root.js';
import { jvmModulithRootPatches } from '../../../../src/domain/core/adapters/jvm-shared-root-modulith.js';
import type { JvmBuildSystem } from '../../../../src/domain/core/adapters/jvm-build-system.js';
import { eolOf, withEol } from '../../../../src/domain/core/util.js';

type Layout = 'basic' | 'modulith';

/** One layout's entries, as one run lists them. */
const ENTRIES: Readonly<
  Record<Layout, Readonly<Record<JvmRootArch | 'after', readonly string[]>>>
> = {
  basic: {
    cli: ['application/cli'],
    rest: ['application/rest/contract', 'application/rest/executable'],
    after: ['infrastructure/clock/fake', 'infrastructure/greeting-log/jdbc'],
  },
  modulith: {
    cli: ['modules/greeting/user-side/cli', 'application/cli'],
    rest: [
      'modules/greeting/user-side/api/contract',
      'modules/greeting/user-side/api/adapters',
      'application/api',
    ],
    after: [
      'modules/guestbook/domain/contract',
      'modules/greeting/infra/clock/fake',
      'modules/orders/domain/contract',
    ],
  },
};

const SETTINGS = (['basic', 'modulith'] as const).flatMap((layout) =>
  (['gradle', 'maven'] as const).map(
    (buildSystem) => [`${layout}, ${buildSystem}`, layout, buildSystem] as const,
  ),
);

/** The root build-file patch one entrypoint's bootstrap contributes. */
function rootPatch(
  layout: Layout,
  buildSystem: JvmBuildSystem,
  arch: JvmRootArch,
): ContributionPatch {
  const patches = (layout === 'basic' ? jvmSharedRootPatches : jvmModulithRootPatches)({
    framework: 'quarkus',
    arch,
    language: 'java',
    buildSystem,
    basePackage: 'com.example',
    projectName: 'demo',
    tags: [],
  });
  const target = buildSystem === 'gradle' ? 'settings.gradle.kts' : 'pom.xml';
  const patch = patches.find((p) => p.target === target);
  if (patch === undefined) throw new Error(`no ${target} patch`);
  return patch;
}

/**
 * What the port fake's, the peer's, persistence's and a context's
 * writers do, and what every entrypoint's did before the rank: append
 * to the list.
 */
function appendAfter(
  text: string,
  buildSystem: JvmBuildSystem,
  modules: readonly string[],
): string {
  const eol = eolOf(text);
  if (buildSystem === 'gradle') {
    const includes = modules.map((m) => `include(":${m.replace(/\//g, ':')}")`).join('\n');
    return `${text.trimEnd()}${withEol(`\n${includes}\n`, eol)}`;
  }
  const entries = modules.map((m) => `    <module>${m}</module>`).join('\n');
  return text.replace(withEol('  </modules>', eol), withEol(`${entries}\n  </modules>`, eol));
}

/** The file after `steps`, each an entrypoint's patch or the other writers' appends. */
function after(
  layout: Layout,
  buildSystem: JvmBuildSystem,
  steps: readonly (JvmRootArch | 'after')[],
  seed = rootPatch(layout, buildSystem, 'cli').seed as string,
): string {
  return steps.reduce(
    (text, step) =>
      step === 'after'
        ? appendAfter(text, buildSystem, ENTRIES[layout].after)
        : rootPatch(layout, buildSystem, step).apply(text),
    seed,
  );
}

/** The lines `modules` take in the build file, as its writers spell them. */
function listing(modules: readonly string[], buildSystem: JvmBuildSystem): readonly string[] {
  return modules.map((m) =>
    buildSystem === 'gradle'
      ? `include(":${m.replace(/\//g, ':')}")\n`
      : `    <module>${m}</module>\n`,
  );
}

/** The modules `text` lists, in file order. */
function listed(text: string, buildSystem: JvmBuildSystem): readonly string[] {
  const entry =
    buildSystem === 'gradle' ? /^include\(":([^"]+)"\)$/gm : /^ {4}<module>([^<]+)<\/module>$/gm;
  return [...text.matchAll(entry)].map((m) => (m[1] as string).replace(/:/g, '/'));
}

const crlf = (text: string): string => text.replace(/\n/g, '\r\n');

describe.each(SETTINGS)('the root build file under %s', (_, layout, buildSystem) => {
  const oneRun = after(layout, buildSystem, ['cli', 'rest', 'after']);

  it('adds the first entrypoint to the seed as it always did, at the end of the list', () => {
    const seed = rootPatch(layout, buildSystem, 'cli').seed as string;
    for (const arch of ['cli', 'rest'] as const) {
      expect(rootPatch(layout, buildSystem, arch).apply(seed)).toBe(
        appendAfter(seed, buildSystem, ENTRIES[layout][arch]),
      );
    }
  });

  it('puts the CLI above REST, and REST below the CLI, whichever arrives first', () => {
    const seed = rootPatch(layout, buildSystem, 'cli').seed as string;
    expect(listed(after(layout, buildSystem, ['rest', 'after', 'cli']), buildSystem)).toEqual([
      ...listed(seed, buildSystem),
      ...ENTRIES[layout].cli,
      ...ENTRIES[layout].rest,
      ...ENTRIES[layout].after,
    ]);
    expect(after(layout, buildSystem, ['rest', 'cli'])).toBe(
      after(layout, buildSystem, ['cli', 'rest']),
    );
  });

  it('puts an entrypoint arriving after the port fake and a context where one run puts it', () => {
    expect(after(layout, buildSystem, ['rest', 'after', 'cli'])).toBe(oneRun);
    expect(after(layout, buildSystem, ['cli', 'after', 'rest'])).toBe(oneRun);
  });

  it('works on a CRLF file in its own line endings', () => {
    const seed = crlf(rootPatch(layout, buildSystem, 'cli').seed as string);
    expect(after(layout, buildSystem, ['rest', 'after', 'cli'], seed)).toBe(crlf(oneRun));
    expect(after(layout, buildSystem, ['cli', 'after', 'rest'], seed)).toBe(crlf(oneRun));
  });

  it("puts back one of an entrypoint's modules the user deleted alone where it was", () => {
    for (const arch of ['cli', 'rest'] as const) {
      for (const module of ENTRIES[layout][arch]) {
        const [line] = listing([module], buildSystem) as [string];
        expect(rootPatch(layout, buildSystem, arch).apply(oneRun.replace(line, ''))).toBe(oneRun);
      }
    }
  });

  it('is its own fixed point', () => {
    for (const arch of ['cli', 'rest'] as const) {
      expect(rootPatch(layout, buildSystem, arch).apply(oneRun)).toBe(oneRun);
    }
  });

  it('never moves an entry already there: REST goes above a module the user moved above the CLI, which stays below both', () => {
    const seed = rootPatch(layout, buildSystem, 'cli').seed as string;
    const [moved] = ENTRIES[layout].after as [string];
    const byHand = (lists: readonly (readonly string[])[]): string =>
      lists.reduce((text, modules) => appendAfter(text, buildSystem, modules), seed);
    expect(
      rootPatch(layout, buildSystem, 'rest').apply(byHand([[moved], ENTRIES[layout].cli])),
    ).toBe(byHand([ENTRIES[layout].rest, [moved], ENTRIES[layout].cli]));
  });
});

describe('what ranks nothing', () => {
  it('reads no include inside a block comment, as one the user commented out', () => {
    const seed = rootPatch('basic', 'gradle', 'cli').seed as string;
    const commented = `${after('basic', 'gradle', ['cli'], seed).trimEnd()}\n/*\ninclude(":infrastructure:clock:fake")\n*/\n`;
    expect(rootPatch('basic', 'gradle', 'rest').apply(commented)).toBe(
      `${commented}include(":application:rest:contract")\ninclude(":application:rest:executable")\n`,
    );
  });

  it('reads the includes as code: a line comment holding `/*` hides none below it', () => {
    const noted = (text: string): string =>
      text.replace(
        'include(":domain:kernel")',
        '// the entrypoints live under application/*\ninclude(":domain:kernel")',
      );
    expect(
      rootPatch('basic', 'gradle', 'cli').apply(noted(after('basic', 'gradle', ['rest', 'after']))),
    ).toBe(noted(after('basic', 'gradle', ['cli', 'rest', 'after'])));
  });

  it('reads no module inside an XML comment, as one the user commented out', () => {
    const seed = rootPatch('basic', 'maven', 'cli').seed as string;
    const commented = after('basic', 'maven', ['cli'], seed).replace(
      '  </modules>',
      '    <!--\n    <module>infrastructure/clock/fake</module>\n    -->\n  </modules>',
    );
    expect(rootPatch('basic', 'maven', 'rest').apply(commented)).toBe(
      commented.replace(
        '  </modules>',
        '    <module>application/rest/contract</module>\n    <module>application/rest/executable</module>\n  </modules>',
      ),
    );
  });

  it('reads no include sharing its line with a comment', () => {
    const seed = rootPatch('basic', 'gradle', 'cli').seed as string;
    const noted = `${after('basic', 'gradle', ['cli'], seed).trimEnd()}\ninclude(":infrastructure:clock:fake") // the fake\n`;
    expect(rootPatch('basic', 'gradle', 'rest').apply(noted)).toBe(
      `${noted}include(":application:rest:contract")\ninclude(":application:rest:executable")\n`,
    );
  });

  it('reads no module sharing its line with another', () => {
    const seed = rootPatch('basic', 'maven', 'cli').seed as string;
    const shared = after('basic', 'maven', ['cli'], seed).replace(
      '  </modules>',
      '    <module>infrastructure/clock/fake</module><module>infrastructure/greeting-log/jdbc</module>\n  </modules>',
    );
    expect(rootPatch('basic', 'maven', 'rest').apply(shared)).toBe(
      shared.replace(
        '  </modules>',
        '    <module>application/rest/contract</module>\n    <module>application/rest/executable</module>\n  </modules>',
      ),
    );
  });

  it("reads only the root's own modules, none of a profile's below them", () => {
    const seed = rootPatch('basic', 'maven', 'cli').seed as string;
    const profiled = seed.replace(
      '</project>',
      '  <profiles>\n    <profile>\n      <id>fakes</id>\n      <modules>\n        <module>infrastructure/clock/fake</module>\n      </modules>\n    </profile>\n  </profiles>\n</project>',
    );
    expect(rootPatch('basic', 'maven', 'cli').apply(profiled)).toBe(
      profiled.replace('  </modules>', '    <module>application/cli</module>\n  </modules>'),
    );
  });
});
