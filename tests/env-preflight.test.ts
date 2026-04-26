import { describe, expect, it } from 'vitest';
import {
  parseJavaMajor,
  preflight,
  reportFindings,
  type Env,
  type EnvFinding,
} from '../src/installer/env.js';

interface FakeEnvOptions {
  installed?: Record<string, string>;
  versions?: Record<string, string>;
}

/**
 * Test factory: a deterministic {@link Env} fake. Tools are "found" iff
 * they appear in `installed`; their version output (when probed) comes
 * from `versions`.
 */
function makeEnv(opts: FakeEnvOptions = {}): Env {
  return {
    async which(cmd) {
      return opts.installed?.[cmd] ?? null;
    },
    async version(cmd) {
      return opts.versions?.[cmd] ?? null;
    },
  };
}

describe('parseJavaMajor()', () => {
  it.each([
    ['openjdk version "25" 2025-09-16', 25],
    ['java version "25.0.1" 2025-09-16 LTS', 25],
    ['openjdk version "26-ea" 2026-09-16', 26],
    ['openjdk version "26-ea+12-1234" 2026-09-16', 26],
    ['openjdk version "1.8.0_412" 2024-04-15', 8],
    ['openjdk version "21.0.4" 2024-07-16', 21],
  ])('parses %j → %d', (input, expected) => {
    expect(parseJavaMajor(input)).toBe(expected);
  });

  it('returns null on output with no version token', () => {
    expect(parseJavaMajor('Picked up _JAVA_OPTIONS: -Dfile.encoding=UTF-8')).toBeNull();
    expect(parseJavaMajor('')).toBeNull();
  });
});

describe('preflight()', () => {
  it('flags missing git as a fatal error', async () => {
    const findings = await preflight(makeEnv({ installed: {} }), {
      stack: 'none',
      native: false,
    });
    expect(findings).toContainEqual(expect.objectContaining({ level: 'error', tool: 'git' }));
  });

  it('returns only the git check when stack is none', async () => {
    const findings = await preflight(makeEnv({ installed: { git: '/usr/bin/git' } }), {
      stack: 'none',
      native: false,
    });
    expect(findings).toEqual([
      expect.objectContaining({
        level: 'ok',
        tool: 'git',
        message: expect.stringContaining('git'),
      }),
    ]);
  });

  it('warns when java is missing on the quarkus stack', async () => {
    const findings = await preflight(makeEnv({ installed: { git: '/usr/bin/git' } }), {
      stack: 'java-quarkus',
      native: false,
    });
    expect(findings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        tool: 'java',
        message: expect.stringContaining('no JDK'),
      }),
    );
  });

  it('warns when java is older than 25', async () => {
    const findings = await preflight(
      makeEnv({
        installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
        versions: { java: 'openjdk version "21.0.4" 2024-07-16' },
      }),
      { stack: 'java-quarkus', native: false },
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        tool: 'java',
        message: expect.stringContaining('JDK 21'),
      }),
    );
  });

  it('passes when java 25+ is present', async () => {
    const findings = await preflight(
      makeEnv({
        installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
        versions: { java: 'openjdk version "25" 2025-09-16' },
      }),
      { stack: 'java-quarkus', native: false },
    );
    expect(findings.find((f) => f.tool === 'java')).toMatchObject({ level: 'ok' });
  });

  it('warns when java is present but the version output is unparseable', async () => {
    const findings = await preflight(
      makeEnv({
        installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
        versions: { java: 'something completely unrelated' },
      }),
      { stack: 'java-quarkus', native: false },
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        tool: 'java',
        message: expect.stringContaining("couldn't parse"),
      }),
    );
  });

  it('warns when native-image is missing and native is requested', async () => {
    const findings = await preflight(
      makeEnv({
        installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
        versions: { java: 'openjdk version "25" 2025-09-16' },
      }),
      { stack: 'java-quarkus', native: true },
    );
    expect(findings).toContainEqual(
      expect.objectContaining({ level: 'warn', tool: 'native-image' }),
    );
  });

  it('skips the native-image check when native is false', async () => {
    const findings = await preflight(
      makeEnv({
        installed: { git: '/usr/bin/git', java: '/usr/bin/java' },
        versions: { java: 'openjdk version "25" 2025-09-16' },
      }),
      { stack: 'java-quarkus', native: false },
    );
    expect(findings.find((f) => f.tool === 'native-image')).toBeUndefined();
  });

  it('reports native-image as ok when found', async () => {
    const findings = await preflight(
      makeEnv({
        installed: {
          git: '/usr/bin/git',
          java: '/usr/bin/java',
          'native-image': '/opt/graalvm/bin/native-image',
        },
        versions: { java: 'openjdk version "25" 2025-09-16' },
      }),
      { stack: 'java-quarkus', native: true },
    );
    expect(findings.find((f) => f.tool === 'native-image')).toMatchObject({ level: 'ok' });
  });
});

describe('reportFindings()', () => {
  function makeLogger(): {
    info: (m: string) => void;
    success: (m: string) => void;
    warn: (m: string) => void;
    error: (m: string) => void;
    debug: (m: string) => void;
    lines: { level: string; msg: string }[];
  } {
    const lines: { level: string; msg: string }[] = [];
    return {
      info: (m: string) => lines.push({ level: 'info', msg: m }),
      success: (m: string) => lines.push({ level: 'success', msg: m }),
      warn: (m: string) => lines.push({ level: 'warn', msg: m }),
      error: (m: string) => lines.push({ level: 'error', msg: m }),
      debug: () => {},
      lines,
    };
  }

  it('returns true when any finding is fatal', () => {
    const logger = makeLogger();
    const findings: EnvFinding[] = [
      { level: 'ok', tool: 'a', message: 'fine' },
      { level: 'error', tool: 'b', message: 'broken' },
      { level: 'warn', tool: 'c', message: 'meh' },
    ];
    expect(reportFindings(findings, logger)).toBe(true);
    expect(logger.lines.map((l) => l.level)).toEqual(['info', 'error', 'warn']);
  });

  it('returns false when all findings are non-fatal', () => {
    const logger = makeLogger();
    const findings: EnvFinding[] = [
      { level: 'ok', tool: 'a', message: 'fine' },
      { level: 'warn', tool: 'b', message: 'meh' },
    ];
    expect(reportFindings(findings, logger)).toBe(false);
  });
});
