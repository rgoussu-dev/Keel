import { describe, expect, it } from 'vitest';
import { FakeLogger } from '../../../src/infrastructure/commons/fake-logger.js';
import { ActionError, runActions } from '../../../src/domain/core/actions.js';
import { FakeProcessRunner } from '../../../src/infrastructure/process/fake.js';
import type { DeferredAction } from '../../../src/domain/contract/composition.js';

const recordingLogger = (): {
  logger: FakeLogger;
  lines: string[];
} => {
  const lines: string[] = [];
  return {
    logger: {
      info: (m: string) => lines.push(`info ${m}`),
      success: (m: string) => lines.push(`ok ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`err ${m}`),
      debug: () => {},
    },
    lines,
  };
};

const action = (id: string, run: () => Promise<void>): DeferredAction => ({
  id,
  description: id,
  run,
});

describe('runActions', () => {
  it('runs every action in order when not dry-run', async () => {
    const order: string[] = [];
    const actions: DeferredAction[] = [
      action('a', async () => {
        order.push('a');
      }),
      action('b', async () => {
        order.push('b');
      }),
    ];
    await runActions({
      actions,
      cwd: '/tmp',
      logger: new FakeLogger(),
      processes: new FakeProcessRunner(),
      dryRun: false,
    });
    expect(order).toEqual(['a', 'b']);
  });

  it('skips action.run in dry-run and logs the description', async () => {
    const { logger, lines } = recordingLogger();
    let ran = false;
    const actions: DeferredAction[] = [
      action('a', async () => {
        ran = true;
      }),
    ];
    await runActions({
      actions,
      cwd: '/tmp',
      logger,
      processes: new FakeProcessRunner(),
      dryRun: true,
    });
    expect(ran).toBe(false);
    expect(lines).toEqual(['info would: a']);
  });

  it('wraps thrown errors in ActionError with the offending id', async () => {
    const actions: DeferredAction[] = [
      action('boom', async () => {
        throw new Error('kaboom');
      }),
    ];
    const promise = runActions({
      actions,
      cwd: '/tmp',
      logger: new FakeLogger(),
      processes: new FakeProcessRunner(),
      dryRun: false,
    });
    await expect(promise).rejects.toBeInstanceOf(ActionError);
    await expect(promise).rejects.toMatchObject({ actionId: 'boom' });
  });

  it('stops after the first failure — subsequent actions do not run', async () => {
    let bRan = false;
    const actions: DeferredAction[] = [
      action('a', async () => {
        throw new Error('nope');
      }),
      action('b', async () => {
        bRan = true;
      }),
    ];
    await expect(
      runActions({
        actions,
        cwd: '/tmp',
        logger: new FakeLogger(),
        processes: new FakeProcessRunner(),
        dryRun: false,
      }),
    ).rejects.toBeInstanceOf(ActionError);
    expect(bRan).toBe(false);
  });
});
