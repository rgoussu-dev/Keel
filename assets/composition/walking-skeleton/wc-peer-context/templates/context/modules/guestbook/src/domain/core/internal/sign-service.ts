import type { Sign, SignCommand, Welcome } from '../../contract/index';
import type { EntryStore } from './entry-store';

/**
 * Factory for the sign driving port.
 *
 * The Welcome port is a parameter rather than something this factory
 * builds: which adapter satisfies it is the assembly's decision, and
 * the only adapter that does happens to reach another bounded
 * context. Nothing here knows that.
 */
export function createSign(entries: EntryStore, welcome: Welcome): Sign {
  return {
    execute(command: SignCommand): void {
      const visitor = command.visitor.trim();
      if (visitor === '') return;
      const words = welcome.welcomeFor(visitor);
      if (words === null) return;
      entries.publish({ visitor, welcome: words });
    },
  };
}
