/**
 * `code-style/jvm-format` adapter — Spotless for all twelve JVM
 * stacks, on Gradle and Maven alike.
 *
 * Two formatters behind one plugin, and the choice of each is
 * load-bearing:
 *
 *   - **Java: prince-of-space.** The two mainstream Java formatters
 *     (google-java-format, palantir-java-format) are unconfigurable
 *     by design, which makes a single cross-language style model
 *     impossible to honour on Java. prince-of-space exposes exactly
 *     the knobs EditorConfig speaks — indent style, indent size,
 *     line length — so keel can render Java's formatter config from
 *     the same {@link STYLE_MODEL} that produced `.editorconfig`.
 *     It ignores `.editorconfig` itself, so this is a **co-render**,
 *     not a read.
 *   - **Kotlin: ktlint.** ktlint treats `.editorconfig` as its
 *     *primary* configuration and reads it at build time, so Kotlin
 *     genuinely follows the emitted file live. keel's per-language
 *     section resolves `*.kt` to the same 4-space/120 the Java side
 *     is configured with, so the two agree.
 *
 * **`spotlessCheck` is deliberately kept out of `check`** —
 * `isEnforceCheck = false` on Gradle, and no `<executions>` binding
 * on Maven. That is the chosen enforcement model: the pre-commit
 * hook auto-fixes, CI verifies, and `./gradlew build` never fails
 * for formatting alone. Without this, a formatter disagreement would
 * break a freshly scaffolded project's very first build.
 *
 * The adapter also emits a deferred `spotlessApply`. keel's own
 * templates are `.ejs` with placeholders, so no Java formatter can
 * be run over them and keel cannot mechanically keep the *rendered*
 * output format-clean. Formatting once at scaffold time makes the
 * tree clean **by construction** instead, at the cost of one extra
 * build-tool invocation — which is what keeps the project's first CI
 * run green.
 */

import {
  FORMATTER_DIMENSION,
  STYLE_MANAGED_TAG,
  formatterCommandsFor,
  styleFor,
} from './code-style.js';
import { eolAware } from '../util.js';
import { upsertFormatStep } from './claude-kit.js';
import { HOOK_TARGET } from './code-style.js';
import type {
  Adapter,
  Contribution,
  Ctx,
  DeferredAction,
  DeferredActionEnv,
  ManifestV2,
} from '../../contract/composition.js';
import type { Logger } from '../../contract/ports/logger.js';
import type { ProcessRunner } from '../../contract/ports/process-runner.js';

export const JVM_FORMAT_ID = 'code-style/jvm-format';

/** Spotless Gradle plugin version. */
export const SPOTLESS_GRADLE_VERSION = '8.10.0';

/** Spotless Maven plugin version. */
export const SPOTLESS_MAVEN_VERSION = '3.10.0';

/**
 * prince-of-space version, the configurable Java formatter.
 * Coordinates are `io.github.agustafson.princeofspace` since 2.x;
 * Spotless resolves them, so only the version is named here.
 */
export const PRINCE_OF_SPACE_VERSION = '2.2.0';

/**
 * ktlint version. Pinned to the last release under the
 * `com.pinterest.ktlint` coordinates; 2.0 moves to `io.github.ktlint`
 * and reorders rule execution, so it waits for a deliberate bump.
 */
export const KTLINT_VERSION = '1.8.0';

const GRADLE_TARGET = 'build.gradle.kts';
const MAVEN_TARGET = 'pom.xml';

/** Opens the keel-managed Spotless block in a Gradle build script. */
export const GRADLE_STYLE_BEGIN = '// keel:code-style:begin';

/** Closes the keel-managed Spotless block in a Gradle build script. */
export const GRADLE_STYLE_END = '// keel:code-style:end';

/** Whether the project's sources are Java or Kotlin. */
function jvmLanguage(tags: readonly string[]): 'java' | 'kotlin' {
  return tags.includes('lang.kotlin') ? 'kotlin' : 'java';
}

/**
 * Renders the Spotless block appended to the root `build.gradle.kts`.
 *
 * Appended as a second top-level `subprojects { }` rather than
 * merged into the bootstrap's existing one: Gradle allows any number
 * of them (they are ordinary function calls), and a sentinel-wrapped
 * append is idempotent without needing surgery inside a block keel
 * did not write.
 *
 * `configure<SpotlessExtension>` rather than a bare `spotless { }`
 * because the Kotlin DSL only generates that accessor where the
 * plugin is applied in the same scope — inside `subprojects` it is
 * not.
 */
