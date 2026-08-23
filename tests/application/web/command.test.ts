/**
 * The page's second piece of real logic: the install body, as the
 * command line that would produce it.
 *
 * It lives in `assets/web/` because that is where the page lives, and
 * it is tested here because it is a pure function over the same body
 * `POST /api/install` takes — no DOM, no fetch, nothing that needs a
 * browser.
 *
 * What can be wrong here is not cosmetic. The line is offered as
 * something to paste into a README or a CI job, so a flag it spells
 * differently from `application/cli` is a line that fails when
 * somebody runs it — which is why every case below names the flag the
 * CLI actually declares.
 */

import { describe, expect, it } from 'vitest';
// @ts-expect-error — plain ESM shipped to the browser, no declarations.
import { commandFor, commandText } from '../../../assets/web/src/command.js';

interface Token {
  kind: 'command' | 'flag' | 'value';
  text: string;
}

const line = (target: object, answers: object = {}): string =>
  commandText(commandFor({ cwd: '/tmp/demo', target, answers }));

describe('commandFor', () => {
  it('spells a greenfield install with every dial it carries', () => {
    expect(
      line({
        kind: 'new-project',
        stack: 'quarkus-cli',
        buildSystem: 'maven',
        moduleLayout: 'modulith',
        withPeerContext: true,
      }),
    ).toBe(
      'keel new --stack quarkus-cli --build-system maven --module-layout modulith --with-peer-context --yes',
    );
  });

  it('omits a dial the target does not carry', () => {
    expect(line({ kind: 'new-project', stack: 'go-cli' })).toBe('keel new --stack go-cli --yes');
  });

  it('joins the extra verticals the way --with takes them', () => {
    expect(line({ kind: 'new-project', stack: 'ts-cli', extraVerticals: ['ci', 'dev-env'] })).toBe(
      'keel new --stack ts-cli --with ci,dev-env --yes',
    );
  });

  it('carries a composite build system as the path=id pairs it travels as', () => {
    expect(
      line({ kind: 'new-project', stack: 'fullstack', buildSystem: 'backend=maven,frontend=pnpm' }),
    ).toBe('keel new --stack fullstack --build-system backend=maven,frontend=pnpm --yes');
  });

  it('spells a vertical, and marks a re-render as one', () => {
    expect(line({ kind: 'add-vertical', vertical: 'ci' })).toBe('keel add ci --yes');
    expect(line({ kind: 'add-vertical', vertical: 'ci', reapply: true })).toBe(
      'keel add ci --reapply --yes',
    );
  });

  it('spells a bounded context and what it consumes', () => {
    expect(line({ kind: 'add-module', module: 'billing', consumes: 'greeting' })).toBe(
      'keel add module billing --consumes greeting --yes',
    );
  });

  it('emits one --set per answer, keyed the way the manifest keys them', () => {
    expect(
      line(
        { kind: 'new-project', stack: 'go-cli' },
        { 'vcs/git-init': { defaultBranch: 'trunk' } },
      ),
    ).toBe('keel new --stack go-cli --set vcs/git-init:defaultBranch=trunk --yes');
  });

  it('quotes an answer a shell would otherwise split, and only then', () => {
    expect(
      line(
        { kind: 'new-project', stack: 'go-cli' },
        { 'walking-skeleton/go-bootstrap': { projectName: 'two words' } },
      ),
    ).toBe(
      "keel new --stack go-cli --set 'walking-skeleton/go-bootstrap:projectName=two words' --yes",
    );
  });

  it('escapes a quote inside an answer rather than ending the quoting early', () => {
    expect(line({ kind: 'new-project', stack: 'go-cli' }, { a: { b: "it's" } })).toBe(
      "keel new --stack go-cli --set 'a:b=it'\\''s' --yes",
    );
  });

  it('marks the flags, so the rendered line can highlight them', () => {
    const tokens: Token[] = commandFor({
      cwd: '/tmp/demo',
      target: { kind: 'new-project', stack: 'go-cli' },
      answers: {},
    });
    expect(tokens.filter((token) => token.kind === 'flag').map((token) => token.text)).toEqual([
      '--stack',
      '--yes',
    ]);
  });

  /**
   * A half-filled target is a form still being typed in, not a
   * command — the page previews nothing for it either, and a line
   * reading `keel add module --yes` would be an invitation to run
   * something that refuses.
   */
  it('answers with nothing while the target names no command yet', () => {
    expect(commandFor({ cwd: '/tmp', target: null, answers: {} })).toEqual([]);
    expect(commandFor({ cwd: '/tmp', target: { kind: 'new-project' }, answers: {} })).toEqual([]);
    expect(
      commandFor({ cwd: '/tmp', target: { kind: 'add-module', module: '' }, answers: {} }),
    ).toEqual([]);
  });
});
