/**
 * Shared factory for the JVM walking-skeleton bootstrap adapters.
 *
 * Every JVM bootstrap — Quarkus, Spring, Micronaut, in Java or
 * Kotlin — emits the same shape: the binding-spec domain trisection
 * (`domain/kernel`, `domain/contract`, `domain/core`) plus a
 * framework-specific application layer. The trisection is
 * framework-independent per language, so it lives in shared template
 * trees (`assets/composition/walking-skeleton/jvm-domain/<lang>-<arch>`)
 * and each adapter renders it alongside its own application tree.
 *
 * Build files are not part of the source trees: they live in
 * build-system trees under
 * `assets/composition/walking-skeleton/jvm-build/<build-system>/`
 * (a shared `domain/` tree for the module build files plus one tree
 * per combination), selected at contribute time from the manifest's
 * `pkg.*` tag — the same sources scaffold onto Gradle or Maven.
 *
 * The manifest's `layout.*` tag selects the module layout the same
 * way: under `layout.modulith` every tree above has a `*-modulith`
 * sibling emitting the same walking skeleton carved into
 * `platform/` + `modules/<context>/` + `application/<typology>`. The
 * two layouts are alternative *shapes* of one adapter, not two
 * adapters, so the manifest answers and the adapter id are identical
 * either way and downstream adapters keep reading them unchanged.
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
import { packageToPath, validateBasePackage, validateProjectName } from '../util.js';
import type { Adapter, Question } from '../../contract/composition.js';

/** Languages the JVM bootstraps scaffold. */
export type JvmLanguage = 'java' | 'kotlin';

/** Entrypoint shapes the JVM bootstraps scaffold. */
export type JvmArch = 'cli' | 'rest';

/** Declaration of one JVM bootstrap combination. */
export interface JvmBootstrapSpec {
  /** Full adapter id, e.g. `walking-skeleton/spring-rest-bootstrap`. */
  readonly id: string;
  /** Framework tag suffix: `quarkus`, `spring`, `micronaut`. */
  readonly framework: string;
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
  const domainTemplateId = (suffix: string): string =>
    `composition/walking-skeleton/jvm-domain${suffix}/${spec.language}-${spec.arch}`;
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
      const [domain, app, domainBuild, appBuild] = await Promise.all([
        ctx.templates.render(`${domainTemplateId(suffix)}`, '', vars),
        ctx.templates.render(`${appTemplateId(suffix)}`, '', vars),
        ctx.templates.render(`${buildRoot}/${modulith ? 'shared' : 'domain'}`, '', vars),
        ctx.templates.render(`${buildRoot}/${combo}`, '', vars),
      ]);
      return { files: [...domain, ...app, ...domainBuild, ...appBuild] };
    },
  };
}
