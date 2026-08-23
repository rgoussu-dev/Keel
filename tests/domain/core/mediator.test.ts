/**
 * Unit test for the RegistryMediator — routing by `supports()`, the
 * no-handler outcome, and the one thing here that is not pure
 * routing: a thrown `DomainError` normalised onto the `Err` rail.
 *
 * That last one is the seam's promise. `Result` is what the Mediator
 * hands every primary adapter, and a refusal that took the throwing
 * exit out of a handler breaks it — the CLI coped (any throw is a
 * message to a top-level catch), `keel ui` could not, and answered
 * 500 with a bare string for a refusal that had a perfectly good code
 * to give. Scenario: two toy commands plus two that throw; Factory: a
 * mediator over self-declaring handlers; port under test: the
 * kernel's Mediator interface.
 */

import { describe, expect, it } from 'vitest';
import type { Action, Command } from '../../../src/domain/kernel/action.js';
import type { Handler } from '../../../src/domain/kernel/handler.js';
import { DomainError, ok, type Result } from '../../../src/domain/kernel/result.js';
import { RegistryMediator } from '../../../src/domain/core/mediator.js';

interface PingCommand extends Command<string> {
  readonly kind: 'test.ping';
}
interface EchoCommand extends Command<string> {
  readonly kind: 'test.echo';
  readonly payload: string;
}

const ping: PingCommand = { kind: 'test.ping', intent: 'command' };
const echo = (payload: string): EchoCommand => ({ kind: 'test.echo', intent: 'command', payload });

class PingHandler implements Handler<PingCommand> {
  supports(action: Action): action is PingCommand {
    return action.kind === 'test.ping';
  }
  handle(): Promise<Result<string>> {
    return Promise.resolve(ok('pong'));
  }
}

class EchoHandler implements Handler<EchoCommand> {
  supports(action: Action): action is EchoCommand {
    return action.kind === 'test.echo';
  }
  handle(command: EchoCommand): Promise<Result<string>> {
    return Promise.resolve(ok(command.payload));
  }
}

/** A handler whose refusal takes the throwing exit, as the resolver's does. */
class RefusingHandler implements Handler<PingCommand> {
  supports(action: Action): action is PingCommand {
    return action.kind === 'test.ping';
  }
  handle(): Promise<Result<string>> {
    return Promise.reject(new DomainError('cannot be carried here', 'test.refused'));
  }
}

/** A handler with an actual bug in it. Not a refusal, and not ours to dress up. */
class BrokenHandler implements Handler<PingCommand> {
  supports(action: Action): action is PingCommand {
    return action.kind === 'test.ping';
  }
  handle(): Promise<Result<string>> {
    throw new TypeError('undefined is not a function');
  }
}

describe('RegistryMediator', () => {
  it('routes each action to the handler that supports it', async () => {
    const mediator = new RegistryMediator([new PingHandler(), new EchoHandler()]);
    const pong = await mediator.dispatch(ping);
    expect(pong).toEqual({ ok: true, value: 'pong' });
    const echoed = await mediator.dispatch(echo('hello'));
    expect(echoed).toEqual({ ok: true, value: 'hello' });
  });

  it('normalises a thrown DomainError onto the Err rail, code and all', async () => {
    const result = await new RegistryMediator([new RefusingHandler()]).dispatch(ping);
    expect(result).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'test.refused', message: 'cannot be carried here' }),
    });
  });

  it('lets a genuine bug keep throwing — a crash must not read as a refusal', async () => {
    // The kernel's rule, and the line this catch must not cross: an
    // `Err` says "keel considered this and said no", which a
    // TypeError emphatically does not.
    await expect(new RegistryMediator([new BrokenHandler()]).dispatch(ping)).rejects.toBeInstanceOf(
      TypeError,
    );
  });

  it('returns kernel.no-handler for an unsupported action', async () => {
    const mediator = new RegistryMediator([new PingHandler()]);
    const result = await mediator.dispatch(echo('lost'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('kernel.no-handler');
      expect(result.error.message).toContain('test.echo');
    }
  });
});
