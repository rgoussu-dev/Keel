/**
 * End-to-end tests for the `code-style` vertical against a realistic
 * tree — `code-style` installs *after* `walking-skeleton`, so the
 * files its formatter adapters patch (the root build file, the
 * pre-commit hook) are already on disk. The fixtures below stand in
 * for that, which is also what lets these tests assert the patches
 * rather than just the new files.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'fs-extra';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rejectingPrompt } from '../../../../src/infrastructure/prompt/fake.js';
import { FakeLogger } from '../../../../src/infrastructure/commons/fake-logger.js';
import { ejsTemplateSource } from '../../../../src/infrastructure/template/ejs-template-source.js';
import { FakeProcessRunner } from '../../../../src/infrastructure/process/fake.js';
import { installVertical } from '../../../../src/domain/core/install.js';
import { codeStyleVertical } from '../../../../src/domain/core/verticals/code-style.js';
import {
  LINT_MANAGED_TAG,
  STYLE_MANAGED_TAG,
} from '../../../../src/domain/core/adapters/code-style.js';
import { renderPreCommitHook } from '../../../../src/domain/core/adapters/claude-kit.js';
import { emptyManifestV2 } from '../../../../src/domain/contract/manifest.js';
import { FsTree } from '../../../../src/infrastructure/tree/fs-tree.js';
import { ResolutionError } from '../../../../src/domain/core/resolver.js';

const HOOK = '.claude/hooks/pre-commit-format.sh';

/** The hook as `walking-skeleton` leaves it: sentinels, no formatter. */
const hookWithoutFormatter = (verify: string): string =>
  renderPreCommitHook({
    runbook: '',
    runSkill: { name: 'run', description: 'x', body: 'x' },
    verifyCommand: verify,
  });

const GRADLE_ROOT = `plugins {
    java
}

subprojects {
    apply(plugin = "java")
}
`;

const MAVEN_ROOT = `<?xml version="1.0" encoding="UTF-8"?>
<project>
  <modelVersion>4.0.0</modelVersion>
  <build>
    <pluginManagement>
      <plugins>
        <plugin>
          <groupId>org.apache.maven.plugins</groupId>
          <artifactId>maven-compiler-plugin</artifactId>
          <version>3.15.0</version>
        </plugin>
      </plugins>
    </pluginManagement>
  </build>
</project>
`;

const PACKAGE_JSON = `{
  "name": "shipper",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.7.0"
  }
}
`;

/** Files the bootstrap would already have emitted, per family. */
function fixtureFor(tags: readonly string[]): Record<string, string> {
  const files: Record<string, string> = { [HOOK]: hookWithoutFormatter('true') };
  if (tags.includes('runtime.jvm')) {
    files[tags.includes('pkg.maven') ? 'pom.xml' : 'build.gradle.kts'] = tags.includes('pkg.maven')
      ? MAVEN_ROOT
      : GRADLE_ROOT;
  }
  if (tags.includes('lang.typescript')) files['package.json'] = PACKAGE_JSON;
  return files;
}

let cwds: string[] = [];

beforeEach(() => {
  cwds = [];
});

afterEach(async () => {
  await Promise.all(cwds.map((c) => fs.remove(c)));
});

const installWith = async (tags: string[], extra?: Record<string, string>) => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'keel-style-'));
  cwds.push(cwd);
  for (const [p, content] of Object.entries({ ...fixtureFor(tags), ...(extra ?? {}) })) {
    await fs.outputFile(path.join(cwd, p), content);
  }
  const tree = new FsTree(cwd);
  const result = await installVertical({
    vertical: codeStyleVertical,
    manifest: { ...emptyManifestV2('2026-04-26T00:00:00Z', '0.5.0-alpha'), tags },
    tree,
    mode: 'non-interactive',
    prompt: rejectingPrompt,
    logger: new FakeLogger(),
    cwd,
    templates: ejsTemplateSource,
    processes: new FakeProcessRunner(),
    now: () => '2026-04-26T12:00:00Z',
  });
  return { tree, cwd, result };
};

const JVM_GRADLE = ['lang.java', 'runtime.jvm', 'pkg.gradle'];
const JVM_MAVEN = ['lang.java', 'runtime.jvm', 'pkg.maven'];
const JVM_KOTLIN = ['lang.kotlin', 'runtime.jvm', 'pkg.gradle'];
const GO = ['lang.go', 'pkg.go-modules'];
const RUST = ['lang.rust', 'pkg.cargo'];
const TS = ['lang.typescript', 'runtime.node', 'pkg.npm'];
const WC = ['lang.typescript', 'runtime.browser', 'framework.web-components', 'pkg.pnpm'];

