/**
 * Shared factory for the JVM walking-skeleton bootstrap adapters.
 *
 * Every JVM bootstrap — Quarkus, Spring, Micronaut, in Java or
 * Kotlin — emits the same shape: the binding-spec domain trisection
 * (`domain/kernel`, `domain/contract`, `domain/core`) plus a
 * framework-specific application layer. The trisection is
 * framework- and arch-independent per language, so under the basic
 * module layout it lives in one shared template tree per language
 * (`assets/composition/walking-skeleton/jvm-domain/<lang>`) and each
 * adapter renders it alongside its own application tree.
 *
 * Build files are not part of the source trees: they live in
 * build-system trees under
 * `assets/composition/walking-skeleton/jvm-build/<build-system>/`
 * (a shared `domain/` tree for the module build files plus one tree
 * per combination for the `application/` module(s)), selected at
 * contribute time from the manifest's `pkg.*` tag — the same sources
 * scaffold onto Gradle or Maven. The root files every entrypoint of
 * a (framework, language) pair shares — `settings.gradle.kts`/
 * `pom.xml`, `build.gradle.kts`, `gradle.properties`, `README.md` —
 * are generated in `jvm-shared-root.ts` instead of templated, since
 * two entrypoints (`arch.cli` + `arch.server-http` both present)
 * must compose onto them rather than each writing a whole-file copy.
 *
 * The manifest's `layout.*` tag selects the module layout: under
 * `layout.modulith` every tree above has a `*-modulith` sibling
 * emitting the same walking skeleton carved into `platform/` +
 * `modules/<context>/` + `application/<typology>`, and its root files
 * are generated the same way by `jvm-shared-root-modulith.ts`. Both
 * layouts therefore compose two entrypoints onto one hexagon; the
 * branch below picks *which* trees and *which* root-file generator,
 * never whether composition is available.
 *
 * One adapter per (framework, arch, language) combination — the
 * resolver picks by predicate (`framework.*` + `arch.*` + `lang.*`),
 * per the composition contract's no-OR rule. All twelve share the
 * sticky `basePackage` / `projectName` questions so downstream
 * adapters (e.g. `sample-port-fake`) read them identically from the
 * manifest whichever bootstrap fired.
 */

import { jvmBuildSystem } from './jvm-build-system.js';
import { jvmModuleLayout } from './jvm-module-layout.js';
import { jvmModulithRootPatches } from './jvm-shared-root-modulith.js';
import { jvmSharedRootPatches, type JvmFramework } from './jvm-shared-root.js';
import { packageToPath, validateBasePackage, validateProjectName } from '../util.js';
import type {
  Adapter,
  ContributionFile,
  ContributionPatch,
  Question,
} from '../../contract/composition.js';

/** Languages the JVM bootstraps scaffold. */
export type JvmLanguage = 'java' | 'kotlin';

/** Entrypoint shapes the JVM bootstraps scaffold. */
export type JvmArch = 'cli' | 'rest';

export type { JvmFramework } from './jvm-shared-root.js';

/** Declaration of one JVM bootstrap combination. */
export interface JvmBootstrapSpec {
  /** Full adapter id, e.g. `walking-skeleton/spring-rest-bootstrap`. */
  readonly id: string;
  /** Framework tag suffix: `quarkus`, `spring`, `micronaut`. */
  readonly framework: JvmFramework;
  readonly arch: JvmArch;
  readonly language: JvmLanguage;
  /**
   * Directory of the framework-specific template tree under
   * `assets/composition/walking-skeleton/`.
   */
  readonly templateDir: string;
}

const ARCH_TAG: Readonly<Record<JvmArch, string>> = {
  cli: 'arch.cli',
  rest: 'arch.server-http',
};

function questions(spec: JvmBootstrapSpec): readonly Question[] {
  const langLabel = spec.language === 'java' ? 'Java' : 'Kotlin';
  return [
    {
      id: 'basePackage',
      prompt: `Base ${langLabel} package`,
      doc: `Used as the root ${langLabel} package and Gradle group, e.g. com.example.`,
      default: 'com.example',
      memory: 'sticky',
    },
    {
      id: 'projectName',
      prompt: 'Project name',
      doc:
        spec.arch === 'cli'
          ? 'Used as the Gradle root project name and the CLI binary name. Lowercase + digits + dashes; ≤63 chars.'
          : 'Used as the Gradle root project name. Lowercase + digits + dashes; ≤63 chars.',
      default: 'walking-skeleton',
      memory: 'sticky',
    },
  ];
}

