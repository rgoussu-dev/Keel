import { describe, expect, it } from 'vitest';
import { createFakeUnitOfWork } from '../src/index.ts';

describe('fake unit of work', () => {
  it('counts completed blocks as committed', async () => {
    const unitOfWork = createFakeUnitOfWork();

    await expect(unitOfWork.inTransaction(() => Promise.resolve('done'))).resolves.toBe('done');

    expect(unitOfWork.committed()).toBe(1);
    expect(unitOfWork.rolledBack()).toBe(0);
  });

  it('counts rejected blocks as rolled back and rethrows', async () => {
    const unitOfWork = createFakeUnitOfWork();

    await expect(unitOfWork.inTransaction(() => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );

    expect(unitOfWork.committed()).toBe(0);
    expect(unitOfWork.rolledBack()).toBe(1);
  });
});
