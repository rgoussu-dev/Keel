import type { EntriesReadModel, Entry, Unsubscribe } from '../../contract/index';

/**
 * The write side of the entries read model — held by the domain,
 * handed to services; the driving side only ever sees the
 * {@link EntriesReadModel} face.
 */
export interface EntryStore extends EntriesReadModel {
  /** Records an entry and notifies every subscriber. */
  publish(entry: Entry): void;
}

/** Creates the in-memory store backing the entries read model. */
export function createEntryStore(): EntryStore {
  let current: Entry | null = null;
  const listeners = new Set<(entry: Entry) => void>();
  return {
    latest: () => current,
    subscribe(listener: (entry: Entry) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    publish(entry: Entry): void {
      current = entry;
      for (const listener of listeners) listener(entry);
    },
  };
}
