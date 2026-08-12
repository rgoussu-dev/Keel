import { describe, expect, it } from 'vitest';
import { createFakeGreetingLog } from '../src/index.ts';

const AT = new Date('2026-01-01T12:00:00Z');

describe('fake greeting log', () => {
  it('assigns increasing ids', async () => {
    const log = createFakeGreetingLog();

    expect((await log.append('Ada', AT)).id).toBe(1);
    expect((await log.append('Grace', AT)).id).toBe(2);
  });

  it('reads back most recent first within the limit', async () => {
    const log = createFakeGreetingLog();
    await log.append('Ada', AT);
    await log.append('Grace', AT);
    await log.append('Linus', AT);

    const recent = await log.recent(2);

    expect(recent.map((r) => r.name)).toEqual(['Linus', 'Grace']);
  });

  it('tolerates an empty log and non-positive limits', async () => {
    const log = createFakeGreetingLog();

    expect(await log.recent(10)).toEqual([]);
    await log.append('Ada', AT);
    expect(await log.recent(0)).toEqual([]);
  });
});
