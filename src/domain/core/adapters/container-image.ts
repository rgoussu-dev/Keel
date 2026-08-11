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
