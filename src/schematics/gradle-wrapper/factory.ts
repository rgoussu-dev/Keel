import path from 'node:path';
import { paths } from '../../util/paths.js';
import { renderTemplate } from '../../engine/template.js';
import type { Options, Schematic } from '../../engine/types.js';
import { resolveLanguage, type SupportedLanguage } from '../util.js';

const DEFAULT_GRADLE_VERSION = '8.11.1';

/**
 * Gradle versions look like `8.11`, `8.11.1`, or `9.0-milestone-1`. The
 * regex is strict enough to reject shell metacharacters or relative-path
 * tokens, so the resolved value can be safely interpolated into the
 * `distributionUrl` we render into `gradle-wrapper.properties`.
 */
const GRADLE_VERSION_PATTERN = /^\d+\.\d+(\.\d+)?(-[A-Za-z0-9.-]+)?$/;

/**
 * Emits a complete Gradle Wrapper at the project root so the generated
 * skeleton is runnable without a system-installed Gradle:
 *
 *   - `gradlew` (POSIX launcher, kept executable)
 *   - `gradlew.bat` (Windows launcher)
 *   - `gradle/wrapper/gradle-wrapper.jar` (bootstrap jar)
 *   - `gradle/wrapper/gradle-wrapper.properties` (distribution pointer)
 *
 * Parameters:
 *   - `gradleVersion` — which Gradle distribution the wrapper downloads
 *     at first invocation. Defaults to the latest stable keel ships.
 *   - `language` — reserved for future non-JVM languages; currently only
 *     `java` is supported.
 *
 * Composition: invoked by the walking-skeleton schematic; can also run
 * standalone via `keel generate gradle-wrapper`.
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
    ctx.logger.info(`gradle wrapper ${vars.gradleVersion} emitted.`);
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
