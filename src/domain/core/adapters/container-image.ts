/**
 * Shared vocabulary for the `containerization` vertical's image
 * adapters: the capability tags an image contribution promotes, and
 * — for the JVM trio (`quarkus-rest-image`, `spring-rest-image`,
 * `micronaut-rest-image`) — the build-system probe that decides
 * where the host build leaves its artifact plus the sticky
 * JVM-vs-native flavor question.
 *
 * The image adapters read the build system from the manifest tag set
 * rather than doubling every adapter per `pkg.*` tag — the choice
 * only moves the artifact path inside one Dockerfile, it never
 * changes which adapter is selected.
 */

import type { ManifestV2, Question, Tag } from '../../contract/composition.js';
import { gradleProject } from './jvm-module-layout.js';

/** The tag every containerization image adapter promotes. */
export const CONTAINER_IMAGE_TAG: Tag = 'deploy.container-image';

/** Promoted alongside {@link CONTAINER_IMAGE_TAG} by native images. */
export const GRAALVM_NATIVE_TAG: Tag = 'runtime.graalvm-native';

/** A JVM build system keel scaffolds — decides the artifact root. */
export type JvmBuildSystem = 'gradle' | 'maven';

/** Where each build system leaves its artifacts, per module. */
export const JVM_BUILD_ROOT: Readonly<Record<JvmBuildSystem, string>> = {
  gradle: 'build',
  maven: 'target',
};

/**
 * Reads the project's JVM build system from the manifest tag set.
 * Throws when neither `pkg.gradle` nor `pkg.maven` is present — a
 * JVM image cannot name its artifact without knowing the build.
 */
export function jvmBuildSystem(manifest: ManifestV2, requesterId: string): JvmBuildSystem {
  if (manifest.tags.includes('pkg.gradle')) return 'gradle';
  if (manifest.tags.includes('pkg.maven')) return 'maven';
  throw new Error(
    `${requesterId}: requires 'pkg.gradle' or 'pkg.maven' in the manifest tag set to locate the built artifact`,
  );
}

/**
 * The JVM-vs-native flavor question, shared by the JVM image
 * adapters that offer a native image — because the scaffolded build
 * already produces one without build-file changes (Quarkus,
 * Micronaut), or because the adapter patches the wiring in alongside
 * the Dockerfile (Spring).
 */
export const FLAVOR_QUESTION: Question = {
  id: 'flavor',
  prompt: 'Container image flavor?',
  doc: 'Both flavors copy a host-built artifact — the image itself never builds.',
  default: 'jvm',
  memory: 'sticky',
  choices: [
    {
      value: 'jvm',
      label: 'JVM — the jar on a JRE base',
      doc: 'Copies the runnable jar onto eclipse-temurin; the safe default.',
    },
    {
      value: 'native',
      label: 'GraalVM native — an ahead-of-time binary on a minimal base',
      doc: 'Copies the native executable onto a glibc micro base; fast start, small image, longer host build.',
    },
  ],
};

/** The validated flavor answers of {@link FLAVOR_QUESTION}. */
export type ImageFlavor = 'jvm' | 'native';

/** Validates a raw `flavor` answer, failing loudly on anything else. */
export function imageFlavor(raw: string, requesterId: string): ImageFlavor {
  if (raw === 'jvm' || raw === 'native') return raw;
  throw new Error(`${requesterId}: unsupported flavor '${raw}'; supported: jvm, native`);
}

/** The tags an image contribution promotes for a given flavor. */
export function imageTags(flavor: ImageFlavor): readonly Tag[] {
  return flavor === 'native' ? [CONTAINER_IMAGE_TAG, GRAALVM_NATIVE_TAG] : [CONTAINER_IMAGE_TAG];
}

/** A JVM framework keel scaffolds a REST service for. */
export type JvmRestFramework = 'quarkus' | 'spring' | 'micronaut';

/**
 * Reads the project's JVM framework from the manifest tag set.
 * Throws when no `framework.*` tag keel knows is present — the
 * artifact a JVM build produces cannot be named without it.
 */
