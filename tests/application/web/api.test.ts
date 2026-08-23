/**
 * The JSON API's mapping: request in, command or query dispatched,
 * `Result` back out as a response.
 *
 * Driven over a fake Mediator rather than the real one, because what
 * is under test is the *mapping* — that a body becomes the command
 * the user meant, that a refusal becomes a 422 carrying the domain's
 * own code, that a malformed body becomes a 400 rather than a stack
 * trace. The engine has its own suites; running it here would only
 * make these slow. What `keel.dials` actually answers is
 * `dials.test.ts`'s subject, over the real registry.
 */

import { describe, expect, it } from 'vitest';
import { buildApi } from '../../../src/application/web/contract/api.js';
import type { DirectoryReader } from '../../../src/application/web/contract/api.js';
import type { UiRequest, UiResponse } from '../../../src/application/web/contract/http.js';
import type { Action } from '../../../src/domain/kernel/action.js';
import type { Mediator } from '../../../src/domain/kernel/mediator.js';
import { DomainError, err, ok, type Result } from '../../../src/domain/kernel/result.js';

/** Mediator fake recording what it was asked to dispatch. */
class RecordingMediator implements Mediator {
  readonly dispatched: Action[] = [];

  constructor(private readonly outcome: Result<unknown> = ok({ recorded: true })) {}

  dispatch<A extends Action>(action: A): Promise<Result<never>> {
    this.dispatched.push(action);
    return Promise.resolve(this.outcome as Result<never>);
  }
}

const directories: DirectoryReader = {
  defaultPath: () => '/home/dev',
  list: (path) =>
    Promise.resolve({
      path,
      parent: '/home',
      entries: [{ name: 'work', path: `${path}/work` }],
      empty: false,
      exists: true,
    }),
};

function request(overrides: Partial<UiRequest>): UiRequest {
  return { method: 'GET', path: '/api/catalog', query: {}, headers: {}, body: '', ...overrides };
}

async function call(mediator: Mediator, overrides: Partial<UiRequest>): Promise<UiResponse> {
  const response = await buildApi({ mediator, directories })(request(overrides));
  if (response === null) throw new Error('the API declined a request it should have answered');
  return response;
}

const bodyOf = (response: UiResponse): Record<string, never> =>
  JSON.parse(response.body) as Record<string, never>;

const NEW_PROJECT = {
  cwd: '/tmp/demo',
  target: { kind: 'new-project', stack: 'ts-cli', buildSystem: 'npm' },
  answers: { 'vcs/git-init': { defaultBranch: 'trunk' } },
};