export function renderGradleSpotlessBlock(tags: readonly string[]): string {
  const style = styleFor('jvm');
  const language = jvmLanguage(tags);
  const formatterBlock =
    language === 'kotlin'
      ? [
          '        kotlin {',
          '            target("src/**/*.kt")',
          `            ktlint("${KTLINT_VERSION}")`,
          '            endWithNewline()',
          '            trimTrailingWhitespace()',
          '        }',
        ]
      : [
          '        java {',
          '            target("src/**/*.java")',
          `            princeOfSpace("${PRINCE_OF_SPACE_VERSION}")`,
          '                .indentStyle("SPACES")',
          `                .indentSize(${style.indentSize})`,
          `                .lineLength(${style.lineWidth ?? 120})`,
          '            endWithNewline()',
          '            trimTrailingWhitespace()',
          '        }',
        ];
  return [
    GRADLE_STYLE_BEGIN,
    '// Managed by keel — regenerated by `keel add code-style --reapply`.',
    'subprojects {',
    '    apply(plugin = "com.diffplug.spotless")',
    '',
    '    configure<com.diffplug.gradle.spotless.SpotlessExtension> {',
    '        // The commit gate stays out of `check`: the pre-commit hook',
    '        // auto-fixes and CI runs `spotlessCheck` on its own, so a',
    '        // formatting drift never fails `./gradlew build`.',
    '        isEnforceCheck = false',
    '        lineEndings = com.diffplug.spotless.LineEnding.UNIX',
    '',
    ...formatterBlock,
    '    }',
    '}',
    GRADLE_STYLE_END,
    '',
  ].join('\n');
}

/**
 * Adds the Spotless plugin to the root build script and appends the
 * managed configuration block. Idempotent: a script that already
 * names the plugin is returned untouched.
 */
export function addSpotlessToGradle(existing: string, tags: readonly string[]): string {
  if (existing.includes('com.diffplug.spotless')) return existing;
  const pluginsAt = existing.indexOf('plugins {');
  if (pluginsAt === -1) {
    throw new Error(
      `${JVM_FORMAT_ID}: no 'plugins {' block in ${GRADLE_TARGET} — cannot add the Spotless plugin.`,
    );
  }
  const insertAt = pluginsAt + 'plugins {\n'.length;
  const withPlugin =
    existing.slice(0, insertAt) +
    `    id("com.diffplug.spotless") version "${SPOTLESS_GRADLE_VERSION}"\n` +
    existing.slice(insertAt);
  return `${withPlugin.trimEnd()}\n\n${renderGradleSpotlessBlock(tags)}`;
}

/** Renders the `<plugin>` element for the Maven build. */
function renderMavenSpotlessPlugin(tags: readonly string[]): string {
  const style = styleFor('jvm');
  const language = jvmLanguage(tags);
  const formatterBlock =
    language === 'kotlin'
      ? [
          '            <kotlin>',
          '              <ktlint>',
          `                <version>${KTLINT_VERSION}</version>`,
          '              </ktlint>',
          '              <endWithNewline/>',
          '              <trimTrailingWhitespace/>',
          '            </kotlin>',
        ]
      : [
          '            <java>',
          '              <princeOfSpace>',
          `                <version>${PRINCE_OF_SPACE_VERSION}</version>`,
          '                <indentStyle>SPACES</indentStyle>',
          `                <indentSize>${style.indentSize}</indentSize>`,
          `                <lineLength>${style.lineWidth ?? 120}</lineLength>`,
          '              </princeOfSpace>',
          '              <endWithNewline/>',
          '              <trimTrailingWhitespace/>',
          '            </java>',
        ];
  return [
    '        <!-- Managed by keel. Deliberately unbound to any lifecycle',
    '             phase: the pre-commit hook auto-fixes and CI runs',
    '             spotless:check, so `mvnw verify` never fails on format. -->',
    '        <plugin>',
    '          <groupId>com.diffplug.spotless</groupId>',
    '          <artifactId>spotless-maven-plugin</artifactId>',
    `          <version>${SPOTLESS_MAVEN_VERSION}</version>`,
    '          <configuration>',
    '            <lineEndings>UNIX</lineEndings>',
    ...formatterBlock,
    '          </configuration>',
    '        </plugin>',
  ].join('\n');
}

/**
 * Masks `<pluginManagement>` regions with same-length filler so a
 * subsequent index search finds only a `<plugins>` that is a *direct*
 * child of `<build>`. Same-length replacement keeps every index valid
 * against the original string.
 */
