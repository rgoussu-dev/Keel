import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import type { Logger } from '../util/log.js';

const execFileP = promisify(execFile);

/**
 * Port for environment-tooling probes. The real adapter shells out to
 * the host; tests substitute a fake to drive deterministic scenarios
 * without touching the user's machine.
 */
export interface Env {
  /** Resolves the absolute path to `cmd` on PATH, or null if absent. */
  which(cmd: string): Promise<string | null>;
  /**
   * Runs `cmd args` and returns combined stdout + stderr (some tools —
   * notably `java -version` — print to stderr). Returns null when the
   * binary cannot be executed at all.
   */
  version(cmd: string, args: readonly string[]): Promise<string | null>;
}

/** Severity attached to each preflight finding. */
export type EnvCheckLevel = 'ok' | 'warn' | 'error';

/** Single result from a preflight probe. */
export interface EnvFinding {
  level: EnvCheckLevel;
  tool: string;
  message: string;
}

/** Stack profile gate for stack-specific checks. */
export type StackProfile = 'java-quarkus' | 'none';

/** Knobs for {@link preflight}. */
export interface PreflightOptions {
  /** Stack profile picked by the user; gates stack-specific checks. */
  stack: StackProfile;
  /**
   * When true, also probes for `native-image` (GraalVM). Only meaningful
   * for stacks that produce native binaries.
   */
  native: boolean;
}

/** Minimum Java major version that Quarkus 3.33 LTS + Gradle 9.4 target. */
const MIN_JAVA_MAJOR = 25;

/**
 * Probes the host for the tools the chosen stack needs. Returns the
 * findings in execution order rather than throwing, leaving policy to
 * the caller: `error`-level findings are fatal, `warn` is informational.
 *
 * Universal: `git` must be on PATH (error if missing).
 *
 * `java-quarkus`: a JDK on PATH at major ≥ {@link MIN_JAVA_MAJOR}. Both
 * "missing" and "older than 25" are warnings — Gradle's toolchain
 * auto-provisioning still recovers on first build, but a local JDK is
 * preferable for IDEs and ad-hoc commands. When `native` is requested,
 * `native-image` is probed too; missing it is a warning, not a hard
 * stop, since the JVM packaging path still works.
 */
export async function preflight(env: Env, opts: PreflightOptions): Promise<EnvFinding[]> {
  const findings: EnvFinding[] = [];

  const git = await env.which('git');
  findings.push(
    git
      ? { level: 'ok', tool: 'git', message: `found at ${git}` }
      : { level: 'error', tool: 'git', message: 'git is required but was not found on PATH' },
  );

  if (opts.stack === 'java-quarkus') {
    findings.push(...(await checkJava(env)));
    if (opts.native) findings.push(await checkNativeImage(env));
  }

  return findings;
}

/**
 * Parses the major Java version from `java -version` output. Handles
 * legacy `1.8.0_xxx` (returns `8`), modern `25` / `25.0.1`, and
 * prerelease tokens such as `26-ea+12-1234`. Returns null when no
 * recognisable version string is present.
 */
export function parseJavaMajor(output: string): number | null {
  const m = output.match(/version\s+"(?<v>[^"]+)"/);
  const raw = m?.groups?.['v'];
  if (!raw) return null;
  if (raw.startsWith('1.')) {
    const n = Number.parseInt(raw.split('.')[1] ?? '', 10);
    return Number.isFinite(n) ? n : null;
  }
  const head = raw.split(/[.\-+]/)[0] ?? '';
  const n = Number.parseInt(head, 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Default {@link Env} adapter that probes the real host. PATH walking
 * is dependency-free (avoids `which`/`where` differences) and honours
 * `PATHEXT` on Windows so `git.exe`/`git.cmd` resolve correctly.
 */
export const realEnv: Env = {
  async which(cmd) {
    const dirs = (process.env['PATH'] ?? '').split(path.delimiter);
    const exts =
      process.platform === 'win32'
        ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    for (const dir of dirs) {
      if (!dir) continue;
      for (const ext of exts) {
        const candidate = path.join(dir, cmd + ext);
        try {
          await fs.access(candidate, constants.X_OK);
          return candidate;
        } catch {
          /* not here, try next */
        }
      }
    }
    return null;
  },
  async version(cmd, args) {
    try {
      const { stdout, stderr } = await execFileP(cmd, args, { timeout: 5_000 });
      return `${stdout}\n${stderr}`;
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      if (e.stdout || e.stderr) return `${e.stdout ?? ''}\n${e.stderr ?? ''}`;
      return null;
    }
  },
};

/**
 * Logs each finding at its level and returns true when any finding is
 * fatal (`error`). Callers typically abort the install in that case.
 */
export function reportFindings(findings: readonly EnvFinding[], logger: Logger): boolean {
  let fatal = false;
  for (const f of findings) {
    const line = `${f.tool}: ${f.message}`;
    if (f.level === 'error') {
      logger.error(line);
      fatal = true;
    } else if (f.level === 'warn') {
      logger.warn(line);
    } else {
      logger.info(line);
    }
  }
  return fatal;
}

async function checkJava(env: Env): Promise<EnvFinding[]> {
  const java = await env.which('java');
  if (!java) {
    return [
      {
        level: 'warn',
        tool: 'java',
        message:
          'no JDK on PATH; Gradle toolchains will auto-provision on first build, ' +
          `but a local JDK ${MIN_JAVA_MAJOR} is recommended for IDEs and ad-hoc commands`,
      },
    ];
  }
  const out = await env.version('java', ['-version']);
  const major = parseJavaMajor(out ?? '');
  if (major == null) {
    return [
      {
        level: 'warn',
        tool: 'java',
        message: `found at ${java}, but couldn't parse \`java -version\` output`,
      },
    ];
  }
  if (major < MIN_JAVA_MAJOR) {
    return [
      {
        level: 'warn',
        tool: 'java',
        message:
          `found JDK ${major} at ${java}; the scaffold targets Java ${MIN_JAVA_MAJOR} ` +
          `(Gradle toolchains will provision it on first build)`,
      },
    ];
  }
  return [{ level: 'ok', tool: 'java', message: `found JDK ${major} at ${java}` }];
}

async function checkNativeImage(env: Env): Promise<EnvFinding> {
  const ni = await env.which('native-image');
  return ni
    ? { level: 'ok', tool: 'native-image', message: `found at ${ni}` }
    : {
        level: 'warn',
        tool: 'native-image',
        message:
          'no `native-image` on PATH; install GraalVM CE 25 to build the native package. ' +
          'The JVM build still works without it.',
      };
}