describe('the keel ui API', () => {
  it('declines anything outside /api so the statics can answer', async () => {
    const mediator = new RecordingMediator();
    const outside = await buildApi({ mediator, directories })(request({ path: '/app/app.css' }));
    expect(outside).toBeNull();
    expect(mediator.dispatched).toEqual([]);
  });

  it('dispatches the catalog query', async () => {
    const mediator = new RecordingMediator();
    const response = await call(mediator, { path: '/api/catalog' });
    expect(response.status).toBe(200);
    expect(mediator.dispatched.map((action) => action.kind)).toEqual(['keel.catalog']);
  });

  it('dispatches a project-status query for the requested path', async () => {
    const mediator = new RecordingMediator();
    await call(mediator, { path: '/api/project', query: { path: '/tmp/demo' } });
    expect(mediator.dispatched[0]).toMatchObject({
      kind: 'keel.project-status',
      cwd: '/tmp/demo',
    });
  });

  it('refuses a project query with no path', async () => {
    const response = await call(new RecordingMediator(), { path: '/api/project' });
    expect(response.status).toBe(400);
    expect(bodyOf(response)).toMatchObject({ error: { code: 'keel.web.bad-request' } });
  });

  it('lists the default directory when the client names none', async () => {
    const response = await call(new RecordingMediator(), { path: '/api/browse' });
    expect(bodyOf(response)).toMatchObject({ path: '/home/dev' });
  });

  it('turns a preview body into a preview query, target and answers intact', async () => {
    const mediator = new RecordingMediator();
    await call(mediator, {
      method: 'POST',
      path: '/api/preview',
      body: JSON.stringify(NEW_PROJECT),
    });
    expect(mediator.dispatched[0]).toEqual({
      kind: 'keel.preview',
      intent: 'query',
      cwd: '/tmp/demo',
      target: { kind: 'new-project', stack: 'ts-cli', buildSystem: 'npm' },
      answers: { 'vcs/git-init': { defaultBranch: 'trunk' } },
    });
  });

  it('turns the same body into a dials query, reading only the target', async () => {
    // One body, three routes. `dials` needs no cwd and no answers, so
    // its schema names neither — and the page still posts the
    // identical object it will preview and install with, which is
    // what stops the three from disagreeing about the target.
    const mediator = new RecordingMediator();
    await call(mediator, {
      method: 'POST',
      path: '/api/dials',
      body: JSON.stringify(NEW_PROJECT),
    });
    expect(mediator.dispatched[0]).toEqual({
      kind: 'keel.dials',
      intent: 'query',
      target: { kind: 'new-project', stack: 'ts-cli', buildSystem: 'npm' },
    });
  });

  it('accepts a dials body carrying nothing but the target', async () => {
    const mediator = new RecordingMediator();
    const response = await call(mediator, {
      method: 'POST',
      path: '/api/dials',
      body: JSON.stringify({ target: { kind: 'new-project', stack: 'ts-cli' } }),
    });
    expect(response.status).toBe(200);
    expect(mediator.dispatched[0]).toMatchObject({ kind: 'keel.dials' });
  });

  it('rejects a dials body with no target at all', async () => {
    const mediator = new RecordingMediator();
    const response = await call(mediator, { method: 'POST', path: '/api/dials', body: '{}' });
    expect(response.status).toBe(400);
    expect(mediator.dispatched).toEqual([]);
  });

  it('turns the same body into the install command, non-interactive and committing', async () => {
    const mediator = new RecordingMediator();
    await call(mediator, {
      method: 'POST',
      path: '/api/install',
      body: JSON.stringify(NEW_PROJECT),
    });
    expect(mediator.dispatched[0]).toEqual({
      kind: 'keel.new-project',
      intent: 'command',
      cwd: '/tmp/demo',
      stack: 'ts-cli',
      buildSystem: 'npm',
      answers: { 'vcs/git-init': { defaultBranch: 'trunk' } },
      interactive: false,
      dryRun: false,
    });
  });

  it('maps each target kind to its own command', async () => {
    const mediator = new RecordingMediator();
    for (const target of [
      { kind: 'add-vertical', vertical: 'ci' },
      { kind: 'add-module', module: 'billing', consumes: 'greeting' },
    ]) {
      await call(mediator, {
        method: 'POST',
        path: '/api/install',
        body: JSON.stringify({ cwd: '/tmp/demo', target, answers: {} }),
      });
    }
    expect(mediator.dispatched.map((action) => action.kind)).toEqual([
      'keel.add-vertical',
      'keel.add-module',
    ]);
    expect(mediator.dispatched[1]).toMatchObject({ module: 'billing', consumes: 'greeting' });
  });

  it('omits an absent optional field rather than sending it as undefined', async () => {
    const mediator = new RecordingMediator();
    await call(mediator, {
      method: 'POST',
      path: '/api/install',
      body: JSON.stringify({
        cwd: '/tmp/demo',
        target: { kind: 'new-project', stack: 'ts-cli' },
        answers: {},
      }),
    });
    // `layout: undefined` and no layout at all mean different things
    // to the handler: the first would have to be given a meaning, the
    // second means "ask, or default".
    expect(Object.keys(mediator.dispatched[0] ?? {})).not.toContain('layout');
  });

  it('rejects a body that is not JSON', async () => {
    const response = await call(new RecordingMediator(), {
      method: 'POST',
      path: '/api/preview',
      body: 'not json at all',
    });
    expect(response.status).toBe(400);
  });

  it('rejects a target the schema does not recognise, naming the field', async () => {
    const response = await call(new RecordingMediator(), {
      method: 'POST',
      path: '/api/preview',
      body: JSON.stringify({ cwd: '/tmp/demo', target: { kind: 'nonsense' }, answers: {} }),
    });
    expect(response.status).toBe(400);
    expect(bodyOf(response).error).toMatchObject({ code: 'keel.web.bad-request' });
    expect(response.body).toContain('target');
  });

  it('rejects an add-module target with an empty name', async () => {
    const mediator = new RecordingMediator();
    const response = await call(mediator, {
      method: 'POST',
      path: '/api/preview',
      body: JSON.stringify({
        cwd: '/tmp/demo',
        target: { kind: 'add-module', module: '' },
        answers: {},
      }),
    });
    expect(response.status).toBe(400);
    expect(mediator.dispatched).toEqual([]);
  });

  it('reports a domain refusal as 422 carrying the domain’s own code', async () => {
    const refusing = new RecordingMediator(
      err(new DomainError("unknown stack 'nope'", 'keel.unknown-stack')),
    );
    const response = await call(refusing, {
      method: 'POST',
      path: '/api/preview',
      body: JSON.stringify(NEW_PROJECT),
    });
    expect(response.status).toBe(422);
    expect(bodyOf(response)).toEqual({
      error: { code: 'keel.unknown-stack', message: "unknown stack 'nope'" },
    });
  });

  it('404s an unknown /api route without dispatching anything', async () => {
    const mediator = new RecordingMediator();
    const response = await call(mediator, { path: '/api/nope' });
    expect(response.status).toBe(404);
    expect(mediator.dispatched).toEqual([]);
  });

  it('404s a known route reached with the wrong method', async () => {
    const response = await call(new RecordingMediator(), {
      method: 'GET',
      path: '/api/install',
    });
    expect(response.status).toBe(404);
  });
});
