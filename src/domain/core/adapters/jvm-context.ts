/**
 * Shared machinery for the JVM **added context** adapters — the
 * `bounded-context/<framework>-context` family that
 * `keel add module <name>` fires under a JVM modulith, and the gateway
 * `--consumes <other>` adds to it.
 *
 * [`jvm-peer-context.ts`](./jvm-peer-context.ts) is the model and the
 * shape is the same: one shared adapter factory plus a per-(framework,
 * language) `bind` hook, six bindings in
 * `quarkus-context.ts`, `spring-context.ts` and
 * `micronaut-context.ts`. What differs is everything the peer context
 * could take for granted because it is emitted exactly once, into a
 * project whose composition root it is the first thing to touch.
 *
 * **Four modules where the peer has three.** The
 * `--with-peer-context` context is a pure consumer — contract face,
 * core, gateway, and no `user-side/service`, because nothing in the
 * emitted project ever consumes *it*. An added context publishes a
 * seam from the start, since `keel add module shipping --consumes
 * ordering` is the obvious second command and a context with no seam
 * can never be reached.
 *
 * **The seam is spelled like the skeleton's, with this context's name
 * in it.** `greeting` publishes `GreetingService.greetingFor(String)
 * -> String`; an added `ordering` publishes
 * `OrderingService.orderingFor(String) -> String`. That is what lets
 * one gateway template reach *any* context, keel's own skeleton
 * included, with no table of per-context seam spellings to go stale.
 * Unlike Go's `NewGreeter` or the TypeScript families' `greet`, every
 * name involved here derives from the context name by rule — verified
 * by building, not assumed.
 *
 * **Each context gets its own wiring class, and the shared
 * composition root is never appended to.** The peer context adds a
 * `@Produces`/`@Bean`/`@Singleton` method to `MediatorProducer`,
 * `MediatorConfig` or `MediatorFactory`, which works because there is
 * only ever one of it. Two added contexts consuming the same third
 * context each declare a `<Consumes>Client` and a `<Consumes>Gateway`
 * in their own packages — different types, identical simple names —
 * and Java has no import aliasing, so one import block cannot name
 * both. A wiring class per context has its own import block, its own
 * method names, and lands as a *new file* rather than a patch, which
 * is idempotency for free. It also matches what the other four
 * families already do: Rust, Go and both TypeScript stacks all emit
 * one wiring file per context.
 *
 * **Every list a container reads has to accumulate.** Spring's
 * `@ComponentScan(basePackages = …)` and Micronaut's
 * `@Import(packages = …)` name each context explicitly, and Micronaut
 * Kotlin hand-wires its handler list; a context missing from any of
 * them is never discovered, with no error and no bean. The peer
 * adapters patch each of those once, anchored on the exact text their
 * own edit destroys. This command runs once per context, so the
 * patches here parse the list, add to it, and re-emit it in a form
 * they can parse again — see {@link rewriteList}.
 *
 * Covers no dimension, deliberately: the family is additive and
 * selected purely by the `modules.context` tag.
 */

import { addedContext, CONTEXT_TAG, type AddedContext } from './added-context.js';
import { jvmBuildSystem } from './jvm-build-system.js';
import { freshServiceDoc, STALE_SERVICE_DOC } from './jvm-peer-context.js';
import type { JvmLanguage } from './jvm-bootstrap.js';
import {
  MODULITH_LAYOUT_TAG,
  SKELETON_MODULE,
  gradleProject,
  jvmContextModules,
  jvmLayout,
  jvmSeamModule,
  mavenArtifact,
  type JvmContextModules,
} from './jvm-module-layout.js';
import { eolOf, packageToPath, withEol } from '../util.js';
import type { Adapter, ContributionPatch } from '../../contract/composition.js';

const TEMPLATE_ROOT = 'composition/bounded-context/jvm-context/templates';

const MAVEN_MODULES_END = '  </modules>';

const SOURCE_ROOT: Readonly<Record<JvmLanguage, string>> = { java: 'java', kotlin: 'kotlin' };
const EXTENSION: Readonly<Record<JvmLanguage, string>> = { java: 'java', kotlin: 'kt' };

/**
 * The fully-qualified names a framework **binding** writes, derived
 * once so no binding spells a package by hand.
 *
 * Deliberately only the names a binding needs. Every other name this
 * context spends its own on — the seam, its adapter, the driven port,
 * the gateway — is written by the template tree from the flat `vars`
 * record, so listing them here would be a second derivation of the
 * same strings with nothing checking the two agree.
 */
