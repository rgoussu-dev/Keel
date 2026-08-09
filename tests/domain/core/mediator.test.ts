/**
 * Unit test for the RegistryMediator — routing by `supports()` and
 * the no-handler outcome. Scenario: two toy commands; Factory: a
 * mediator over two self-declaring handlers; port under test: the
 * kernel's Mediator interface.
 */

import { describe, expect, it } from 'vitest';
import type { Action, Command } from '../../../src/domain/kernel/action.js';
import type { Handler } from '../../../src/domain/kernel/handler.js';
import { ok, type Result } from '../../../src/domain/kernel/result.js';
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

describe('RegistryMediator', () => {
  it('routes each action to the handler that supports it', async () => {
    const mediator = new RegistryMediator([new PingHandler(), new EchoHandler()]);
    const pong = await mediator.dispatch(ping);
    expect(pong).toEqual({ ok: true, value: 'pong' });
    const echoed = await mediator.dispatch(echo('hello'));
    expect(echoed).toEqual({ ok: true, value: 'hello' });
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
