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
    // Quarkus applies no `application` plugin, so there is no `run`
    // task: dev mode takes the arguments through `--quarkus-args`.
    if (framework === 'quarkus') {
      return `./gradlew ${project}:quarkusDev --quarkus-args="${CLI_ARGS}"`;
    }
    const task = framework === 'spring' ? 'bootRun' : 'run';
    return `./gradlew ${project}:${task} --args="${CLI_ARGS}"`;
  }
  if (framework === 'quarkus') {
    return `./mvnw -am -pl ${unit} quarkus:dev -Dquarkus.args="${CLI_ARGS}"`;
  }
  if (framework === 'spring') {
    return `./mvnw -am -pl ${unit} spring-boot:run -Dspring-boot.run.arguments="${CLI_ARGS}"`;
  }
  // Micronaut's CLI has no Maven run goal: package, then run the jar.
  return `./mvnw package && java -jar ${unit}/target/*-SNAPSHOT.jar ${CLI_ARGS}`;
}

/** The class that builds the mediator in each framework's composition root. */
const MEDIATOR_BUILDER: Readonly<Record<JvmRestFramework, string>> = {
  quarkus: 'MediatorProducer',
  spring: 'MediatorConfig',
  micronaut: 'MediatorFactory',
};

/** The JVM dispatch stance — the binding spec's seam, spelled for this family alone. */
function jvmStance(layout: JvmLayoutPaths, framework: JvmRestFramework): string {
  const kernel = layout.layout === 'modulith' ? '`platform/kernel`' : '`domain/kernel`';
  return (
    `Registry Mediator. \`Command\`, \`Handler\` and \`Mediator\` live in ${kernel}; handlers ` +
    'self-declare via `supports()` and carry the domain-owned `@DomainHandler` marker ' +
    '(`@Singleton` pseudo-scope, `jakarta.inject` only, compile-time dependency), which each ' +
    `composition root collects in its own ${FRAMEWORK_LABEL[framework]} idiom — the Mediator builds ` +
    'its registry from that collection, never from an injected `Map`. A handler that must dispatch ' +
    'takes `Provider<Mediator>`, never `Mediator`. No reflection, no service locators outside the ' +
    'composition root.'
  );
}

/** The layout map — the path grammar of the shape that was scaffolded. */
function jvmLayoutRows(
  layout: JvmLayoutPaths,
  framework: JvmRestFramework,
  lang: 'java' | 'kotlin',
  rest: boolean,
  cli: boolean,
): string[] {
  const builder = MEDIATOR_BUILDER[framework];
  const src = `Sources sit under \`src/main/${lang}/<package>/…\` in every module, tests under \`src/test/${lang}\`.`;
  if (layout.layout === 'modulith') {
    return [
      '`platform/kernel/` — `Command`, `Handler`, `Mediator`, `RegistryMediator`, `@DomainHandler`; depends on nothing.',
      '`modules/<ctx>/domain/contract/` — `<Ctx>Command`, results, errors and driven ports (`<Peer>Client`); `modules/<ctx>/domain/core/` — `<Ctx>Handler`.',
      '`modules/<ctx>/user-side/service/` — `<Ctx>Service` + `<Ctx>ServiceAdapter`, the peer seam: the only module a sibling context may depend on.',
      ...(rest
        ? [
            '`modules/<ctx>/user-side/api/{contract,adapters}/` — REST DTOs and resources the REST assembly mounts.',
          ]
        : []),
      ...(cli
        ? ['`modules/<ctx>/user-side/cli/` — the picocli commands the CLI assembly mounts.']
        : []),
      '`modules/<ctx>/infra/<peer>-gateway/` — `<Peer>Gateway` implements `<ctx>`’s `<Peer>Client` port over `<peer>`’s service seam; other driven adapters sit beside it (`infra/clock/fake`).',
      ...(rest
        ? [
            `\`${layout.restRuntime}/\` — the REST assembly (package \`${layout.restRuntimePkg}\`): \`${builder}\` builds the mediator, \`<Ctx>Wiring\` wires each context’s service and gateways into it.`,
          ]
        : []),
      ...(cli
        ? [
            `\`${layout.cliRuntime}/\` — the CLI assembly (package \`${layout.cliRuntimePkg}\`): \`Main\`, \`${builder}\`, and \`<Ctx>Wiring\` per context.`,
          ]
        : []),
      '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
      'Modules meet only at `user-side/service`; never import another context’s `domain`. ' + src,
    ];
  }
  return [
    '`domain/kernel/` — `Command`, `Handler`, `Mediator`; `domain/contract/` — commands, errors, driven ports (`Clock`), `@DomainHandler`; `domain/core/` — one handler package per aggregate + `RegistryMediator`.',
    ...(rest
      ? [
          `\`${layout.restContract}/\` — request/response DTOs and \`ProblemDetails\`; \`${layout.restAdapters}/\` — resources, error mappers and \`${builder}\`: the REST composition root.`,
        ]
      : []),
    ...(cli
      ? [
          `\`${layout.cliRuntime}/\` — picocli commands, \`Main\` and \`${builder}\`: the CLI composition root.`,
        ]
      : []),
    '`infrastructure/<port>/{<impl>,fake}/` — driven adapters, the canonical fake beside each real one (`infrastructure/clock/fake`).',
    '`migrations/sql/V<n>__<name>.sql` — schema migrations, once `keel add persistence` installs them.',
    src,
  ];
}