export interface JvmContextNames {
  /** e.g. `Ordering`. */
  readonly Module: string;
  /** The context's own package root, e.g. `com.example.ordering`. */
  readonly contextPkg: string;
  /** e.g. `com.example.ordering.domain.core` — what a container must be told to look in. */
  readonly corePkg: string;
  /** e.g. `com.example.ordering.domain.core.OrderingHandler`. */
  readonly handler: string;
}

/** Derives the names the bindings need, from the context's own. */
export function jvmContextNames(basePackage: string, added: AddedContext): JvmContextNames {
  const Module = pascal(added.name);
  const contextPkg = `${basePackage}.${added.name}`;
  return {
    Module,
    contextPkg,
    corePkg: `${contextPkg}.domain.core`,
    handler: `${contextPkg}.domain.core.${Module}Handler`,
  };
}

/**
 * What a framework's binding is handed. Everything is derived from
 * the layout resolver and the bootstrap's answers — no binding
 * computes a path itself.
 */
export interface JvmContextBinding {
  /** The project's root package, e.g. `com.example`. */
  readonly basePackage: string;
  /** The context being added. */
  readonly added: AddedContext;
  /** Its derived names. */
  readonly names: JvmContextNames;
  /** The assembly's module directory, e.g. `application/api`. */
  readonly assembly: string;
  /** The assembly's package segment, e.g. `application.api`. */
  readonly assemblyPkg: string;
  /** Path of a source file in the assembly's own package. */
  sourceFile(className: string): string;
}

/** Declaration of one JVM added-context combination. */
export interface JvmContextSpec {
  /** Full adapter id, e.g. `bounded-context/spring-context`. */
  readonly id: string;
  /** Framework tag suffix: `quarkus`, `spring`, `micronaut`. */
  readonly framework: string;
  readonly language: JvmLanguage;
  /**
   * The bootstraps this context layers onto — the CLI and REST
   * bootstrap of the same framework and language. One of them holds
   * the `basePackage` / `projectName` answers.
   */
  readonly bootstrapIds: readonly string[];
  /**
   * The framework's composition-root class — `MediatorProducer`,
   * `MediatorConfig`, `MediatorFactory`. Nothing is *appended* to it
   * (each context brings its own wiring class), but one line inside it
   * stops being true the moment a context consumes the skeleton's
   * seam, and this is what names the file that line lives in.
   */
  readonly rootClass: string;
  /**
   * Template subtrees under `jvm-context/templates/` rendered on top
   * of the language sources — Quarkus' bean-archive marker is the only
   * one so far.
   */
  readonly frameworkTemplates?: readonly string[];
  /**
   * Patches telling this framework's container about the new context.
   * The bindings each context needs are emitted as a wiring *class*
   * from the template tree; what is left here is whatever the
   * framework keeps in a list somewhere else.
   */
  readonly bind: (binding: JvmContextBinding) => readonly ContributionPatch[];
}

/**
 * Builds the added-context adapter for one JVM (framework, language)
 * combination. Both entrypoint shapes are served by the one adapter:
 * the assembly it patches is resolved from the `arch.*` tag, exactly
 * as the layout resolver does everywhere else.
 */