describe('code-style vertical — the universal baseline', () => {
  it('emits the editor contract on every family', async () => {
    for (const tags of [JVM_GRADLE, GO, RUST, TS, WC]) {
      const { tree } = await installWith(tags);
      expect(tree.read('.editorconfig'), `no .editorconfig for ${tags[0]}`).not.toBeNull();
      expect(tree.read('.gitattributes'), `no .gitattributes for ${tags[0]}`).not.toBeNull();
    }
  });

  it('emits an honest per-language .editorconfig', async () => {
    const { tree } = await installWith(GO);
    const ec = tree.read('.editorconfig')?.toString() ?? '';
    expect(ec).toMatch(/^root = true/);
    expect(ec).toContain('[*.go]');
    expect(ec).toContain('indent_style = tab');
  });

  it('records style.managed so `keel add ci` knows to gate on format', async () => {
    const { result } = await installWith(RUST);
    expect(result.manifest.tags).toContain(STYLE_MANAGED_TAG);
  });

  it('layers onto an existing .editorconfig instead of clobbering it', async () => {
    const mine = 'root = true\n\n[*]\nindent_size = 8\n';
    const { tree } = await installWith(GO, { '.editorconfig': mine });
    const ec = tree.read('.editorconfig')?.toString() ?? '';
    expect(ec).toContain('indent_size = 8');
    expect(ec.indexOf('indent_size = 8')).toBeLessThan(ec.indexOf('# keel:code-style:begin'));
    expect(ec.match(/^root = true$/gm)).toHaveLength(1);
  });

  it('hard-fails naming the gap when no family covers the formatter', async () => {
    // A tag set no formatter adapter matches must refuse to
    // half-install, the same as every other vertical's uncovered
    // dimension.
    await expect(installWith(['lang.cobol'])).rejects.toBeInstanceOf(ResolutionError);
  });
});

describe('code-style vertical — the pre-commit hook', () => {
  it('wires each family’s own format command into the hook', async () => {
    const expected: ReadonlyArray<readonly [string[], string]> = [
      [JVM_GRADLE, './gradlew spotlessApply'],
      [JVM_MAVEN, './mvnw --batch-mode spotless:apply'],
      [GO, 'gofmt -w .'],
      [RUST, 'cargo fmt --all'],
      [TS, 'npm run format'],
      [WC, 'pnpm run format'],
    ];
    for (const [tags, command] of expected) {
      const { tree } = await installWith([...tags]);
      const hook = tree.read(HOOK)?.toString() ?? '';
      expect(hook, `${tags.join(',')} → ${command}`).toContain(`${command} >/dev/null`);
      expect(hook).toContain('xargs git add --');
      expect(hook).not.toContain('No formatter configured');
    }
  });
});

describe('code-style vertical — JVM', () => {
  it('adds Spotless to the Gradle root and keeps the check out of `build`', async () => {
    const { tree } = await installWith(JVM_GRADLE);
    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).toContain('id("com.diffplug.spotless") version "8.10.0"');
    expect(build).toContain('princeOfSpace("2.2.0")');
    expect(build).toContain('.indentSize(4)');
    expect(build).toContain('.lineLength(120)');
    // The enforcement model: CI gates, the build does not.
    expect(build).toContain('isEnforceCheck = false');
  });

  it('uses ktlint rather than prince-of-space on the Kotlin stacks', async () => {
    const { tree } = await installWith(JVM_KOTLIN);
    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).toContain('ktlint("1.8.0")');
    expect(build).not.toContain('princeOfSpace');
  });

  it('creates a <plugins> block in a POM that has only pluginManagement', async () => {
    const { tree } = await installWith(JVM_MAVEN);
    const pom = tree.read('pom.xml')?.toString() ?? '';
    expect(pom).toContain('spotless-maven-plugin');
    expect(pom).toContain('<version>3.10.0</version>');
    expect(pom).toContain('<princeOfSpace>');
    // No lifecycle binding — `mvnw verify` must not run the check.
    expect(pom).not.toContain('<executions>');
    // Exactly one <plugins> under <build>, plus the one in pluginManagement.
    expect(pom.match(/<plugins>/g)).toHaveLength(2);
  });

  it('inserts into an existing direct <plugins> rather than adding a second', async () => {
    const withPlugins = MAVEN_ROOT.replace(
      '  </build>',
      '    <plugins>\n      <plugin><artifactId>kotlin-maven-plugin</artifactId></plugin>\n    </plugins>\n  </build>',
    );
    const { tree } = await installWith(JVM_KOTLIN.map((t) => t).concat('pkg.maven'), {
      'pom.xml': withPlugins,
    });
    const pom = tree.read('pom.xml')?.toString() ?? '';
    expect(pom).toContain('spotless-maven-plugin');
    expect(pom).toContain('kotlin-maven-plugin');
    expect(pom.match(/<plugins>/g)).toHaveLength(2);
  });

  it('emits a scaffold-time format action, since .ejs templates cannot be formatted', async () => {
    const { result } = await installWith(JVM_GRADLE);
    const action = result.applyResult.actions.find((a) => a.id === 'code-style/jvm-format');
    expect(action).toBeDefined();
    expect(action?.description).toContain('spotlessApply');
  });
});