function jvmFamily(ctx: Ctx): ClaudeKitFamily {
  const framework = jvmRestFramework(ctx.manifest, JVM_CLAUDE_KIT_ID);
  const build = jvmBuildSystem(ctx.manifest, JVM_CLAUDE_KIT_ID);
  const layout = jvmLayout(ctx.manifest.tags);
  const tags: readonly Tag[] = ctx.manifest.tags;
  const rest = tags.includes('arch.server-http');
  const cli = tags.includes('arch.cli');
  const lang = tags.includes('lang.kotlin') ? 'kotlin' : 'java';

  const verifyCommand = build === 'gradle' ? './gradlew build' : './mvnw --batch-mode verify';
  // A combo stack ships both deployment units off one hexagon, and an
  // agent gets a command and a check for each — not the REST half alone.
  const restRun = rest ? restRunCommand(framework, build, layout) : null;
  const cliRun = cli || !rest ? cliRunCommand(framework, build, layout) : null;

  const commands: RunbookCommand[] = [
    { label: 'Build', command: build === 'gradle' ? './gradlew build' : './mvnw package' },
    { label: 'Test', command: build === 'gradle' ? './gradlew test' : './mvnw test' },
    { label: 'Verify (commit gate)', command: verifyCommand },
    ...(restRun !== null
      ? [
          { label: 'Run (dev)', command: restRun },
          { label: 'Probe', command: PROBE },
        ]
      : []),
    ...(cliRun !== null
      ? [{ label: restRun !== null ? 'Run (cli)' : 'Run', command: cliRun }]
      : []),
  ];

  const shape = restRun !== null && cliRun !== null ? 'REST + CLI' : rest ? 'REST' : 'CLI';
  const title = `${FRAMEWORK_LABEL[framework]} ${shape} on ${build === 'gradle' ? 'Gradle' : 'Maven'} (${layout.layout})`;

  const runbook = renderRunbook({
    title,
    commands,
    stance: jvmStance(layout, framework),
    layout: jvmLayoutRows(layout, framework, lang, rest, cli || !rest),
    notes: ['The wrapper is the build entrypoint — never invoke a host `gradle`/`mvn` directly.'],
  });

  const steps: string[] = [];
  if (restRun !== null) {
    steps.push(
      `1. Start dev mode (long-running — run it in the background):

   \`\`\`sh
   ${restRun}
   \`\`\`

2. Wait for the port, then probe the walking skeleton:

   \`\`\`sh
   ${PROBE}
   \`\`\`

   Expect a JSON greeting for \`World\`; a blank \`name\` yields an
   RFC 9457 Problem Details response.

3. Stop the dev process when done.`,
    );
  }
  if (cliRun !== null) {
    steps.push(
      restRun !== null
        ? `4. Run the CLI and read its output:

   \`\`\`sh
   ${cliRun}
   \`\`\`

   Expect the greeting for \`World\` on stdout; a blank \`--name\` exits
   non-zero with the domain error.`
        : `Run the walking-skeleton command and read its output:

\`\`\`sh
${cliRun}
\`\`\`

Expect the greeting for \`World\` on stdout; a blank \`--name\` exits
non-zero with the domain error.`,
    );
  }
  const runSkill = runSkillSpec({
    description:
      restRun !== null && cliRun !== null
        ? 'Launch this service in dev mode, probe it, and run its CLI end to end. Use when asked to run, start, or check the app.'
        : restRun !== null
          ? 'Launch this service in dev mode and probe it end to end. Use when asked to run, start, or check the app.'
          : 'Run this CLI and check its output end to end. Use when asked to run, start, or check the app.',
    body: `# Run the ${restRun !== null && cliRun !== null ? 'service and the CLI' : restRun !== null ? 'service' : 'CLI'}\n\n${steps.join('\n\n')}`,
  });

  return { runbook, runSkill, verifyCommand };
}

export const jvmClaudeKitAdapter: Adapter = claudeKitAdapter(
  JVM_CLAUDE_KIT_ID,
  ['runtime.jvm'],
  jvmFamily,
);
