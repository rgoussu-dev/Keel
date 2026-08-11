/**
 * `containerization/spring-rest-image` adapter — a thin Dockerfile
 * for a Spring Boot REST service. No build stage: the image copies
 * the artifact the host build already produced.
 *
 * Flavors, via the shared sticky `flavor` question:
 *   - `jvm` (default) — the boot jar onto eclipse-temurin;
 *   - `native` — the GraalVM binary onto a minimal glibc base.
 *     Unlike Quarkus and Micronaut, the scaffolded Spring build
 *     carries no GraalVM Native Build Tools wiring, so opting in
 *     patches it in: the `org.graalvm.buildtools.native` Gradle
 *     plugin beside the Boot plugin, or a `native` Maven profile
 *     mirroring the one `spring-boot-starter-parent` ships (the
 *     skeleton imports the BOM instead of that parent). Both patches
 *     are marker-guarded and idempotent — the pattern
 *     `rust-http-bootstrap` established for `Cargo.toml`.
 *
 * The jar path is deterministic — the jvm-build templates pin the
 * archive base name to the module path and the version to
 * `0.1.0-SNAPSHOT` — and the artifact root follows the build system
 * read from the manifest tags (`build/` under `pkg.gradle`, `target/`
 * under `pkg.maven`).
 */

import type { Adapter, ContributionPatch } from '../../contract/composition.js';
import { eolOf, withEol } from '../util.js';
import { FLAVOR_QUESTION, imageFlavor, imageTags, jvmBuildSystem } from './container-image.js';

export const SPRING_REST_IMAGE_ID = 'containerization/spring-rest-image';

const TEMPLATE_ID = 'composition/containerization/spring-rest-image/templates';

const MODULE = 'application/rest/executable';

const JAR = 'application-rest-executable-0.1.0-SNAPSHOT.jar';

/** Latest stable GraalVM Native Build Tools, Gradle and Maven alike. */
const NATIVE_BUILD_TOOLS_VERSION = '1.1.8';

const GRADLE_BUILD_FILE = `${MODULE}/build.gradle.kts`;

const SPRING_PLUGIN_MARKER = 'id("org.springframework.boot")';

const NATIVE_GRADLE_PLUGIN = `id("org.graalvm.buildtools.native") version "${NATIVE_BUILD_TOOLS_VERSION}"`;

const gradleNativePatch = (): ContributionPatch => ({
  target: GRADLE_BUILD_FILE,
  apply: (existing) => {
    if (existing.includes('org.graalvm.buildtools.native')) return existing;
    const eol = eolOf(existing);
    const lines = existing.split(/\r?\n/);
    const boot = lines.findIndex((l) => l.includes(SPRING_PLUGIN_MARKER));
    if (boot === -1) {
      throw new Error(
        `${SPRING_REST_IMAGE_ID}: cannot find the Spring Boot plugin in ${GRADLE_BUILD_FILE} to anchor the Native Build Tools plugin`,
      );
    }
    const indent = /^\s*/.exec(lines[boot]!)?.[0] ?? '    ';
    lines.splice(boot + 1, 0, `${indent}${NATIVE_GRADLE_PLUGIN}`);
    return lines.join(eol);
  },
});

const MAVEN_POM = `${MODULE}/pom.xml`;

const MAVEN_NATIVE_PROFILE = `    <!-- The native profile spring-boot-starter-parent would provide;
         declared here because the reactor imports the BOM instead. -->
    <profile>
      <id>native</id>
      <build>
        <plugins>
          <plugin>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-maven-plugin</artifactId>
            <executions>
              <execution>
                <id>process-aot</id>
                <goals>
                  <goal>process-aot</goal>
                </goals>
              </execution>
            </executions>
          </plugin>
          <plugin>
            <groupId>org.graalvm.buildtools</groupId>
            <artifactId>native-maven-plugin</artifactId>
            <version>${NATIVE_BUILD_TOOLS_VERSION}</version>
            <configuration>
              <metadataRepository>
                <enabled>true</enabled>
              </metadataRepository>
            </configuration>
            <executions>
              <execution>
                <id>add-reachability-metadata</id>
                <goals>
                  <goal>add-reachability-metadata</goal>
                </goals>
              </execution>
              <execution>
                <id>build-native</id>
                <goals>
                  <goal>compile-no-fork</goal>
                </goals>
                <phase>package</phase>
              </execution>
            </executions>
          </plugin>
        </plugins>
      </build>
    </profile>`;

const mavenNativePatch = (): ContributionPatch => ({
  target: MAVEN_POM,
  apply: (existing) => {
    if (existing.includes('native-maven-plugin')) return existing;
    const eol = eolOf(existing);
    const profile = withEol(MAVEN_NATIVE_PROFILE, eol);
    // A POM allows at most one <profiles> element, so merge into an
    // existing block when the project already carries profiles and
    // only open a fresh one when it doesn't.
    const lines = existing.split(/\r?\n/);
    const profilesEnd = lines.findIndex((l) => /^\s*<\/profiles>/.test(l));
    if (profilesEnd !== -1) {
      lines.splice(profilesEnd, 0, profile);
      return lines.join(eol);
    }
    if (!existing.includes('</project>')) {
      throw new Error(
        `${SPRING_REST_IMAGE_ID}: cannot find </project> in ${MAVEN_POM} to anchor the native profile`,
      );
    }
    return existing.replace(
      /<\/project>\s*$/,
      withEol(`  <profiles>\n${MAVEN_NATIVE_PROFILE}\n  </profiles>\n</project>\n`, eol),
    );
  },
});

export const springRestImageAdapter: Adapter = {
  id: SPRING_REST_IMAGE_ID,
  vertical: 'containerization',
  covers: ['image'],
  predicate: { requires: ['framework.spring', 'arch.server-http'] },
  questions: [FLAVOR_QUESTION],
  async contribute(ctx) {
    const build = jvmBuildSystem(ctx.manifest, SPRING_REST_IMAGE_ID);
    const flavor = imageFlavor(ctx.answer('flavor'), SPRING_REST_IMAGE_ID);
    const gradle = build === 'gradle';
    const artifactPath =
      flavor === 'native'
        ? gradle
          ? // The one file nativeCompile leaves in its output directory;
            // globbed because the binary is named after the Gradle
            // project (`executable`), not the module path.
            `${MODULE}/build/native/nativeCompile/*`
          : `${MODULE}/target/application-rest-executable`
        : gradle
          ? `${MODULE}/build/libs/${JAR}`
          : `${MODULE}/target/${JAR}`;
    const buildCommand =
      flavor === 'native'
        ? gradle
          ? './gradlew :application:rest:executable:nativeCompile'
          : './mvnw package -Pnative'
        : gradle
          ? './gradlew build'
          : './mvnw package';
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      flavor,
      artifactPath,
      buildCommand,
    });
    return {
      files,
      ...(flavor === 'native'
        ? { patches: [gradle ? gradleNativePatch() : mavenNativePatch()] }
        : {}),
      tagsAdd: imageTags(flavor),
    };
  },
};