export function jvmContextAdapter(spec: JvmContextSpec): Adapter {
  return {
    id: spec.id,
    vertical: 'bounded-context',
    covers: [],
    predicate: {
      requires: [
        'runtime.jvm',
        `lang.${spec.language}`,
        `framework.${spec.framework}`,
        MODULITH_LAYOUT_TAG,
        CONTEXT_TAG,
      ],
    },
    // Ordering hints rather than requirements: under `keel add module`
    // the bootstraps have long since run, and listing them keeps the
    // adapter honest about what it patches into.
    after: [...spec.bootstrapIds],
    async contribute(ctx) {
      const added = addedContext(ctx.manifest, spec.id);
      const bootstrap = spec.bootstrapIds
        .map((id) => ctx.manifest.answers[id])
        .find((answers) => answers?.basePackage);
      const basePackage = bootstrap?.basePackage;
      const projectName = bootstrap?.projectName;
      if (!basePackage || !projectName) {
        throw new Error(
          `${spec.id}: requires a walking-skeleton bootstrap (one of ${spec.bootstrapIds.join(', ')}) to have run first; basePackage/projectName not in manifest`,
        );
      }

      const names = jvmContextNames(basePackage, added);
      const buildSystem = jvmBuildSystem(ctx.manifest.tags);
      const layout = jvmLayout(ctx.manifest.tags);
      const cli = ctx.manifest.tags.includes('arch.cli');
      const assembly = cli ? layout.cliRuntime : layout.restRuntime;
      const assemblyPkg = cli ? layout.cliRuntimePkg : layout.restRuntimePkg;
      const modules = jvmContextModules(added.name, added.consumes);
      const language = SOURCE_ROOT[spec.language];

      const vars = {
        basePackage,
        projectName,
        pkgPath: packageToPath(basePackage),
        module: added.name,
        Module: names.Module,
        consumes: added.consumes ?? '',
        Consumes: added.consumes === null ? '' : pascal(added.consumes),
        // ejs has no truthiness helper of its own worth trusting
        // across versions, and `consumes` is '' rather than absent so
        // the path token substitutes cleanly. A separate flag keeps
        // the templates reading `if (hasConsumes)`.
        hasConsumes: added.consumes === null ? '' : '1',
        assemblyPkg,
        assemblyPkgPath: assemblyPkg.replace(/\./g, '/'),
      };

      const trees = [
        `${TEMPLATE_ROOT}/${language}`,
        ...(spec.frameworkTemplates ?? []).map((t) => `${TEMPLATE_ROOT}/${t}`),
        `${TEMPLATE_ROOT}/build/${buildSystem}`,
        ...(added.consumes === null
          ? []
          : [
              `${TEMPLATE_ROOT}/consumes/${language}`,
              `${TEMPLATE_ROOT}/build/${buildSystem}-consumes`,
            ]),
      ];
      // The wiring class and its test land in the assembly, whose
      // directory and package are both layout decisions — so they
      // render under the resolved assembly rather than at a path of
      // their own.
      const wiring = `${TEMPLATE_ROOT}/wiring/${spec.framework}/${language}`;
      const rendered = await Promise.all([
        ...trees.map((t) => ctx.templates.render(t, '', vars)),
        ctx.templates.render(wiring, assembly, vars),
      ]);

      const binding: JvmContextBinding = {
        basePackage,
        added,
        names,
        assembly,
        assemblyPkg,
        sourceFile: (className) =>
          `${assembly}/src/main/${language}/${packageToPath(basePackage)}/${assemblyPkg.replace(/\./g, '/')}/${className}.${EXTENSION[spec.language]}`,
      };

      return {
        files: rendered.flat(),
        patches: [
          buildSystem === 'maven'
            ? mavenModulesPatch(spec.id, modules)
            : gradleIncludesPatch(modules),
          assemblyDepsPatch(spec.id, buildSystem, basePackage, assembly, added, modules),
          ...(added.consumes === SKELETON_MODULE ? [seamDocPatch(spec, binding)] : []),
          ...spec.bind(binding),
        ],
      };
    },
  };
}

/**
 * Corrects the one line in the composition root that a context
 * consuming the skeleton makes false.
 *
 * Every modulith root ships its `greetingService` producer under a doc
 * comment saying nothing consumes the seam yet. `--with-peer-context`
 * replaces that line when it binds guestbook's `Welcome`; `keel add
 * module <name> --consumes greeting` is the other door to the same
 * fact, so it replaces it too, naming whichever context the user just
 * added.
 *
 * A no-op when the line is already gone — the peer context got there
 * first, or a previous `add module` did — because `String.replace` of
 * an absent needle returns the source. That is the whole idempotency
 * story here, and it is why this is a replacement rather than an
 * append.
 */
function seamDocPatch(spec: JvmContextSpec, binding: JvmContextBinding): ContributionPatch {
  const port = `${pascal(SKELETON_MODULE)}Client`;
  return {
    target: binding.sourceFile(spec.rootClass),
    apply: (existing) =>
      existing.replace(STALE_SERVICE_DOC, () =>
        freshServiceDoc(spec.language, binding.added.name, port, wiringClass(binding.names)),
      ),
  };
}

/** The assembly class holding one context's bindings. */
function wiringClass(names: JvmContextNames): string {
  return `${names.Module}Wiring`;
}

/** The context's modules, in build order, gateway last. */
function moduleDirs(modules: JvmContextModules): readonly string[] {
  return [
    modules.contract,
    modules.core,
    modules.seam,
    ...(modules.gateway === null ? [] : [modules.gateway]),
  ];
}

/** Registers the context's modules with `settings.gradle.kts`. */
function gradleIncludesPatch(modules: JvmContextModules): ContributionPatch {
  const includes = moduleDirs(modules).map((m) => `include("${gradleProject(m)}")`);
  return {
    target: 'settings.gradle.kts',
    apply: (existing) => {
      const missing = includes.filter((line) => !existing.includes(line));
      if (missing.length === 0) return existing;
      const eol = eolOf(existing);
      return `${existing.trimEnd()}${withEol(`\n${missing.join('\n')}\n`, eol)}`;
    },
  };
}

