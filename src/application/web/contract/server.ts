/**
 * The `keel ui` server as the CLI sees it — a function that starts
 * something and hands back a URL and a way to stop.
 *
 * It is a type and nothing else, and that is deliberate. `keel ui` is
 * a subcommand of the commander program, but `application/cli/contract`
 * may not touch `infrastructure` or `domain/core` — so it cannot
 * import a server that binds a socket and wires handlers. It imports
 * this shape instead, and the composition root supplies the real one,
 * exactly as it supplies the Mediator.
 */

/** How the server is to be started. */
export interface UiServerOptions {
  /** Loopback interface to bind. */
  readonly host: string;
  /** Port to bind; 0 asks the OS for a free one. */
  readonly port: number;
  /** Directory the picker opens on — normally the CLI's cwd. */
  readonly cwd: string;
}

/** A running `keel ui` server. */
export interface UiServer {
  /** The URL to open, token included. */
  readonly url: string;
  /** Resolves when the server has stopped for any reason. */
  readonly closed: Promise<void>;
  /** Stops accepting connections and resolves once closed. */
  close(): Promise<void>;
}

/** Starts the local UI server. Supplied by the composition root. */
export type ServeUi = (options: UiServerOptions) => Promise<UiServer>;
