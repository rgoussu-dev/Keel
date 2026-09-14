// The injected specification: a farewell use case, dispatched
// through the platform mediator and served over the same transport
// the greeting already uses.
import { afterEach, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createRegistryMediator } from '@acme/platform-kernel';
import { createFarewellHandler, createGreetHandler } from '@acme/greeting';
import { createGreetServer } from '../src/server.ts';

const servers: Server[] = [];

const base = async (): Promise<string> => {
  const server = createGreetServer(
    createRegistryMediator([createGreetHandler(), createFarewellHandler()]),
  );
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no ephemeral port');
  return `http://127.0.0.1:${address.port}`;
};

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

describe('GET /farewell', () => {
  it('composes the farewell for the named addressee', async () => {
    const response = await fetch(`${await base()}/farewell?name=Ada`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ farewell: 'Goodbye, Ada!' });
  });

  it('defaults an absent name to world', async () => {
    const response = await fetch(`${await base()}/farewell`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ farewell: 'Goodbye, world!' });
  });

  it('rejects a blank name as a problem document', async () => {
    const response = await fetch(`${await base()}/farewell?name=%20%20`);
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/problem+json');
  });
});
