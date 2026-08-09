import type { Greeting } from '../greet';

/**
 * Driven port to the backend greeting API. The domain publishes what
 * the gateway returns; the transport (fetch, base URL, error shape)
 * is the adapter's business — this interface is DOM-free so the
 * domain keeps compiling without the browser.
 */
export interface GreetGateway {
  /**
   * Fetches the greeting for `name` from the backend. An empty name
   * defers to the backend's own fallback.
   */
  fetchGreeting(name: string): Promise<Greeting>;
}