export function jvmRestFramework(manifest: ManifestV2, requesterId: string): JvmRestFramework {
  if (manifest.tags.includes('framework.quarkus')) return 'quarkus';
  if (manifest.tags.includes('framework.spring')) return 'spring';
  if (manifest.tags.includes('framework.micronaut')) return 'micronaut';
  throw new Error(
    `${requesterId}: requires a JVM framework tag (framework.quarkus, framework.spring or framework.micronaut) in the manifest tag set`,
  );
}

/**
 * The runnable artifact a JVM REST build leaves behind, and the
 * command that produces it. One derivation shared by the
 * `containerization` image adapters (whose Dockerfiles copy the
 * artifact and document the command) and the `distribution` release
 * pipelines (which run the command and then build those Dockerfiles)
 * — the two must never disagree about where the artifact lives.
 */
export interface JvmRestArtifact {
  /** Path (or glob) of the artifact, relative to the project root. */
  readonly artifactPath: string;
  /** The host build command the Dockerfile documents. */
  readonly buildCommand: string;
  /**
   * The command a Linux CI runner uses. Identical to `buildCommand`
   * except for host-only flags — Quarkus' native container-build
   * exists to emit a Linux binary from a non-Linux host, which a
   * Linux runner with GraalVM on the path does not need.
   */
  readonly ciBuildCommand: string;
}

/**
 * The archive base name of the runnable module — the module path with
 * dashes, under either build system (pinned by the jvm-build
 * templates on Gradle; the Maven artifactId).
 */
const unitBase = (unit: string): string => unit.split('/').join('-');

/**
 * Derives {@link JvmRestArtifact} for the runnable module `unit`
 * (the flat layout's lone executable, or the modulith's
 * `application/api` assembly — pass `jvmLayout(tags).restRuntime`).
 */
export function jvmRestArtifact(
  framework: JvmRestFramework,
  build: JvmBuildSystem,
  flavor: ImageFlavor,
  unit: string,
): JvmRestArtifact {
  const gradle = build === 'gradle';
  const root = `${unit}/${JVM_BUILD_ROOT[build]}`;
  if (framework === 'quarkus') {
    const buildTool = gradle ? './gradlew build' : './mvnw package';
    if (flavor === 'native') {
      const ciBuildCommand = `${buildTool} -Dquarkus.native.enabled=true`;
      return {
        artifactPath: `${root}/*-runner`,
        buildCommand: `${ciBuildCommand} -Dquarkus.native.container-build=true`,
        ciBuildCommand,
      };
    }
    return {
      artifactPath: `${root}/quarkus-app/`,
      buildCommand: buildTool,
      ciBuildCommand: buildTool,
    };
  }
  if (flavor === 'native') {
    const buildCommand = gradle
      ? `./gradlew ${gradleProject(unit)}:nativeCompile`
      : framework === 'spring'
        ? './mvnw package -Pnative'
        : './mvnw package -Dpackaging=native-image';
    return {
      artifactPath: gradle
        ? // The one file nativeCompile leaves in its output directory;
          // globbed because the binary is named after the Gradle
          // project (`executable`), not the module path.
          `${unit}/build/native/nativeCompile/*`
        : `${unit}/target/${unitBase(unit)}`,
      buildCommand,
      ciBuildCommand: buildCommand,
    };
  }
  const buildCommand = gradle ? './gradlew build' : './mvnw package';
  // The Micronaut Gradle build ships the shadow `-all` jar; Spring's
  // boot jar and both Maven shapes keep the plain archive name.
  const jarSuffix = framework === 'micronaut' && gradle ? '-all' : '';
  return {
    artifactPath: gradle
      ? `${unit}/build/libs/${unitBase(unit)}-0.1.0-SNAPSHOT${jarSuffix}.jar`
      : `${unit}/target/${unitBase(unit)}-0.1.0-SNAPSHOT.jar`,
    buildCommand,
    ciBuildCommand: buildCommand,
  };
}
