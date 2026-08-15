/**
 * The WCCG Context community protocol, owned by this workspace — the
 * whole wiring mechanism. Consumers dispatch a composed, bubbling
 * `context-request` event carrying a typed key and a callback; the
 * first provider that recognises the key stops propagation and
 * answers synchronously. Built from baseline DOM events only, and
 * interoperable by design with outside implementations.
 */

/** A typed context key. `T` is the port type the key delivers. */
export interface Context<T> {
  readonly name: string;
}

/** Creates a typed context key under a unique name. */
export const createContext = <T>(name: string): Context<T> => ({ name });

/**
 * The protocol's request event. Dispatch from an element (typically
 * in `connectedCallback`); a present provider invokes `callback`
 * synchronously, so absence is detectable immediately — request,
 * then throw loudly if the port field is still empty.
 */
export class ContextRequestEvent<T> extends Event {
  constructor(
    readonly context: Context<T>,
    readonly callback: (value: T) => void,
  ) {
    super('context-request', { bubbles: true, composed: true });
  }
}
