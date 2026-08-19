/**
 * Tests for the Go native-directive record — the dial's "no manager
 * needed" answer: the in-place merge of `go.mod`'s `toolchain`
 * directive (the consistency check the choice exists to provide),
 * the empty install sequence, and the status parser over
 * `go env GOTOOLCHAIN GOVERSION`.
 */

import { describe, expect, it } from 'vitest';
import type { ProcessResult } from '../../../src/domain/contract/ports/process-runner.js';
import { goNativeProvider } from '../../../src/domain/toolchain/core/go-native.js';

const GO_NEED = { tool: 'go', version: '1.24', source: 'go-toolchain' } as const;

const GO_MOD = 'module example.com/demo\n\ngo 1.24\n\nrequire (\n\tgithub.com/x/y v1.2.3\n)\n';

const reads =
  (files: Readonly<Record<string, string>>) =>
  (path: string): string | undefined =>
    files[path];

const ran = (stdout: string, status = 0): ProcessResult => ({ status, stdout, stderr: '' });

describe('the go-native record', () => {
  it('covers go and nothing else', () => {
    expect([...goNativeProvider.covers]).toEqual(['go']);
  });

  it('spells a Go minor as the release a toolchain name must be', () => {
    expect(goNativeProvider.spell(GO_NEED)).toEqual({ name: 'go', version: 'go1.24.0' });
    expect(goNativeProvider.spell({ tool: 'go', version: '1.24.3' }).version).toBe('go1.24.3');
  });

  it("adds the toolchain directive under go.mod's go directive, leaving the rest alone", () => {
    const [config] = goNativeProvider.render([GO_NEED], reads({ 'go.mod': GO_MOD }));

    expect(config?.path).toBe('go.mod');
    expect(config?.content).toBe(
      'module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n\nrequire (\n\tgithub.com/x/y v1.2.3\n)\n',
    );
  });

  it('rewrites a directive that drifted from the recorded need — the consistency check', () => {
    const drifted = 'module example.com/demo\n\ngo 1.24\ntoolchain go1.22.0\n';

    const [config] = goNativeProvider.render([GO_NEED], reads({ 'go.mod': drifted }));

    expect(config?.content).toBe('module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n');
  });

  it('leaves an already-agreeing go.mod byte-identical, so a re-run writes nothing', () => {
    const agreed = 'module example.com/demo\n\ngo 1.24\ntoolchain go1.24.0\n';

    expect(goNativeProvider.render([GO_NEED], reads({ 'go.mod': agreed }))[0]?.content).toBe(
      agreed,
    );
  });

  it('keeps CRLF line endings when it inserts the directive', () => {
    const crlf = 'module example.com/demo\r\n\r\ngo 1.24\r\n';

    expect(goNativeProvider.render([GO_NEED], reads({ 'go.mod': crlf }))[0]?.content).toBe(
      'module example.com/demo\r\n\r\ngo 1.24\r\ntoolchain go1.24.0\r\n',
    );
  });

  it('refuses when there is no go.mod, or none it can anchor to', () => {
    expect(() => goNativeProvider.render([GO_NEED], reads({}))).toThrow(/project root has none/);
    expect(() =>
      goNativeProvider.render([GO_NEED], reads({ 'go.mod': 'module example.com/demo\n' })),
    ).toThrow(/no 'go' directive/);
  });

  it('renders nothing when no Go need was assigned to it', () => {
    expect(goNativeProvider.render([], reads({ 'go.mod': GO_MOD }))).toEqual([]);
  });

  it('runs nothing — the directive is the provisioning', () => {
    expect(goNativeProvider.install([GO_NEED])).toEqual([]);
  });

  it('counts the need satisfied whenever the go command may switch toolchains', () => {
    const statuses = goNativeProvider.parseStatus(ran('auto\ngo1.22.1\n'), [
      { name: 'go', version: 'go1.24.0' },
    ]);
    expect(statuses.get('go')).toBe(true);
  });

  it('falls back to the local toolchain when switching is off, floor semantics and all', () => {
    const required = [{ name: 'go', version: 'go1.24.0' }];

    expect(goNativeProvider.parseStatus(ran('local\ngo1.24.3\n'), required).get('go')).toBe(true);
    expect(goNativeProvider.parseStatus(ran('local\ngo1.25.0\n'), required).get('go')).toBe(true);
    expect(goNativeProvider.parseStatus(ran('local\ngo1.23.9\n'), required).get('go')).toBe(false);
  });

  it('treats an unset selector as a go too old to switch', () => {
    const required = [{ name: 'go', version: 'go1.24.0' }];

    expect(goNativeProvider.parseStatus(ran('\ngo1.20.14\n'), required).get('go')).toBe(false);
    expect(goNativeProvider.parseStatus(ran('\ngo1.24.0\n'), required).get('go')).toBe(true);
  });

  it('throws on a failed go env rather than guessing', () => {
    expect(() =>
      goNativeProvider.parseStatus({ status: 2, stdout: '', stderr: 'boom' }, [
        { name: 'go', version: 'go1.24.0' },
      ]),
    ).toThrow(/go env exited 2: boom/);
  });
});