/** Registers the context's modules with the root pom. */
function mavenModulesPatch(adapterId: string, modules: JvmContextModules): ContributionPatch {
  const entries = moduleDirs(modules).map((m) => `    <module>${m}</module>`);
  return {
    target: 'pom.xml',
    apply: (existing) => {
      const missing = entries.filter((entry) => !existing.includes(entry.trim()));
      if (missing.length === 0) return existing;
      if (!existing.includes(MAVEN_MODULES_END)) {
        throw new Error(
          `${adapterId}: could not find the <modules> block in the root pom.xml — add the ${modules.contract} modules manually`,
        );
      }
      return existing.replace(
        MAVEN_MODULES_END,
        `${missing.join('\n')}${eolOf(existing)}${MAVEN_MODULES_END}`,
      );
    },
  };
}

/**
 * Gives the assembly its dependencies on the new context: the contract
 * and seam the wiring class names, the core so its handler is
 * discovered, the gateway so the driven port has an implementation to
 * bind, and the consumed context's seam so the wiring class can hold a
 * deferred handle on it.
 *
 * Each entry is added only if absent, which is what makes this safe to
 * run once per context: the consumed seam is usually the skeleton's,
 * already declared by the bootstrap, and Maven warns about a duplicate
 * `<dependency>` where Gradle merely tolerates it.
 */
function assemblyDepsPatch(
  adapterId: string,
  buildSystem: 'gradle' | 'maven',
  basePackage: string,
  assembly: string,
  added: AddedContext,
  modules: JvmContextModules,
): ContributionPatch {
  const needed = [
    ...moduleDirs(modules),
    ...(added.consumes === null ? [] : [jvmSeamModule(added.consumes)]),
  ];
  if (buildSystem === 'maven') {
    const dependency = (artifactId: string): string => `    <dependency>
      <groupId>${basePackage}</groupId>
      <artifactId>${artifactId}</artifactId>
      <version>\${project.version}</version>
    </dependency>`;
    // Anchor on a dependency the modulith assembly always declares,
    // never on the closing `</dependencies>` tag: a Quarkus pom opens
    // with a `<dependencyManagement>` block that closes one of those
    // first, so anchoring on the tag silently files the dependencies
    // under version management — where they pin versions and add
    // nothing to the classpath. That failed only under a real Maven
    // build, with `package ... does not exist` in the assembly.
    const anchor = dependency(mavenArtifact(jvmSeamModule(SKELETON_MODULE)));
    return {
      target: `${assembly}/pom.xml`,
      apply: (existing) => {
        const missing = needed
          .map(mavenArtifact)
          .filter((artifact) => !existing.includes(`<artifactId>${artifact}</artifactId>`))
          .map(dependency);
        if (missing.length === 0) return existing;
        if (!existing.includes(anchor)) {
          throw new Error(
            `${adapterId}: could not find the ${mavenArtifact(jvmSeamModule(SKELETON_MODULE))} dependency in ${assembly}/pom.xml`,
          );
        }
        return existing.replace(anchor, `${anchor}${eolOf(existing)}${missing.join('\n')}`);
      },
    };
  }
  return {
    target: `${assembly}/build.gradle.kts`,
    apply: (existing) => {
      const missing = needed
        .map((m) => `    implementation(project("${gradleProject(m)}"))`)
        .filter((line) => !existing.includes(line.trim()));
      if (missing.length === 0) return existing;
      const anchor = `    implementation(project("${gradleProject('platform/kernel')}"))`;
      if (!existing.includes(anchor)) {
        throw new Error(
          `${adapterId}: could not find the platform:kernel dependency in ${assembly}/build.gradle.kts`,
        );
      }
      return existing.replace(anchor, [anchor, ...missing].join(eolOf(existing)));
    },
  };
}

/**
 * Rewrites a delimited list in place, adding `entry` if it is not
 * already there.
 *
 * This is the shape every container-list patch in this family takes,
 * and it exists because the peer context's equivalents cannot be
 * reused: each of those matches one exact rendering of the list — the
 * one the bootstrap emitted — and replaces it with a different one, so
 * a second run finds no anchor. `keel add module` runs once per
 * context, so a patch that works only the first time is a patch that
 * silently stops widening the scan on the context after next.
 *
 * The contract instead is *parse, add, re-emit in a form this same
 * function can parse again*: `render` receives every entry, including
 * the ones already present, and produces the whole list. Round-tripping
 * its own output is the property, and the framework bindings' tests
 * assert it by adding two contexts.
 *
 * Returns the source unchanged when `entry` is already listed, so
 * repetition is a no-op rather than a duplicate.
 *
 * `region` may capture the list through **alternative** groups — one
 * list is spelled either `packages = "one"` or `packages = {…}`, and
 * an alternation is how one regex reads both. The first group that
 * matched is the list, and reading only group 1 silently treats the
 * other form as empty, which drops every entry already there.
 */
