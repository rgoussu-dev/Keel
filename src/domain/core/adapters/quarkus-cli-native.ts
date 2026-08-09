/**
 * `distribution/quarkus-cli-native` adapter — emits the GitHub Actions
 * workflows that ship a Quarkus picocli CLI as native binaries via
 * GraalVM. Promotes `runtime.graalvm-native` so downstream verticals
 * (e.g. observability) can key off it for native-image-aware wiring.
 *
 * Composition:
 *   - covers `build` and `release-channel` of the `distribution`
 *     vertical;
 *   - predicate: `framework.quarkus + arch.cli + pkg.gradle` — only
 *     fires for a Quarkus CLI on Gradle, the only stack we know how
 *     to package this way.
 *
 * One sticky question — `targets` — captures which OS/arch
 * combinations the release matrix builds for. The defaults cover the
 * common 3 (linux-amd64, linux-arm64, darwin-arm64); narrower presets
 * exist for users who only ship to one of them.
 *
 * Reads `projectName` from the bootstrap adapter's manifest answers
 * to name the produced binaries; the install orchestrator threads a
 * running manifest snapshot between adapters so the read happens
 * silently without re-prompting.
 *
 * The build itself is parameterised from CI via
 * `-Dquarkus.native.enabled=true`; nothing in the Gradle build files
 * is touched, which keeps this adapter cleanly additive.
 */

import type { Adapter } from '../../contract/composition.js';
import { QUARKUS_CLI_BOOTSTRAP_ID } from './quarkus-cli-bootstrap.js';

export const QUARKUS_CLI_NATIVE_ID = 'distribution/quarkus-cli-native';

const TEMPLATE_ID = 'composition/distribution/quarkus-cli-native/templates';

const TARGET_PRESETS = [
  'linux-amd64,linux-arm64,darwin-arm64',
  'linux-amd64',
  'linux-amd64,darwin-arm64',
] as const;

/**
 * Mapping from a `<os>-<arch>` target token to the GitHub Actions
 * runner that builds it. Update this map (and the choice presets) to
 * add new targets — keep it the single source of truth so templates
 * never carry a hard-coded runner.
 */
const RUNNER_BY_TARGET: Readonly<Record<string, string>> = {
  'linux-amd64': 'ubuntu-latest',
  'linux-arm64': 'ubuntu-22.04-arm',
  'darwin-arm64': 'macos-14',
};

const SUPPORTED_TARGETS = new Set(Object.keys(RUNNER_BY_TARGET));

interface TargetEntry {
  readonly target: string;
  readonly runner: string;
  readonly binarySuffix: string;
}

export const quarkusCliNativeAdapter: Adapter = {
  id: QUARKUS_CLI_NATIVE_ID,
  vertical: 'distribution',
  covers: ['build', 'release-channel'],
  predicate: { requires: ['framework.quarkus', 'arch.cli', 'pkg.gradle'] },
  questions: [
    {
      id: 'targets',
      prompt: 'Which native targets to build?',
      doc: 'GraalVM cross-compiles per OS/arch; CI builds one job per target.',
      default: 'linux-amd64,linux-arm64,darwin-arm64',
      memory: 'sticky',
      choices: [
        {
          value: TARGET_PRESETS[0],
          label: 'common 3',
          doc: 'linux-amd64 + linux-arm64 + darwin-arm64; covers the bulk of CLI users.',
        },
        {
          value: TARGET_PRESETS[1],
          label: 'linux only',
          doc: 'linux-amd64 only; cheapest matrix when you only ship to Linux.',
        },
        {
          value: TARGET_PRESETS[2],
          label: 'linux + macOS arm',
          doc: 'linux-amd64 + darwin-arm64; common laptop + server combo.',
        },
      ],
    },
  ],
  async contribute(ctx) {
    const projectName = ctx.manifest.answers[QUARKUS_CLI_BOOTSTRAP_ID]?.projectName;
    if (!projectName) {
      throw new Error(
        `${QUARKUS_CLI_NATIVE_ID}: requires '${QUARKUS_CLI_BOOTSTRAP_ID}' to have run first; projectName not in manifest`,
      );
    }
    const targets = parseTargets(ctx.answer('targets'));
    const files = await ctx.templates.render(TEMPLATE_ID, '', {
      projectName,
      targets,
      smokeTarget: targets[0],
    });
    return {
      files,
      tagsAdd: ['runtime.graalvm-native'],
    };
  },
};

function parseTargets(raw: string): TargetEntry[] {
  const tokens = raw
    .split(',')
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokens.length === 0) {
    throw new Error(`${QUARKUS_CLI_NATIVE_ID}: 'targets' resolved to an empty list`);
  }
  const seen = new Set<string>();
  const out: TargetEntry[] = [];
  for (const t of tokens) {
    if (!SUPPORTED_TARGETS.has(t)) {
      throw new Error(
        `${QUARKUS_CLI_NATIVE_ID}: unsupported target '${t}'; supported: ${[...SUPPORTED_TARGETS].sort().join(', ')}`,
      );
    }
    if (seen.has(t)) continue;
    seen.add(t);
    out.push({ target: t, runner: RUNNER_BY_TARGET[t]!, binarySuffix: t });
  }
  return out;
}
