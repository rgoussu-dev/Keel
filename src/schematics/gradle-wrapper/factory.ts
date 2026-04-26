import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Options, Schematic } from '../../engine/types.js';
import { resolveLanguage, type SupportedLanguage } from '../util.js';
import * as download from './download.js';

const DEFAULT_GRADLE_VERSION = '9.4.1';

/**
 * Gradle versions look like `8.11`, `8.11.1`, or `9.0-milestone-1`. The
 * regex is strict enough to reject shell metacharacters or relative-path
 * tokens, so the resolved value can be safely interpolated into the
 * `distributionUrl` we render into `gradle-wrapper.properties`.
 */
const GRADLE_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/;

/**
 * Marker payload written for the wrapper jar in dry-run. Starts with the
 * ZIP local-file-header signature (`PK\x03\x04`) so any consumer sniffing
 * the header sees a syntactically valid placeholder; the trailing ASCII
 * makes it easy to recognise if it ever reaches disk by accident.
 */
const DRY_RUN_PLACEHOLDER_JAR = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from(' keel: dry-run placeholder — real jar fetched on commit '),
]);

/**
 * Emits a complete Gradle Wrapper at the project root so the generated
 * skeleton is runnable without a system-installed Gradle:
 *
 *   - `gradlew` (POSIX launcher, kept executable)
 *   - `gradlew.bat` (Windows launcher)
 *   - `gradle/wrapper/gradle-wrapper.jar` (bootstrap jar — downloaded
 *     from services.gradle.org at install time and verified against the
 *     published sha256 sidecar; see {@link download.downloadWrapperJar})
 *   - `gradle/wrapper/gradle-wrapper.properties` (distribution pointer)
 *
 * Parameters:
 *   - `gradleVersion` — which Gradle distribution the wrapper downloads
 *     at first invocation. Defaults to the latest stable keel ships.
 *   - `language` — reserved for future non-JVM languages; currently only
 *     `java` is supported.
 *
 * Composition: invoked by the walking-skeleton schematic; can also run
 * standalone via `keel generate gradle-wrapper`. The network download
 * is skipped on dry-run (consistent with side-effecting siblings like
 * `git-init`); a placeholder buffer is written into the tree so the
 * planned-changes output still surfaces the jar path.
 */
export const gradleWrapperSchematic: Schematic = {
  name: 'gradle-wrapper',
  description: 'Emit the Gradle Wrapper (gradlew, gradlew.bat, gradle/wrapper/*).',
  parameters: [
    {
      name: 'gradleVersion',
      description: 'Gradle version the wrapper downloads (e.g. 8.11.1).',
      required: false,
      prompt: {
        kind: 'input',
        name: 'gradleVersion',
        message: 'gradle version',
        default: DEFAULT_GRADLE_VERSION,
      },
    },
    {
      name: 'language',
      description: 'Target language (java supported in MVP).',
      required: false,
    },
  ],

  async run(tree, options, ctx) {
    const vars = resolve(options);
    const templateRoot = path.join(
      paths.asset('schematics'),
      'gradle-wrapper',
      'templates',
      vars.language,
    );
    await renderTemplate(tree, templateRoot, '', vars as unknown as Record<string, unknown>);
    if (ctx.dryRun) {
      tree.write('gradle/wrapper/gradle-wrapper.jar', DRY_RUN_PLACEHOLDER_JAR);
      ctx.logger.info(
        `gradle wrapper ${vars.gradleVersion} planned (jar will be downloaded on commit).`,
      );
    } else {
      const jar = await download.downloadWrapperJar(vars.gradleVersion);
      tree.write('gradle/wrapper/gradle-wrapper.jar', jar);
      ctx.logger.info(`gradle wrapper ${vars.gradleVersion} emitted.`);
    }
  },
};

interface ResolvedVars {
  gradleVersion: string;
  language: SupportedLanguage;
}

function resolve(options: Options): ResolvedVars {
  const language = resolveLanguage(options['language'], 'gradle-wrapper');
  const raw = String(options['gradleVersion'] ?? DEFAULT_GRADLE_VERSION).trim();
  if (!GRADLE_VERSION_PATTERN.test(raw)) {
    throw new Error(`gradle-wrapper: invalid gradleVersion "${raw}"`);
  }
  return { gradleVersion: raw, language };
}