/**
 * The Spotless toggle markers keel fences machine-maintained regions
 * with, and the warning that goes inside the fence.
 *
 * Two problems, one fence. A Java formatter reflows what it is given:
 * prince-of-space collapses
 * `@ComponentScan(\n  basePackages = {…},\n  …)` onto a single line,
 * which moves the anchor these adapters match on and breaks
 * `keel add module` outright. And a human reading the file has no way
 * to know the list is rewritten by a tool, so an edit to it is
 * silently lost on the next run.
 *
 * `spotless:off` / `spotless:on` answers the first — Spotless lifts
 * the fenced text out, formats around it, and puts it back verbatim
 * (`toggleOffOn()`, emitted by `code-style/jvm-format`). The warning
 * inside answers the second. They belong together: the region is
 * exempt from formatting *because* it is machine-maintained, and
 * saying so where the exemption is visible is the whole point.
 */
export const FENCE_OFF = 'spotless:off';

/** Closes a {@link FENCE_OFF} region. */
export const FENCE_ON = 'spotless:on';

/** The do-not-edit warning carried inside every fence. */
export const FENCE_WARNING: readonly string[] = [
  'keel:managed — do not edit by hand.',
  '`keel add module <name>` rewrites this list, and anything you change',
  'here is lost on the next run. The fence also stops the formatter',
  'reflowing it, which is what keel anchors on.',
];

/**
 * Renders the commented head of a fenced machine-maintained list:
 * the open marker, the warning, then the caller's own note.
 */
export function fenceOpen(indent: string, note: readonly string[]): readonly string[] {
  return [
    `${indent}// ${FENCE_OFF}`,
    ...FENCE_WARNING.map((line) => `${indent}// ${line}`),
    `${indent}//`,
    ...note.map((line) => `${indent}// ${line}`),
  ];
}

/** Renders the closing marker of a fenced region. */
export function fenceClose(indent: string): string {
  return `${indent}// ${FENCE_ON}`;
}

/**
 * Regex tail matching the fence's closing marker when one is present.
 *
 * Folded into each region pattern so the marker is part of the match
 * and therefore part of what `render` replaces — without it, every
 * re-emit would append a second `spotless:on` under the first.
 */
export const FENCE_ON_TAIL = `(?:[ \\t]*\\r?\\n[ \\t]*\\/\\/[ \\t]*${FENCE_ON})?`;

export function rewriteList(
  source: string,
  region: RegExp,
  entry: string,
  render: (entries: readonly string[]) => string,
): string | null {
  const found = region.exec(source);
  if (found === null) return null;
  const whole = found[0];
  const listed = found.slice(1).find((group) => group !== undefined) ?? '';
  const entries = splitTopLevel(listed).filter((item) => !item.startsWith('//'));
  if (entries.includes(entry)) return source;
  // A function replacer, not the rendered string: `String.replace`
  // reads `$&` and friends out of its replacement, and what `render`
  // produces is emitted source rather than a pattern.
  return source.replace(whole, () => render([...entries, entry]));
}

/**
 * Splits a comma-separated list on the commas that separate its
 * *entries*, ignoring those nested inside brackets.
 *
 * Depth-aware rather than a plain `split(',')` because one of the
 * lists this parses holds constructor calls —
 * `listOf(GreetHandler(), SignHandler(welcome))` — and the day a
 * handler takes two arguments a naive split turns one entry into two,
 * emitting a list that no longer compiles. Every entry keel itself
 * writes survives either way; the user's edits to the list it wrote
 * are the case worth being right about.
 */
function splitTopLevel(list: string): readonly string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i += 1) {
    const c = list[i];
    if (c === '(' || c === '[' || c === '{') depth += 1;
    else if (c === ')' || c === ']' || c === '}') depth -= 1;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i));
      start = i + 1;
    }
  }
  out.push(list.slice(start));
  return out.map((item) => item.trim()).filter((item) => item.length > 0);
}

/** The context name as a JVM type prefix. */
export function pascal(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}
