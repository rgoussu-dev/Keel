/**
 * `walking-skeleton/jvm-claude-kit` adapter — the Claude kit for all
 * twelve JVM stacks. One adapter serves the whole family: framework,
 * build system, entrypoint shape and module layout are read from the
 * manifest tag set, and every command below is spelled through
 * `jvmLayout` so nothing here hand-computes a module path.
 *
 * The pre-commit hook runs the family's CI gate (`./gradlew build` /
 * `./mvnw --batch-mode verify`); there is no format step, because the
 * JVM scaffold ships no formatter.
 */

import type { Adapter, Ctx, Tag } from '../../contract/composition.js';
import {
  claudeKitAdapter,
  renderRunbook,
  runSkillSpec,
  type ClaudeKitFamily,
  type RunbookCommand,
} from './claude-kit.js';
import {
  jvmBuildSystem,
  jvmRestFramework,
  type JvmBuildSystem,
  type JvmRestFramework,
} from './container-image.js';
import { jvmLayout, type JvmLayoutPaths } from './jvm-module-layout.js';

export const JVM_CLAUDE_KIT_ID = 'walking-skeleton/jvm-claude-kit';

const PROBE = "curl 'http://localhost:8080/greet?name=World'";
const CLI_ARGS = 'hello --name World';

const FRAMEWORK_LABEL: Readonly<Record<JvmRestFramework, string>> = {
  quarkus: 'Quarkus',
  spring: 'Spring Boot',
  micronaut: 'Micronaut',
};

/** The dev-mode (or run) command for the REST deployment unit. */
function restRunCommand(
  framework: JvmRestFramework,
  build: JvmBuildSystem,
  layout: JvmLayoutPaths,
): string {
  const unit = layout.restRuntime;
  if (build === 'gradle') {
    const project = layout.gradleProject(unit);
    const task =
      framework === 'quarkus' ? 'quarkusDev' : framework === 'spring' ? 'bootRun' : 'run';
    return `./gradlew ${project}:${task}`;
  }
  const goal =
    framework === 'quarkus' ? 'quarkus:dev' : framework === 'spring' ? 'spring-boot:run' : 'mn:run';
  return `./mvnw -am -pl ${unit} ${goal}`;
}

/** The run command for the CLI deployment unit, sample args included. */
function cliRunCommand(
  framework: JvmRestFramework,
  build: JvmBuildSystem,
  layout: JvmLayoutPaths,
): string {
  const unit = layout.cliRuntime;
  if (build === 'gradle') {
    const project = layout.gradleProject(unit);
    const task = framework === 'spring' ? 'bootRun' : 'run';
    return `./gradlew ${project}:${task} --args="${CLI_ARGS}"`;
  }
  if (framework === 'quarkus') return `./mvnw -am -pl ${unit} quarkus:dev`;
  if (framework === 'spring') {
    return `./mvnw -am -pl ${unit} spring-boot:run -Dspring-boot.run.arguments="${CLI_ARGS}"`;
  }
  // Micronaut's CLI has no Maven run goal: package, then run the jar.
  return `./mvnw package && java -jar ${unit}/target/*-SNAPSHOT.jar ${CLI_ARGS}`;
}

function layoutNote(layout: JvmLayoutPaths): string {
  if (layout.layout === 'modulith') {
    return (
      'Modulith layout: the dispatch vocabulary lives in `platform/kernel`, each bounded ' +
      'context under `modules/<context>/` (domain, user-side adapters, its `user-side/service` ' +
      'seam), and the runnable assembly under `application/`. Peers meet only at the seam — ' +
      'never import another context’s `domain` from outside it.'
    );
  }
  return (
    'Flat trisection: `domain/{kernel,contract,core}`, `application/`, `infrastructure/`. ' +
    'The dependency rule of the binding spec applies to these directories.'
  );
}

function jvmFamily(ctx: Ctx): ClaudeKitFamily {
  const framework = jvmRestFramework(ctx.manifest, JVM_CLAUDE_KIT_ID);
  const build = jvmBuildSystem(ctx.manifest, JVM_CLAUDE_KIT_ID);
  const layout = jvmLayout(ctx.manifest.tags);
  const tags: readonly Tag[] = ctx.manifest.tags;
  const rest = tags.includes('arch.server-http');

  const verifyCommand = build === 'gradle' ? './gradlew build' : './mvnw --batch-mode verify';
  const runCommand = rest
    ? restRunCommand(framework, build, layout)
    : cliRunCommand(framework, build, layout);

  const commands: RunbookCommand[] = [
    { label: 'Build', command: build === 'gradle' ? './gradlew build' : './mvnw package' },
    { label: 'Test', command: build === 'gradle' ? './gradlew test' : './mvnw test' },
    { label: 'Verify (commit gate)', command: verifyCommand },
    { label: rest ? 'Run (dev)' : 'Run', command: runCommand },
    ...(rest ? [{ label: 'Probe', command: PROBE }] : []),
  ];

  const shape = rest ? 'REST' : 'CLI';
  const title = `${FRAMEWORK_LABEL[framework]} ${shape} on ${build === 'gradle' ? 'Gradle' : 'Maven'}`;

  const runbook = renderRunbook({
    title,
    commands,
    notes: [
      layoutNote(layout),
      'The wrapper is the build entrypoint — never invoke a host `gradle`/`mvn` directly.',
    ],
  });

  const runSkill = runSkillSpec({
    description: rest
      ? 'Launch this service in dev mode and probe it end to end. Use when asked to run, start, or check the app.'
      : 'Run this CLI and check its output end to end. Use when asked to run, start, or check the app.',
    body: rest
      ? `# Run the service

1. Start dev mode (long-running — run it in the background):

   \`\`\`sh
   ${runCommand}
   \`\`\`

2. Wait for the port, then probe the walking skeleton:

   \`\`\`sh
   ${PROBE}
   \`\`\`

   Expect a JSON greeting for \`World\`; a blank \`name\` yields an
   RFC 9457 Problem Details response.

3. Stop the dev process when done.`
      : `# Run the CLI

Run the walking-skeleton command and read its output:

\`\`\`sh
${runCommand}
\`\`\`

Expect the greeting for \`World\` on stdout; a blank \`--name\` exits
non-zero with the domain error.`,
  });

  return { runbook, runSkill, verifyCommand };
}

export const jvmClaudeKitAdapter: Adapter = claudeKitAdapter(
  JVM_CLAUDE_KIT_ID,
  ['runtime.jvm'],
  jvmFamily,
);
