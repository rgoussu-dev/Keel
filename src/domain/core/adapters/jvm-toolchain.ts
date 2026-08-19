/**
 * `toolchain/jvm-toolchain` adapter — the declared toolchain needs
 * for all twelve JVM stacks: the JDK the scaffold targets, plus the
 * build system the manifest's `pkg.*` tag names. Only the tagged
 * build system is a need — the other one is not installed, so it is
 * not required. Versions and shape come from the shared machinery in
 * `toolchain.ts`.
 */

import { toolchainAdapter } from './toolchain.js';
import { jvmBuildSystem } from './container-image.js';

export const JVM_TOOLCHAIN_ID = 'toolchain/jvm-toolchain';

export const jvmToolchainAdapter = toolchainAdapter(
  JVM_TOOLCHAIN_ID,
  ['runtime.jvm'],
  (ctx, pin) =>
    jvmBuildSystem(ctx.manifest, JVM_TOOLCHAIN_ID) === 'gradle'
      ? [pin('jdk', 'jvm-jdk'), pin('gradle', 'jvm-gradle-wrapper')]
      : [pin('jdk', 'jvm-jdk'), pin('maven', 'jvm-maven-wrapper')],
);