function maskPluginManagement(slice: string): string {
  return slice.replace(/<pluginManagement>[\s\S]*?<\/pluginManagement>/g, (m) =>
    ' '.repeat(m.length),
  );
}

/**
 * Adds the Spotless plugin to a root POM.
 *
 * Handles both shapes keel emits: the Java roots carry only a
 * `<pluginManagement>` block, so a `<plugins>` is created; the Kotlin
 * roots already have a direct `<plugins>` for the Kotlin compiler, so
 * the element is inserted into it. Idempotent.
 */
export function addSpotlessToPom(existing: string, tags: readonly string[]): string {
  if (existing.includes('spotless-maven-plugin')) return existing;
  const buildOpen = existing.indexOf('<build>');
  const buildClose = existing.indexOf('</build>', buildOpen);
  if (buildOpen === -1 || buildClose === -1) {
    throw new Error(
      `${JVM_FORMAT_ID}: no <build> element in ${MAVEN_TARGET} — cannot add the Spotless plugin.`,
    );
  }
  const plugin = renderMavenSpotlessPlugin(tags);
  const masked = maskPluginManagement(existing.slice(buildOpen, buildClose));
  const directPlugins = masked.indexOf('<plugins>');
  if (directPlugins !== -1) {
    // Insert the element before the existing block's closing tag,
    // keeping that tag on its own line at its original indent.
    const at = buildOpen + masked.indexOf('</plugins>', directPlugins);
    const head = existing.slice(0, at);
    const indent = /[ \t]*$/.exec(head)?.[0] ?? '    ';
    return `${head.slice(0, head.length - indent.length)}${plugin}\n${indent}${existing.slice(at)}`;
  }
  const head = existing.slice(0, buildClose).replace(/[ \t]*$/, '');
  return `${head}    <plugins>\n${plugin}\n    </plugins>\n  ${existing.slice(buildClose)}`;
}

/**
 * The deferred scaffold-time format run. Emitted because keel's
 * `.ejs` templates cannot themselves be run through a Java
 * formatter — see the module docs.
 */
function formatAction(manifest: ManifestV2): DeferredAction {
  const commands = formatterCommandsFor(manifest.tags);
  const command = commands?.format ?? './gradlew spotlessApply';
  const [bin, ...args] = command.split(' ');
  return {
    id: JVM_FORMAT_ID,
    description: `${command} (format the scaffold so its first CI run is green)`,
    run: ({ cwd, logger, processes }: DeferredActionEnv) => {
      runFormat(cwd, bin ?? './gradlew', args, command, logger, processes);
      return Promise.resolve();
    },
  };
}

/**
 * Runs the format command, warning rather than failing.
 *
 * A formatter that cannot run leaves the tree merely unformatted —
 * every file is still valid and the project still builds, since
 * `spotlessCheck` is out of `check`. Failing the whole install for
 * that would be out of proportion.
 */
function runFormat(
  cwd: string,
  bin: string,
  args: readonly string[],
  command: string,
  logger: Logger,
  processes: ProcessRunner,
): void {
  const result = processes.run(bin, [...args], { cwd });
  if (result.status === 0) {
    logger.success(`code-style: formatted the scaffold with \`${command}\``);
    return;
  }
  logger.warn(
    `code-style: \`${command}\` did not complete; the tree is unformatted but valid. Run it yourself when convenient.`,
  );
}

export const jvmFormatAdapter: Adapter = {
  id: JVM_FORMAT_ID,
  vertical: 'code-style',
  covers: [FORMATTER_DIMENSION],
  predicate: { requires: ['runtime.jvm'] },
  contribute(ctx: Ctx): Contribution {
    const tags = ctx.manifest.tags;
    const commands = formatterCommandsFor(tags);
    if (commands === undefined) {
      throw new Error(`${JVM_FORMAT_ID}: no formatter commands for a runtime.jvm tag set.`);
    }
    const maven = tags.includes('pkg.maven');
    return {
      patches: [
        maven
          ? { target: MAVEN_TARGET, apply: eolAware((e) => addSpotlessToPom(e, tags)) }
          : { target: GRADLE_TARGET, apply: eolAware((e) => addSpotlessToGradle(e, tags)) },
        {
          target: HOOK_TARGET,
          apply: eolAware((existing) => upsertFormatStep(existing, commands.format)),
        },
      ],
      actions: [formatAction(ctx.manifest)],
      tagsAdd: [STYLE_MANAGED_TAG],
    };
  },
};