/**
 * Builds a walking-skeleton bootstrap adapter for one JVM
 * (framework, arch, language) combination. The adapter renders the
 * shared domain tree for its language/arch plus the framework tree
 * under `templateDir`, with the same variables threaded to both.
 */
export function jvmBootstrapAdapter(spec: JvmBootstrapSpec): Adapter {
  const shortName = spec.id.split('/').pop() ?? spec.id;
  const combo = shortName.replace(/-bootstrap$/, '');
  const appTemplateId = (suffix: string): string =>
    `composition/walking-skeleton/${spec.templateDir}/templates${suffix}`;
  return {
    id: spec.id,
    vertical: 'walking-skeleton',
    covers: ['entrypoint'],
    predicate: {
      requires: [`framework.${spec.framework}`, ARCH_TAG[spec.arch], `lang.${spec.language}`],
    },
    questions: questions(spec),
    async contribute(ctx) {
      const basePackage = validateBasePackage(ctx.answer('basePackage').trim(), shortName);
      const projectName = validateProjectName(ctx.answer('projectName').trim(), shortName);
      const vars = {
        basePackage,
        projectName,
        pkgPath: packageToPath(basePackage),
      };
      const buildSystem = jvmBuildSystem(ctx.manifest.tags);
      const modulith = jvmModuleLayout(ctx.manifest.tags) === 'modulith';
      const suffix = modulith ? '-modulith' : '';
      const buildRoot = `composition/walking-skeleton/jvm-build${suffix}/${buildSystem}`;

      // The domain tree, the entrypoint-neutral modules' build files,
      // and every shared (non `application/`) path any rendered tree
      // touches (e.g. Quarkus's CDI `beans.xml`, `.gitignore`) are
      // identical across every entrypoint of this (framework,
      // language) pair, so they upsert via a seed+identity patch
      // instead of a whole-file write — the same "shared-file upsert"
      // `apply.ts` documents, letting `arch.cli` and
      // `arch.server-http` both resolve without conflict. Root files
      // that genuinely differ per entrypoint (module lists, README
      // sections) upsert too, with an idempotent per-arch `apply`.
      //
      // Under the modulith an entrypoint also owns modules *inside*
      // the context (`modules/<ctx>/user-side/cli`, `…/api/…`). Those
      // are single-writer like the assemblies, but upserting them
      // costs nothing and keeps one rule here: `application/` is
      // written, everything else upserts.
      const [domain, app, sharedBuild, appOwn] = await Promise.all([
        ctx.templates.render(
          `composition/walking-skeleton/jvm-domain${suffix}/${spec.language}`,
          '',
          vars,
        ),
        ctx.templates.render(appTemplateId(suffix), '', vars),
        ctx.templates.render(`${buildRoot}/${modulith ? 'shared' : 'domain'}`, '', vars),
        ctx.templates.render(`${buildRoot}/${combo}`, '', vars),
      ]);
      const [appShared, appFiles] = partitionByApplicationPrefix(app);
      const [ownShared, ownFiles] = partitionByApplicationPrefix(appOwn);
      const rootInputs = {
        framework: spec.framework,
        arch: spec.arch,
        language: spec.language,
        buildSystem,
        basePackage,
        projectName,
      };
      return {
        files: [...appFiles, ...ownFiles],
        patches: [
          ...toUpsertPatches([...domain, ...sharedBuild, ...appShared, ...ownShared]),
          ...(modulith ? jvmModulithRootPatches(rootInputs) : jvmSharedRootPatches(rootInputs)),
        ],
      };
    },
  };
}

/**
 * Splits a rendered tree into files under `application/` (never
 * shared between entrypoints — kept as whole-file writes) and
 * everything else (shared across every entrypoint of the same
 * (framework, language) pair, and so must upsert).
 */
function partitionByApplicationPrefix(
  files: readonly ContributionFile[],
): readonly [shared: readonly ContributionFile[], own: readonly ContributionFile[]] {
  const shared: ContributionFile[] = [];
  const own: ContributionFile[] = [];
  for (const f of files) (f.path.startsWith('application/') ? own : shared).push(f);
  return [shared, own];
}

/**
 * Converts whole-file contributions into upsert patches: the content
 * becomes both the seed (used when no entrypoint has written the
 * path yet) and, since the content is identical regardless of which
 * entrypoint runs, the target the `apply` leaves unchanged.
 */
function toUpsertPatches(files: readonly ContributionFile[]): readonly ContributionPatch[] {
  return files.map((f) => ({
    target: f.path,
    seed: contentToString(f.content),
    apply: (existing) => existing,
  }));
}

function contentToString(content: Buffer | string): string {
  return Buffer.isBuffer(content) ? content.toString('utf8') : content;
}