describe('code-style vertical — Rust, Go and the web stacks', () => {
  it('emits rustfmt.toml pinned to an explicit style edition', async () => {
    const { tree } = await installWith(RUST);
    const cfg = tree.read('rustfmt.toml')?.toString() ?? '';
    expect(cfg).toContain('style_edition = "2024"');
    expect(cfg).toContain('max_width = 100');
    expect(cfg).toContain('tab_spaces = 4');
    expect(cfg).toContain('hard_tabs = false');
  });

  it('emits no config for Go, because gofmt has no options', async () => {
    const { tree } = await installWith(GO);
    expect(tree.read('.golangci.yml')).toBeNull();
    expect(tree.read('gofmt.toml')).toBeNull();
  });

  it('adds prettier and both scripts to the workspace root', async () => {
    const { tree } = await installWith(TS);
    const pkg = JSON.parse(tree.read('package.json')?.toString() ?? '{}') as {
      scripts: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.prettier).toBe('^3.9.6');
    expect(pkg.scripts.format).toBe('prettier --write .');
    expect(pkg.scripts['format:check']).toBe('prettier --check .');
    // Pre-existing scripts survive.
    expect(pkg.scripts.typecheck).toBe('tsc --noEmit');
  });

  it('renders a prettier config agreeing with the style model', async () => {
    const { tree } = await installWith(WC);
    const cfg = JSON.parse(tree.read('.prettierrc.json')?.toString() ?? '{}') as Record<
      string,
      unknown
    >;
    expect(cfg.tabWidth).toBe(2);
    expect(cfg.printWidth).toBe(100);
    expect(cfg.useTabs).toBe(false);
    expect(cfg.endOfLine).toBe('lf');
  });

  it('never overwrites a format script the project already defines', async () => {
    const mine = JSON.stringify(
      { name: 'x', scripts: { format: 'biome format --write .' } },
      null,
      2,
    );
    const { tree } = await installWith(TS, { 'package.json': `${mine}\n` });
    const pkg = JSON.parse(tree.read('package.json')?.toString() ?? '{}') as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.format).toBe('biome format --write .');
    expect(pkg.scripts['format:check']).toBe('prettier --check .');
  });
});

describe('code-style vertical — the linter dimension', () => {
  it('covers every family without a ResolutionError, and records the tag', async () => {
    for (const tags of [JVM_GRADLE, JVM_MAVEN, JVM_KOTLIN, GO, RUST, TS, WC]) {
      const { result } = await installWith(tags);
      expect(result.manifest.tags, tags.join(',')).toContain(LINT_MANAGED_TAG);
    }
  });

  it('adds forbidWildcardImports() to the Java Spotless block, for parity with Kotlin', async () => {
    const { tree } = await installWith(JVM_GRADLE);
    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).toContain('forbidWildcardImports()');
  });

  it('adds <forbidWildcardImports/> to the Maven Spotless plugin, same as Gradle', async () => {
    const { tree } = await installWith(JVM_MAVEN);
    const pom = tree.read('pom.xml')?.toString() ?? '';
    expect(pom).toContain('<forbidWildcardImports/>');
  });

  it('adds nothing extra for Kotlin — ktlint’s default ruleset already forbids it', async () => {
    const { tree } = await installWith(JVM_KOTLIN);
    const build = tree.read('build.gradle.kts')?.toString() ?? '';
    expect(build).not.toContain('forbidWildcardImports');
  });

  it('contributes no files for Go or Rust — go vet and clippy need no config', async () => {
    for (const tags of [GO, RUST]) {
      const { tree } = await installWith(tags);
      expect(tree.read('.golangci.yml')).toBeNull();
      expect(tree.read('clippy.toml')).toBeNull();
    }
  });

  it('adds eslint.config.js and the three devDependencies for the web family', async () => {
    const { tree } = await installWith(TS);
    const config = tree.read('eslint.config.js')?.toString() ?? '';
    expect(config).toContain('@typescript-eslint/naming-convention');
    expect(config).toContain('jsdoc/require-jsdoc');
    expect(config).toContain('publicOnly: true');

    const pkg = JSON.parse(tree.read('package.json')?.toString() ?? '{}') as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.eslint).toBeDefined();
    expect(pkg.devDependencies['typescript-eslint']).toBeDefined();
    expect(pkg.devDependencies['eslint-plugin-jsdoc']).toBeDefined();
  });

  it('never overwrites an eslint devDependency the project already pins', async () => {
    const mine = JSON.stringify({ name: 'x', devDependencies: { eslint: '9.0.0' } }, null, 2);
    const { tree } = await installWith(WC, { 'package.json': `${mine}\n` });
    const pkg = JSON.parse(tree.read('package.json')?.toString() ?? '{}') as {
      devDependencies: Record<string, string>;
    };
    expect(pkg.devDependencies.eslint).toBe('9.0.0');
    expect(pkg.devDependencies['typescript-eslint']).toBeDefined();
  });
});
