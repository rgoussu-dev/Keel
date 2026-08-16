import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { createEntryStore, createSign, type Welcome } from '../src/index';

/** The canonical fake of the Welcome driven port. */
const welcoming = (words: string | null): Welcome => ({ welcomeFor: () => words });

describe('sign', () => {
  it('records the visitor with the welcome it obtained', () => {
    const entries = createEntryStore();

    createSign(entries, welcoming('Hello, Ada!')).execute({ visitor: '  Ada  ' });

    assert.deepEqual(entries.latest(), { visitor: 'Ada', welcome: 'Hello, Ada!' });
  });

  it('records nothing for an anonymous visitor, and does not ask', () => {
    const entries = createEntryStore();
    let asked = false;
    const port: Welcome = {
      welcomeFor: () => {
        asked = true;
        return 'should not be asked';
      },
    };

    createSign(entries, port).execute({ visitor: '   ' });

    assert.equal(entries.latest(), null);
    assert.equal(asked, false);
  });

  it('records nothing when no welcome could be obtained', () => {
    const entries = createEntryStore();

    createSign(entries, welcoming(null)).execute({ visitor: 'Ada' });

    assert.equal(entries.latest(), null);
  });

  it('notifies subscribers of each new entry', () => {
    const entries = createEntryStore();
    const seen: string[] = [];
    entries.subscribe((entry) => seen.push(entry.welcome));

    createSign(entries, welcoming('Hello, Ada!')).execute({ visitor: 'Ada' });

    assert.deepEqual(seen, ['Hello, Ada!']);
  });
});
